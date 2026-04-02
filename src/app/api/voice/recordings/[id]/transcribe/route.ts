import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceRecordings, userSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

const VOICE_DIR = path.join(process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : "data", "voice");

async function getWhisperUrl(userId: string): Promise<string | null> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  return settings?.whisperEndpointUrl || process.env.WHISPER_URL || null;
}

async function tryTranscribe(baseUrl: string, fileBuffer: Buffer, filename: string): Promise<Response> {
  const timeout = 5 * 60 * 1000;
  const uint8 = new Uint8Array(fileBuffer);

  const attempts = [
    () => {
      const form = new FormData();
      form.append("file", new Blob([uint8]), filename);
      return fetch(`${baseUrl}/transcribe`, { method: "POST", body: form, signal: AbortSignal.timeout(timeout) });
    },
    () => {
      const form = new FormData();
      form.append("audio_file", new Blob([uint8]), filename);
      return fetch(`${baseUrl}/asr?task=transcribe&output=json`, { method: "POST", body: form, signal: AbortSignal.timeout(timeout) });
    },
    () => {
      const form = new FormData();
      form.append("file", new Blob([uint8]), filename);
      form.append("model", "whisper-1");
      return fetch(`${baseUrl}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(timeout) });
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) continue;
      return res;
    } catch {}
  }

  throw new Error("Transcription failed");
}

// POST /api/voice/recordings/[id]/transcribe — transcribe an existing saved recording
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const recording = await db.query.voiceRecordings.findFirst({
    where: and(eq(voiceRecordings.id, id), eq(voiceRecordings.userId, session.user.id)),
  });
  if (!recording) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const whisperUrl = await getWhisperUrl(session.user.id);
  if (!whisperUrl) {
    return NextResponse.json({ error: "Whisper not configured. Add the endpoint URL in Settings." }, { status: 503 });
  }

  const filePath = path.join(VOICE_DIR, recording.audioPath);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Audio file not found on disk" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  let whisperRes: Response;
  try {
    whisperRes = await tryTranscribe(whisperUrl, fileBuffer, recording.audioPath);
  } catch {
    return NextResponse.json({ error: "Whisper service unavailable" }, { status: 503 });
  }

  let result;
  try {
    result = await whisperRes.json();
  } catch {
    return NextResponse.json({ error: "Invalid response from Whisper" }, { status: 502 });
  }

  const text = result.text || result.transcript || "";
  if (!text) {
    return NextResponse.json({ error: "Empty transcription" }, { status: 502 });
  }

  // Update the recording with transcription
  await db.update(voiceRecordings)
    .set({ transcription: text })
    .where(eq(voiceRecordings.id, id));

  return NextResponse.json({ text });
}
