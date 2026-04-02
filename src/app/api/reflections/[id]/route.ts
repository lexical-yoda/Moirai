import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reflections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { safeJsonParse } from "@/lib/json";

// GET /api/reflections/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const reflection = await db.query.reflections.findFirst({
    where: and(eq(reflections.id, id), eq(reflections.userId, session.user.id)),
  });

  if (!reflection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...reflection,
    themes: safeJsonParse(reflection.themes, []),
    keyInsights: safeJsonParse(reflection.keyInsights, []),
    entryIds: safeJsonParse(reflection.entryIds, []),
  });
}

// DELETE /api/reflections/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const reflection = await db.query.reflections.findFirst({
    where: and(eq(reflections.id, id), eq(reflections.userId, session.user.id)),
  });

  if (!reflection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(reflections).where(eq(reflections.id, id));
  return NextResponse.json({ success: true });
}
