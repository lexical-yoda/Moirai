import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api-utils";

// PUT /api/activities/[id] — update an activity
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, session.user.id)),
  });
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const { name, emoji, type, active, sortOrder } = jsonResult.data as {
    name?: string; emoji?: string; type?: string; active?: boolean; sortOrder?: number;
  };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (emoji !== undefined) updates.emoji = emoji;
  if (type !== undefined && ["good", "bad"].includes(type)) updates.type = type;
  if (active !== undefined) updates.active = active;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.update(activities).set(updates).where(eq(activities.id, id));
  const updated = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  return NextResponse.json(updated);
}

// DELETE /api/activities/[id] — delete an activity
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, session.user.id)),
  });
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(activities).where(eq(activities.id, id));
  return NextResponse.json({ success: true });
}
