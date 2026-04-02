import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

async function getWhisperUrl(userId: string): Promise<string | null> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  return settings?.whisperEndpointUrl || process.env.WHISPER_URL || null;
}

/**
 * Try multiple Whisper API formats to support different servers:
 * 1. Custom sidecar: POST /transcribe (file in form)
 * 2. OpenAI-compatible: POST /v1/audio/transcriptions (file + model in form)
 * 3. whisper-asr-webservice: POST /asr?task=transcribe (audio_file in form)
 */
async function tryTranscribe(baseUrl: string, file: Blob): Promise<Response> {
  // Try custom sidecar format first
  const form1 = new FormData();
  form1.append("file", file);
  try {
    const res = await fetch(`${baseUrl}/transcribe`, { method: "POST", body: form1 });
    if (res.ok) return res;
  } catch {}

  // Try whisper-asr-webservice format
  const form2 = new FormData();
  form2.append("audio_file", file);
  try {
    const res = await fetch(`${baseUrl}/asr?task=transcribe&output=json`, { method: "POST", body: form2 });
    if (res.ok) return res;
  } catch {}

  // Try OpenAI format
  const form3 = new FormData();
  form3.append("file", file);
  form3.append("model", "whisper-1");
  try {
    const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, { method: "POST", body: form3 });
    if (res.ok) return res;
  } catch {}

  throw new Error("All Whisper API formats failed");
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const whisperUrl = await getWhisperUrl(session.user.id);
  if (!whisperUrl) {
    return NextResponse.json(
      { error: "Whisper not configured. Add the endpoint URL in Settings." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 50MB." }, { status: 413 });
  }

  let whisperRes: Response;
  try {
    whisperRes = await tryTranscribe(whisperUrl, file);
  } catch {
    return NextResponse.json(
      { error: "Whisper service unavailable. Check the endpoint in Settings." },
      { status: 503 }
    );
  }

  let result;
  try {
    result = await whisperRes.json();
  } catch {
    // Some servers return plain text
    const text = await whisperRes.text().catch(() => "");
    if (text) return NextResponse.json({ text, language: "unknown", duration: 0 });
    return NextResponse.json({ error: "Invalid response from Whisper service" }, { status: 502 });
  }

  // Handle different response formats
  const text = result.text || result.transcript || "";
  if (!text) {
    return NextResponse.json(
      { error: "Empty transcription from Whisper service" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    text,
    language: result.language || "unknown",
    duration: result.duration || 0,
  });
}
