import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceRecordings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { VOICE_DIR } from "@/lib/constants";

// GET /api/voice/file/[id] — serve audio file
export async function GET(
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

  const filePath = path.join(VOICE_DIR, recording.audioPath);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const extMap: Record<string, string> = {
    ".webm": "audio/webm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg",
    ".wav": "audio/wav", ".m4a": "audio/mp4", ".flac": "audio/flac",
    ".opus": "audio/opus", ".aac": "audio/aac", ".wma": "audio/x-ms-wma",
  };
  const ext = path.extname(recording.audioPath).toLowerCase();
  const contentType = extMap[ext] || "audio/webm";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
