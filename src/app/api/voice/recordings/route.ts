import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceRecordings, entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

const VOICE_DIR = path.join(process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : "data", "voice");

function ensureVoiceDir() {
  if (!fs.existsSync(VOICE_DIR)) {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
  }
}

// GET /api/voice/recordings?entryId=xxx — list recordings for an entry
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entryId = new URL(request.url).searchParams.get("entryId");
  if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

  // Verify entry belongs to user
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, entryId), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recordings = await db.query.voiceRecordings.findMany({
    where: and(eq(voiceRecordings.entryId, entryId), eq(voiceRecordings.userId, session.user.id)),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    columns: {
      id: true,
      transcription: true,
      duration: true,
      createdAt: true,
    },
  });

  return NextResponse.json(recordings);
}

// POST /api/voice/recordings — save a recording
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const entryId = formData.get("entryId") as string | null;
  const transcription = formData.get("transcription") as string | null;
  const duration = formData.get("duration") as string | null;

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }
  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  // 50MB limit
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum 50MB." }, { status: 413 });
  }

  // Verify entry belongs to user
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, entryId), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  ensureVoiceDir();

  const id = nanoid();
  const ext = file.type.includes("webm") ? "webm" : "ogg";
  const filename = `${id}.${ext}`;
  const filePath = path.join(VOICE_DIR, filename);

  // Write file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Save to database
  await db.insert(voiceRecordings).values({
    id,
    entryId,
    userId: session.user.id,
    audioPath: filename,
    transcription: transcription || null,
    duration: duration ? parseFloat(duration) : null,
    createdAt: new Date(),
  });

  return NextResponse.json({
    id,
    transcription,
    duration: duration ? parseFloat(duration) : null,
    createdAt: new Date().toISOString(),
  }, { status: 201 });
}
