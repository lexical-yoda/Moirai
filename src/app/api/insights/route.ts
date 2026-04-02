import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries, insights } from "@/lib/db/schema";
import { eq, and, gte, sql, count, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { safeJsonParse } from "@/lib/json";
import { subDays, format, startOfMonth, endOfMonth } from "date-fns";

// GET /api/insights — aggregated dashboard data
// Supports ?from=YYYY-MM-DD&to=YYYY-MM-DD for date range filtering
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const now = new Date();

  // Default range: current month
  const from = searchParams.get("from") || format(startOfMonth(now), "yyyy-MM-dd");
  const to = searchParams.get("to") || format(endOfMonth(now), "yyyy-MM-dd");
  const monthStart = from;

  // Total entries
  const totalResult = await db
    .select({ count: count() })
    .from(entries)
    .where(eq(entries.userId, userId));
  const totalEntries = totalResult[0]?.count || 0;

  // Entries in selected range
  const { lte: lteFn } = await import("drizzle-orm");
  const rangeResult = await db
    .select({ count: count() })
    .from(entries)
    .where(and(eq(entries.userId, userId), gte(entries.date, from), lteFn(entries.date, to)));
  const rangeEntries = rangeResult[0]?.count || 0;

  // Average mood in range
  const moodResult = await db
    .select({ avg: sql<number>`avg(${insights.moodScore})` })
    .from(insights)
    .innerJoin(entries, eq(insights.entryId, entries.id))
    .where(and(eq(insights.userId, userId), gte(entries.date, from), lteFn(entries.date, to)));
  const avgMood = moodResult[0]?.avg ?? null;

  // Streak calculation
  const recentEntries = await db.query.entries.findMany({
    where: eq(entries.userId, userId),
    orderBy: [desc(entries.date)],
    columns: { date: true },
    limit: 365,
  });

  let streak = 0;
  const today = format(now, "yyyy-MM-dd");
  const dates = new Set(recentEntries.map((e) => e.date));

  for (let i = 0; i < 365; i++) {
    const d = format(subDays(now, i), "yyyy-MM-dd");
    if (dates.has(d)) {
      streak++;
    } else if (i === 0) {
      // Today hasn't been written yet, still check yesterday
      continue;
    } else {
      break;
    }
  }

  // Mood trend (in selected range)
  const moodTrend = await db
    .select({
      date: entries.date,
      moodScore: insights.moodScore,
    })
    .from(insights)
    .innerJoin(entries, eq(insights.entryId, entries.id))
    .where(and(eq(insights.userId, userId), gte(entries.date, from), lteFn(entries.date, to)))
    .orderBy(entries.date);

  // Top themes (last 500 entries to bound memory)
  const allInsights = await db.query.insights.findMany({
    where: eq(insights.userId, userId),
    columns: { themes: true },
    limit: 500,
    orderBy: (i, { desc }) => [desc(i.extractedAt)],
  });

  const themeCount = new Map<string, number>();
  for (const i of allInsights) {
    const themes: string[] = safeJsonParse(i.themes, []);
    for (const t of themes) {
      themeCount.set(t, (themeCount.get(t) || 0) + 1);
    }
  }
  const topThemes = Array.from(themeCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  // Recent entries
  const recent = await db.query.entries.findMany({
    where: eq(entries.userId, userId),
    orderBy: [desc(entries.date)],
    columns: { id: true, date: true, title: true, wordCount: true },
    limit: 5,
  });

  // Total words
  const wordResult = await db
    .select({ total: sql<number>`sum(${entries.wordCount})` })
    .from(entries)
    .where(eq(entries.userId, userId));
  const totalWords = wordResult[0]?.total || 0;

  // Mood heatmap (last 365 days — date + mood score)
  const yearAgo = format(subDays(now, 365), "yyyy-MM-dd");
  const heatmapData = await db
    .select({ date: entries.date, moodScore: insights.moodScore })
    .from(entries)
    .leftJoin(insights, eq(insights.entryId, entries.id))
    .where(and(eq(entries.userId, userId), gte(entries.date, yearAgo)))
    .orderBy(entries.date);

  return NextResponse.json({
    totalEntries,
    rangeEntries,
    avgMood,
    streak,
    totalWords,
    moodTrend,
    topThemes,
    recentEntries: recent,
    heatmapData,
    dateRange: { from, to },
  });
}
