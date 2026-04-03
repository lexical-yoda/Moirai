import { db } from "@/lib/db";
import { entries, insights, reflections } from "@/lib/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { safeJsonParse } from "@/lib/json";
import { getAIConfig } from "./config";
import { chatCompletion } from "./client";
import { weeklyReflectionPrompt, monthlyReflectionPrompt } from "./prompts";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

interface ReflectionResult {
  title: string;
  content: string;
  moodSummary: string;
  themes: string[];
  keyInsights: string[];
}

/**
 * Generate a weekly or monthly reflection from entries in a date range.
 */
export async function generateReflection(
  userId: string,
  type: "weekly" | "monthly",
  periodStart: string,
  periodEnd: string
) {
  try {
    // Check for existing reflection covering the same period
    const existing = await db.query.reflections.findFirst({
      where: and(
        eq(reflections.userId, userId),
        eq(reflections.type, type),
        eq(reflections.periodStart, periodStart),
        eq(reflections.periodEnd, periodEnd),
      ),
    });
    if (existing) {
      throw new Error(`A ${type} reflection for this period already exists`);
    }

    const config = await getAIConfig(userId);

    // Get entries in the date range
    const userEntries = await db.query.entries.findMany({
      where: and(
        eq(entries.userId, userId),
        gte(entries.date, periodStart),
        lte(entries.date, periodEnd)
      ),
      orderBy: (e, { asc }) => [asc(e.date)],
    });

    if (userEntries.length === 0) {
      throw new Error("No entries found in this period");
    }

    // Get insights only for entries in this period (not all user insights)
    const entryIds = userEntries.map((e) => e.id);
    const entryInsights = await db.query.insights.findMany({
      where: and(eq(insights.userId, userId), inArray(insights.entryId, entryIds)),
    });
    const insightMap = new Map(
      entryInsights.map((i) => [i.entryId, i])
    );

    // Build summaries for the prompt
    const summaries = userEntries.map((entry) => {
      const insight = insightMap.get(entry.id);
      const summary = insight?.summary || stripHtml(entry.content || "").slice(0, 200);
      const mood = insight ? `(mood: ${insight.mood}, score: ${insight.moodScore})` : "";
      const themes = insight?.themes ? safeJsonParse<string[]>(insight.themes, []).join(", ") : "";
      return `**${entry.date}** ${mood}: ${summary}${themes ? ` [themes: ${themes}]` : ""}`;
    }).join("\n\n");

    // Generate reflection
    const messages = type === "weekly"
      ? weeklyReflectionPrompt(summaries)
      : monthlyReflectionPrompt(summaries);

    const response = await chatCompletion(config, messages, {
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
    });

    let parsed: ReflectionResult;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      const match = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error("Failed to parse reflection response");
      }
    }

    // Store reflection
    const id = nanoid();
    const now = new Date();
    await db.insert(reflections).values({
      id,
      userId,
      type,
      periodStart,
      periodEnd,
      title: parsed.title,
      content: parsed.content,
      moodSummary: parsed.moodSummary,
      themes: JSON.stringify(parsed.themes || []),
      keyInsights: JSON.stringify(parsed.keyInsights || []),
      entryIds: JSON.stringify(entryIds),
      generatedAt: now,
      createdAt: now,
    });

    return await db.query.reflections.findFirst({ where: eq(reflections.id, id) });
  } catch (err) {
    console.error("[Reflections] Generation failed:", err);
    throw err;
  }
}
