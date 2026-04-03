import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { therapyItems, entries } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/api-utils";

// GET /api/therapy — list therapy items, filtered by status and/or entryId
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const entryId = url.searchParams.get("entryId");
  const type = url.searchParams.get("type");

  let where = eq(therapyItems.userId, session.user.id);
  if (status && ["pending", "discussed", "resolved"].includes(status)) {
    where = and(where, eq(therapyItems.status, status))!;
  }
  if (entryId) {
    where = and(where, eq(therapyItems.entryId, entryId))!;
  }
  if (type && ["topic", "takeaway"].includes(type)) {
    where = and(where, eq(therapyItems.type, type))!;
  }

  const items = await db.query.therapyItems.findMany({
    where,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  // Resolve entry dates for source and session links
  const entryIds = new Set<string>();
  for (const item of items) {
    entryIds.add(item.entryId);
    if (item.sessionEntryId) entryIds.add(item.sessionEntryId);
  }

  const entryDates = new Map<string, string>();
  if (entryIds.size > 0) {
    const entryRows = await db.query.entries.findMany({
      where: and(eq(entries.userId, session.user.id), inArray(entries.id, [...entryIds])),
      columns: { id: true, date: true },
    });
    for (const row of entryRows) {
      entryDates.set(row.id, row.date);
    }
  }

  const enriched = items.map((item) => ({
    ...item,
    entryDate: entryDates.get(item.entryId) || null,
    sessionEntryDate: item.sessionEntryId ? entryDates.get(item.sessionEntryId) || null : null,
  }));

  return NextResponse.json(enriched);
}

// POST /api/therapy — manually add a therapy item
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const data = jsonResult.data as { entryId?: string; description?: string; type?: string; priority?: string };

  if (!data.entryId || !data.description?.trim()) {
    return NextResponse.json({ error: "entryId and description required" }, { status: 400 });
  }

  // Verify entry belongs to user
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, data.entryId), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const now = new Date();
  const id = nanoid();
  const type = data.type === "takeaway" ? "takeaway" : "topic";
  const priority = ["high", "medium", "low"].includes(data.priority || "") ? data.priority! : "medium";

  await db.insert(therapyItems).values({
    id,
    userId: session.user.id,
    entryId: data.entryId,
    description: data.description.trim().slice(0, 1000),
    type,
    priority,
    status: type === "takeaway" ? "resolved" : "pending",
    sessionEntryId: null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.therapyItems.findFirst({ where: eq(therapyItems.id, id) });
  return NextResponse.json(created, { status: 201 });
}
