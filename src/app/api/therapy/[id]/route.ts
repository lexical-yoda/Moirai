import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { therapyItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api-utils";
import { therapyItemUpdateSchema, parseBody } from "@/lib/validation";

// PUT /api/therapy/[id] — update a therapy item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const item = await db.query.therapyItems.findFirst({
    where: and(eq(therapyItems.id, id), eq(therapyItems.userId, session.user.id)),
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(therapyItemUpdateSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.description) updates.description = data.description;
  if (data.priority) updates.priority = data.priority;
  if (data.status) updates.status = data.status;

  await db.update(therapyItems).set(updates).where(eq(therapyItems.id, id));

  const updated = await db.query.therapyItems.findFirst({ where: eq(therapyItems.id, id) });
  return NextResponse.json(updated);
}

// DELETE /api/therapy/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const item = await db.query.therapyItems.findFirst({
    where: and(eq(therapyItems.id, id), eq(therapyItems.userId, session.user.id)),
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(therapyItems).where(eq(therapyItems.id, id));
  return NextResponse.json({ success: true });
}
