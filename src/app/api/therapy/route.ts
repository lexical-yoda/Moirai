import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { therapyItems, entries } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/therapy — list therapy items, optionally filtered by status
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = new URL(request.url).searchParams.get("status");

  let where = eq(therapyItems.userId, session.user.id);
  if (status && ["pending", "discussed", "resolved"].includes(status)) {
    where = and(where, eq(therapyItems.status, status))!;
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
