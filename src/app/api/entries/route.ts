import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries, insights } from "@/lib/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { contentHash } from "@/lib/encryption";
import { entrySchema, parseBody } from "@/lib/validation";
import { parseJsonBody } from "@/lib/api-utils";
import { queueEntryTasks, cancelPendingTasks, processQueue } from "@/lib/processing/runner";

async function getUser(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return session.user;
}

function wordCount(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

// GET /api/entries — list entries, optionally filtered by month or search
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (date) {
    const entry = await db.query.entries.findFirst({
      where: and(eq(entries.userId, user.id), eq(entries.date, date)),
    });
    return NextResponse.json(entry || null);
  }

  let where = eq(entries.userId, user.id);
  if (month) {
    where = and(where, like(entries.date, `${month}%`))!;
  }

  const result = await db.query.entries.findMany({
    where,
    orderBy: (entries, { desc }) => [desc(entries.date)],
  });

  // Attach mood scores from insights for calendar view
  if (month && result.length > 0) {
    const entryIds = result.map((e) => e.id);
    const entryInsights = await db.query.insights.findMany({
      where: and(eq(insights.userId, user.id), inArray(insights.entryId, entryIds)),
      columns: { entryId: true, moodScore: true },
    });

    const moodMap = new Map(entryInsights.map((i) => [i.entryId, i.moodScore]));
    const enriched = result.map((e) => ({
      ...e,
      moodScore: moodMap.get(e.id) ?? null,
    }));
    return NextResponse.json(enriched);
  }

  return NextResponse.json(result);
}

// POST /api/entries — create or update entry for a date
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(entrySchema, jsonResult.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { date, title, content, templateUsed, isSessionDay } = parsed.data;

  const now = new Date();
  const wc = wordCount(content || "");

  // Upsert: try to find existing, handle concurrent creation via unique constraint
  let existing = await db.query.entries.findFirst({
    where: and(eq(entries.userId, user.id), eq(entries.date, date)),
  });

  if (existing) {
    const current = existing; // capture for closure
    const hash = contentHash(content || "");
    const oldHash = contentHash(current.content || "");

    // Use a transaction for atomic version creation + entry update
    const saveVersion = sqlite.transaction(() => {
      const latestVersion = sqlite.prepare(
        "SELECT version_number, content_hash FROM entry_versions WHERE entry_id = ? ORDER BY version_number DESC LIMIT 1"
      ).get(current.id) as { version_number: number; content_hash: string } | undefined;

      // Only create a version if content actually changed
      if (hash !== oldHash) {
        const versionNumber = latestVersion ? latestVersion.version_number + 1 : 1;
        sqlite.prepare(
          `INSERT INTO entry_versions (id, entry_id, user_id, version_number, title, content, word_count, content_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          nanoid(), current.id, user.id, versionNumber,
          current.title || "", current.content || "", current.wordCount || 0,
          oldHash, Math.floor(now.getTime() / 1000)
        );
      }

      const updates = ["title = ?", "content = ?", "word_count = ?", "updated_at = ?"];
      const values: unknown[] = [title, content, wc, Math.floor(now.getTime() / 1000)];

      if (isSessionDay !== undefined) { updates.push("is_session_day = ?"); values.push(isSessionDay ? 1 : 0); }

      values.push(current.id);
      sqlite.prepare(`UPDATE entries SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    });

    saveVersion();

    const updated = await db.query.entries.findFirst({
      where: eq(entries.id, current.id),
    });

    // Queue background processing tasks
    if (content) {
      cancelPendingTasks(user.id, current.id).catch((err) => console.error("[Processing] Failed to cancel pending tasks:", err));
      queueEntryTasks(user.id, current.id, content)
        .then(() => processQueue(user.id))
        .catch((err) => console.error("[Processing]", err));
    }

    return NextResponse.json(updated);
  }

  // Create new entry — handle race condition on unique (userId, date)
  const id = nanoid();
  try {
    await db.insert(entries).values({
      id,
      userId: user.id,
      date,
      title: title || "",
      content: content || "",
      wordCount: wc,
      templateUsed: templateUsed || null,
      isSessionDay: isSessionDay || false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    // Likely unique constraint violation — another request created it concurrently, retry as update
    console.warn("[Entries] Insert conflict, retrying as update:", err instanceof Error ? err.message : err);
    existing = await db.query.entries.findFirst({
      where: and(eq(entries.userId, user.id), eq(entries.date, date)),
    });
    if (existing) {
      await db.update(entries)
        .set({
          title, content, wordCount: wc, updatedAt: now,
          isSessionDay: isSessionDay || false,
        })
        .where(eq(entries.id, existing.id));

      // Queue processing tasks for the concurrent-update path too
      if (content) {
        queueEntryTasks(user.id, existing.id, content)
          .then(() => processQueue(user.id))
          .catch((err) => console.error("[Processing]", err));
      }

      return NextResponse.json(await db.query.entries.findFirst({ where: eq(entries.id, existing.id) }));
    }
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }

  const created = await db.query.entries.findFirst({
    where: eq(entries.id, id),
  });

  // Queue background processing tasks
  if (content) {
    queueEntryTasks(user.id, id, content)
      .then(() => processQueue(user.id))
      .catch((err) => console.error("[Processing]", err));
  }

  return NextResponse.json(created, { status: 201 });
}
