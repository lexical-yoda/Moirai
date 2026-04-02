import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceRecordings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { VOICE_DIR } from "@/lib/constants";

// DELETE /api/voice/recordings/[id]
export async function DELETE(
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

  // Delete from database first, then clean up file
  await db.delete(voiceRecordings).where(eq(voiceRecordings.id, id));

  const filePath = path.join(VOICE_DIR, recording.audioPath);
  try { fs.unlinkSync(filePath); } catch (err) {
    console.warn("[Voice] Failed to delete file:", filePath, err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ success: true });
}
