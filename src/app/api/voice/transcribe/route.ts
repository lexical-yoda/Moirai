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

  const whisperForm = new FormData();
  whisperForm.append("file", file);

  let whisperRes: Response;
  try {
    whisperRes = await fetch(`${whisperUrl}/transcribe`, {
      method: "POST",
      body: whisperForm,
    });
  } catch {
    return NextResponse.json(
      { error: "Whisper service unavailable. Check the endpoint in Settings." },
      { status: 503 }
    );
  }

  if (!whisperRes.ok) {
    const errorData = await whisperRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: errorData.error || "Transcription failed" },
      { status: whisperRes.status }
    );
  }

  let result;
  try {
    result = await whisperRes.json();
  } catch {
    return NextResponse.json({ error: "Invalid response from Whisper service" }, { status: 502 });
  }

  if (!result.text) {
    return NextResponse.json(
      { error: "Invalid transcription response from Whisper service" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    text: result.text,
    language: result.language || "unknown",
    duration: result.duration || 0,
  });
}
