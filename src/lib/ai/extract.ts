import { db } from "@/lib/db";
import { insights, tags, entryTags, activities, activityLogs, entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getAIConfig } from "./config";
import { chatCompletion } from "./client";
import { insightExtractionPrompt, activityDetectionPrompt } from "./prompts";

interface ExtractedInsight {
  mood: string;
  moodScore: number;
  summary: string;
  actionItems: string[];
  keyPeople: string[];
  themes: string[];
  events?: string[];
  places?: string[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract insights from an entry using AI. Fire-and-forget — errors are logged, not thrown.
 */
export async function extractInsights(userId: string, entryId: string, content: string) {
  try {
    const plaintext = stripHtml(content);
    if (plaintext.length < 20) return;

    const config = await getAIConfig(userId);
    const messages = insightExtractionPrompt(plaintext);

    const response = await chatCompletion(config, messages, {
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    let parsed: ExtractedInsight;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      const match = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          parsed = JSON.parse(match[1]);
        } catch {
          console.error("[AI Extract] Failed to parse code block JSON:", response.content.slice(0, 300));
          throw new Error("Failed to parse AI response as JSON");
        }
      } else {
        console.error("[AI Extract] No JSON found in response:", response.content.slice(0, 300));
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    const now = new Date();

    // Upsert insight
    await db.delete(insights).where(eq(insights.entryId, entryId));
    await db.insert(insights).values({
      id: nanoid(),
      entryId,
      userId,
      mood: parsed.mood,
      moodScore: Math.max(-1, Math.min(1, parsed.moodScore)),
      summary: parsed.summary,
      actionItems: JSON.stringify(parsed.actionItems || []),
      keyPeople: JSON.stringify(parsed.keyPeople || []),
      themes: JSON.stringify(parsed.themes || []),
      extractedAt: now,
    });

    // Auto-create tags from themes, people, events, places
    const tagEntries: string[] = [];
    for (const theme of (parsed.themes || []).slice(0, 5)) {
      tagEntries.push(theme.toLowerCase().trim());
    }
    for (const person of (parsed.keyPeople || []).slice(0, 5)) {
      tagEntries.push(`person:${person.toLowerCase().trim()}`);
    }
    for (const event of (parsed.events || []).slice(0, 5)) {
      tagEntries.push(`event:${event.toLowerCase().trim()}`);
    }
    for (const place of (parsed.places || []).slice(0, 5)) {
      tagEntries.push(`place:${place.toLowerCase().trim()}`);
    }

    for (let tagName of tagEntries) {
      tagName = tagName.trim();
      if (!tagName || tagName === "person:" || tagName === "event:" || tagName === "place:") continue;

      let tag = await db.query.tags.findFirst({
        where: and(eq(tags.userId, userId), eq(tags.name, tagName)),
      });

      if (!tag) {
        const tagId = nanoid();
        try {
          await db.insert(tags).values({
            id: tagId,
            userId,
            name: tagName,
            isAiGenerated: true,
          });
          tag = await db.query.tags.findFirst({ where: eq(tags.id, tagId) });
        } catch {
          // Unique constraint — tag was created by concurrent process, fetch it
          tag = await db.query.tags.findFirst({
            where: and(eq(tags.userId, userId), eq(tags.name, tagName)),
          });
        }
      }

      if (tag) {
        try {
          const existing = await db.query.entryTags.findFirst({
            where: and(eq(entryTags.entryId, entryId), eq(entryTags.tagId, tag.id)),
          });
          if (!existing) {
            await db.insert(entryTags).values({ entryId, tagId: tag.id });
          }
        } catch {
          // Unique constraint on entryTags — already linked, ignore
        }
      }
    }

    // Auto-detect activities
    await detectActivities(userId, entryId, plaintext, config);
  } catch (err) {
    console.error("[AI Extract] Failed to extract insights:", err);
  }
}

/**
 * Detect which tracked activities are mentioned in the entry.
 */
async function detectActivities(userId: string, entryId: string, plaintext: string, config: Awaited<ReturnType<typeof getAIConfig>>) {
  try {
    // Get user's active activities
    const userActivities = await db.query.activities.findMany({
      where: and(eq(activities.userId, userId), eq(activities.active, true)),
    });

    if (userActivities.length === 0) return;

    // Get entry date
    const entry = await db.query.entries.findFirst({
      where: eq(entries.id, entryId),
      columns: { date: true },
    });
    if (!entry) return;

    const activityNames = userActivities.map((a) => a.name);
    const messages = activityDetectionPrompt(plaintext, activityNames);

    const response = await chatCompletion(config, messages, {
      temperature: 0.1,
      responseFormat: { type: "json_object" },
    });

    let detected: Record<string, boolean>;
    try {
      detected = JSON.parse(response.content);
    } catch {
      const match = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        detected = JSON.parse(match[1]);
      } else {
        console.error("[AI Extract] Activity detection: no JSON in response:", response.content.slice(0, 300));
        return;
      }
    }

    // Update activity logs for detected activities
    for (const activity of userActivities) {
      if (detected[activity.name] !== true) continue;

      // Check if already logged (don't override manual entries)
      const existing = await db.query.activityLogs.findFirst({
        where: and(eq(activityLogs.userId, userId), eq(activityLogs.activityId, activity.id), eq(activityLogs.date, entry.date)),
      });

      if (existing) {
        // Only update if it was previously AI-set — never override manual entries
        if (existing.source === "ai") {
          await db.update(activityLogs).set({
            completed: true,
            source: "ai",
            entryId,
          }).where(eq(activityLogs.id, existing.id));
        }
      } else {
        await db.insert(activityLogs).values({
          id: nanoid(),
          userId,
          activityId: activity.id,
          entryId,
          date: entry.date,
          completed: true,
          source: "ai",
          createdAt: new Date(),
        });
      }
    }
  } catch (err) {
    console.error("[AI Extract] Activity detection failed:", err);
  }
}
