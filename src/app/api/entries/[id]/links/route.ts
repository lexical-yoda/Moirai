import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries, entryLinks } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/api-utils";

// GET /api/entries/[id]/links — get all linked entries (bi-directional)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get all links where this entry is source or target
  const links = await db.query.entryLinks.findMany({
    where: and(
      eq(entryLinks.userId, session.user.id),
      or(eq(entryLinks.sourceEntryId, id), eq(entryLinks.targetEntryId, id))
    ),
  });

  // Get the "other" entry for each link
  const linkedEntryIds = links.map((l) => l.sourceEntryId === id ? l.targetEntryId : l.sourceEntryId);
  const linkedEntries = [];

  for (const linkedId of linkedEntryIds) {
    const e = await db.query.entries.findFirst({
      where: and(eq(entries.id, linkedId), eq(entries.userId, session.user.id)),
      columns: { id: true, date: true, title: true, wordCount: true },
    });
    if (e) {
      const link = links.find((l) =>
        (l.sourceEntryId === id && l.targetEntryId === linkedId) ||
        (l.targetEntryId === id && l.sourceEntryId === linkedId)
      );
      linkedEntries.push({ ...e, linkId: link?.id });
    }
  }

  return NextResponse.json(linkedEntries);
}

// POST /api/entries/[id]/links — link to another entry by date
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const { targetDate } = jsonResult.data as { targetDate?: string };

  if (!targetDate) return NextResponse.json({ error: "targetDate required" }, { status: 400 });

  // Verify source entry belongs to user
  const sourceEntry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!sourceEntry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  // Find target entry by date
  const targetEntry = await db.query.entries.findFirst({
    where: and(eq(entries.date, targetDate), eq(entries.userId, session.user.id)),
  });
  if (!targetEntry) return NextResponse.json({ error: "No entry found for that date" }, { status: 404 });

  if (targetEntry.id === id) return NextResponse.json({ error: "Cannot link entry to itself" }, { status: 400 });

  // Check if link already exists (either direction)
  const existing = await db.query.entryLinks.findFirst({
    where: and(
      eq(entryLinks.userId, session.user.id),
      or(
        and(eq(entryLinks.sourceEntryId, id), eq(entryLinks.targetEntryId, targetEntry.id)),
        and(eq(entryLinks.sourceEntryId, targetEntry.id), eq(entryLinks.targetEntryId, id))
      )
    ),
  });
  if (existing) return NextResponse.json({ error: "Already linked" }, { status: 409 });

  const linkId = nanoid();
  await db.insert(entryLinks).values({
    id: linkId,
    sourceEntryId: id,
    targetEntryId: targetEntry.id,
    userId: session.user.id,
    createdAt: new Date(),
  });

  return NextResponse.json({
    linkId,
    id: targetEntry.id,
    date: targetEntry.date,
    title: targetEntry.title,
    wordCount: targetEntry.wordCount,
  }, { status: 201 });
}

// DELETE /api/entries/[id]/links — remove a link
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const { linkId } = jsonResult.data as { linkId?: string };

  if (!linkId) return NextResponse.json({ error: "linkId required" }, { status: 400 });

  const link = await db.query.entryLinks.findFirst({
    where: and(eq(entryLinks.id, linkId), eq(entryLinks.userId, session.user.id)),
  });
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  await db.delete(entryLinks).where(eq(entryLinks.id, linkId));
  return NextResponse.json({ success: true });
}
