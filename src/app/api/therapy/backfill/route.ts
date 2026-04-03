import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries, therapyItems, processingTasks } from "@/lib/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { queueTask, processQueue } from "@/lib/processing/runner";

// GET /api/therapy/backfill — stats on unprocessed entries
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all entries with meaningful content
  const allEntries = await db.query.entries.findMany({
    where: eq(entries.userId, session.user.id),
    columns: { id: true, date: true, wordCount: true },
  });

  // Get entry IDs that already have therapy items
  const processedEntryIds = new Set(
    (await db.query.therapyItems.findMany({
      where: eq(therapyItems.userId, session.user.id),
      columns: { entryId: true },
    })).map((t) => t.entryId)
  );

  // Also check for pending/running therapy tasks already queued
  const queuedEntryIds = new Set(
    (await db.query.processingTasks.findMany({
      where: and(
        eq(processingTasks.userId, session.user.id),
        eq(processingTasks.type, "therapy"),
        eq(processingTasks.status, "pending")
      ),
      columns: { entryId: true },
    })).filter((t) => t.entryId).map((t) => t.entryId!)
  );

  const unprocessed = allEntries.filter((e) =>
    !processedEntryIds.has(e.id) &&
    !queuedEntryIds.has(e.id) &&
    (e.wordCount || 0) >= 20
  );

  const totalWords = unprocessed.reduce((sum, e) => sum + (e.wordCount || 0), 0);
  const oldestDate = unprocessed.length > 0
    ? unprocessed.reduce((oldest, e) => e.date < oldest ? e.date : oldest, unprocessed[0].date)
    : null;
  const newestDate = unprocessed.length > 0
    ? unprocessed.reduce((newest, e) => e.date > newest ? e.date : newest, unprocessed[0].date)
    : null;

  return NextResponse.json({
    unprocessedCount: unprocessed.length,
    totalEntries: allEntries.length,
    processedCount: processedEntryIds.size,
    queuedCount: queuedEntryIds.size,
    totalWords,
    oldestDate,
    newestDate,
  });
}

// POST /api/therapy/backfill — queue therapy extraction for unprocessed entries
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all entries with meaningful content
  const allEntries = await db.query.entries.findMany({
    where: eq(entries.userId, session.user.id),
    columns: { id: true, wordCount: true },
    orderBy: (e, { asc }) => [asc(e.date)],
  });

  // Get entry IDs that already have therapy items
  const processedEntryIds = new Set(
    (await db.query.therapyItems.findMany({
      where: eq(therapyItems.userId, session.user.id),
      columns: { entryId: true },
    })).map((t) => t.entryId)
  );

  // Get already queued
  const queuedEntryIds = new Set(
    (await db.query.processingTasks.findMany({
      where: and(
        eq(processingTasks.userId, session.user.id),
        eq(processingTasks.type, "therapy"),
        eq(processingTasks.status, "pending")
      ),
      columns: { entryId: true },
    })).filter((t) => t.entryId).map((t) => t.entryId!)
  );

  const toProcess = allEntries.filter((e) =>
    !processedEntryIds.has(e.id) &&
    !queuedEntryIds.has(e.id) &&
    (e.wordCount || 0) >= 20
  );

  if (toProcess.length === 0) {
    return NextResponse.json({ queued: 0, message: "All entries already processed" });
  }

  // Queue therapy tasks for each unprocessed entry
  let queued = 0;
  for (const entry of toProcess) {
    await queueTask(session.user.id, entry.id, "therapy");
    queued++;
  }

  // Fire-and-forget — process sequentially in background
  processQueue(session.user.id).catch((err) =>
    console.error("[Therapy Backfill] Queue processing error:", err)
  );

  console.log(`[Therapy Backfill] Queued ${queued} entries for user ${session.user.id}`);

  return NextResponse.json({ queued, message: `Queued ${queued} entries for therapy scanning` }, { status: 202 });
}
