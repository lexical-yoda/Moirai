import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLogs, activities } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/api-utils";
import { activityLogSchema, parseBody } from "@/lib/validation";

// GET /api/activities/logs?date=YYYY-MM-DD or ?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (date) {
    // Single day — return logs for that date
    const logs = await db.query.activityLogs.findMany({
      where: and(eq(activityLogs.userId, session.user.id), eq(activityLogs.date, date)),
    });
    return NextResponse.json(logs);
  }

  if (from && to) {
    // Date range — return all logs in range
    const logs = await db.query.activityLogs.findMany({
      where: and(
        eq(activityLogs.userId, session.user.id),
        gte(activityLogs.date, from),
        lte(activityLogs.date, to)
      ),
      orderBy: (l, { asc }) => [asc(l.date)],
    });
    return NextResponse.json(logs);
  }

  return NextResponse.json({ error: "date or from+to params required" }, { status: 400 });
}

// POST /api/activities/logs — toggle an activity for a date
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(activityLogSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { activityId, date, completed, source, entryId } = parsed.data;

  // Verify activity belongs to user
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.userId, session.user.id)),
  });
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });

  // Verify entry belongs to user if provided
  if (entryId) {
    const { entries } = await import("@/lib/db/schema");
    const entry = await db.query.entries.findFirst({
      where: and(eq(entries.id, entryId), eq(entries.userId, session.user.id)),
    });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Upsert — find existing or create (scoped by userId)
  const existing = await db.query.activityLogs.findFirst({
    where: and(eq(activityLogs.activityId, activityId), eq(activityLogs.date, date), eq(activityLogs.userId, session.user.id)),
  });

  if (existing) {
    await db.update(activityLogs).set({
      completed: completed ?? !existing.completed,
      source: source || existing.source,
      entryId: entryId || existing.entryId,
    }).where(eq(activityLogs.id, existing.id));

    const updated = await db.query.activityLogs.findFirst({ where: eq(activityLogs.id, existing.id) });
    return NextResponse.json(updated);
  }

  const id = nanoid();
  try {
    await db.insert(activityLogs).values({
      id,
      userId: session.user.id,
      activityId,
      entryId: entryId || null,
      date,
      completed: completed ?? true,
      source: source || "manual",
      createdAt: new Date(),
    });
  } catch {
    // Unique constraint — concurrent request created it, fetch and update
    const retry = await db.query.activityLogs.findFirst({
      where: and(eq(activityLogs.activityId, activityId), eq(activityLogs.date, date), eq(activityLogs.userId, session.user.id)),
    });
    if (retry) return NextResponse.json(retry);
    return NextResponse.json({ error: "Failed to create log" }, { status: 500 });
  }

  const created = await db.query.activityLogs.findFirst({ where: eq(activityLogs.id, id) });
  return NextResponse.json(created, { status: 201 });
}
