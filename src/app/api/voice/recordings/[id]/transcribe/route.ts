import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceRecordings, userSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { VOICE_DIR } from "@/lib/constants";

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
    } catch (err) {
      console.error("[Voice] Transcription attempt failed:", err instanceof Error ? err.message : err);
    }
  }

  throw new Error("Transcription failed — all API formats returned empty or errored");
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

  // Already transcribed — return existing unless force re-transcribe
  const force = new URL(request.url).searchParams.get("force") === "true";
  if (recording.transcription && !force) {
    return NextResponse.json({ text: recording.transcription });
  }

  // Cancel any pending background transcription tasks for this recording
  const { processingTasks } = await import("@/lib/db/schema");
  const { or } = await import("drizzle-orm");
  await db.update(processingTasks)
    .set({ status: "failed", errorMessage: "Manual transcription triggered", updatedAt: new Date() })
    .where(and(
      eq(processingTasks.recordingId, id),
      or(eq(processingTasks.status, "pending"), eq(processingTasks.status, "running"))
    ));

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
  } catch (err) {
    console.error("[Voice] Whisper service error:", err instanceof Error ? err.message : err);
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

  // LLM cleanup
  let cleanedText = text;
  try {
    const { getAIConfig } = await import("@/lib/ai/config");
    const { chatCompletion } = await import("@/lib/ai/client");
    const { transcriptionCleanupPrompt } = await import("@/lib/ai/prompts");
    const config = await getAIConfig(session.user.id);
    const messages = transcriptionCleanupPrompt(text);
    const response = await chatCompletion(config, messages, { temperature: 0.1, maxTokens: 2048 });
    if (response.content?.trim()) cleanedText = response.content.trim();
  } catch (err) {
    console.error("[Voice] Transcription cleanup failed, using raw text:", err instanceof Error ? err.message : err);
  }

  // Update the recording with cleaned transcription
  await db.update(voiceRecordings)
    .set({ transcription: cleanedText })
    .where(eq(voiceRecordings.id, id));

  // Append transcription to entry content with recording ID marker
  if (recording.entryId) {
    const { entries } = await import("@/lib/db/schema");
    const { wrapTranscription, replaceTranscriptionInContent } = await import("@/lib/transcription");
    const entry = await db.query.entries.findFirst({ where: eq(entries.id, recording.entryId) });
    if (entry) {
      // If re-transcribing, replace existing marker; otherwise append
      let newContent = replaceTranscriptionInContent(entry.content || "", id, cleanedText);
      if (newContent === null) {
        const wrapped = wrapTranscription(id, cleanedText);
        newContent = entry.content ? `${entry.content}${wrapped}` : wrapped;
      }
      await db.update(entries)
        .set({ content: newContent, updatedAt: new Date() })
        .where(eq(entries.id, recording.entryId));

      // Queue background processing
      const { queueEntryTasks, processQueue } = await import("@/lib/processing/runner");
      queueEntryTasks(session.user.id, recording.entryId, newContent)
        .then(() => processQueue(session.user.id))
        .catch((err) => console.error("[Processing]", err));
    }
  }

  return NextResponse.json({ text: cleanedText });
}
