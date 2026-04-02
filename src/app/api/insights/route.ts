import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries, insights } from "@/lib/db/schema";
import { eq, and, gte, sql, count, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { safeJsonParse } from "@/lib/json";
import { subDays, format, startOfMonth } from "date-fns";

// GET /api/insights — aggregated dashboard data
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");

  // Total entries
  const totalResult = await db
    .select({ count: count() })
    .from(entries)
    .where(eq(entries.userId, userId));
  const totalEntries = totalResult[0]?.count || 0;

  // Entries this month
  const monthResult = await db
    .select({ count: count() })
    .from(entries)
    .where(and(eq(entries.userId, userId), gte(entries.date, monthStart)));
  const monthEntries = monthResult[0]?.count || 0;

  // Average mood score
  const moodResult = await db
    .select({ avg: sql<number>`avg(${insights.moodScore})` })
    .from(insights)
    .where(eq(insights.userId, userId));
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

  // Mood trend (last 30 days)
  const thirtyDaysAgo = format(subDays(now, 30), "yyyy-MM-dd");
  const moodTrend = await db
    .select({
      date: entries.date,
      moodScore: insights.moodScore,
    })
    .from(insights)
    .innerJoin(entries, eq(insights.entryId, entries.id))
    .where(and(eq(insights.userId, userId), gte(entries.date, thirtyDaysAgo)))
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

  return NextResponse.json({
    totalEntries,
    monthEntries,
    avgMood,
    streak,
    totalWords,
    moodTrend,
    topThemes,
    recentEntries: recent,
  });
}
