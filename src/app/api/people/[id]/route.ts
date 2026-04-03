import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api-utils";
import { safeJsonParse } from "@/lib/json";

// PUT /api/people/[id] — update a person
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), eq(people.userId, session.user.id)),
  });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const data = jsonResult.data as { name?: string; aliases?: string[]; relationship?: string; notes?: string };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name && typeof data.name === "string") updates.name = data.name.trim();
  if (Array.isArray(data.aliases)) {
    updates.aliases = JSON.stringify(data.aliases.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim().toLowerCase()));
  }
  if (data.relationship !== undefined) updates.relationship = data.relationship || null;
  if (data.notes !== undefined) updates.notes = data.notes || null;

  await db.update(people).set(updates).where(eq(people.id, id));

  const updated = await db.query.people.findFirst({ where: eq(people.id, id) });
  return NextResponse.json({ ...updated, aliases: safeJsonParse(updated?.aliases || "[]", []) });
}

// DELETE /api/people/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), eq(people.userId, session.user.id)),
  });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(people).where(eq(people.id, id));
  return NextResponse.json({ success: true });
}
