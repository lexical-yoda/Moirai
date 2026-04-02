import { db } from "@/lib/db";
import { insights, tags, entryTags } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getAIConfig } from "./config";
import { chatCompletion } from "./client";
import { insightExtractionPrompt } from "./prompts";

interface ExtractedInsight {
  mood: string;
  moodScore: number;
  summary: string;
  actionItems: string[];
  keyPeople: string[];
  themes: string[];
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
    if (plaintext.length < 20) return; // Skip very short entries

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
      // Try to extract JSON from markdown code blocks
      const match = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    const now = new Date();

    // Upsert insight (delete existing for this entry, insert new)
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

    // Auto-create tags from themes
    if (parsed.themes?.length) {
      for (const theme of parsed.themes.slice(0, 5)) {
        const tagName = theme.toLowerCase().trim();
        if (!tagName) continue;

        let tag = await db.query.tags.findFirst({
          where: and(eq(tags.userId, userId), eq(tags.name, tagName)),
        });

        if (!tag) {
          const tagId = nanoid();
          await db.insert(tags).values({
            id: tagId,
            userId,
            name: tagName,
            isAiGenerated: true,
          });
          tag = await db.query.tags.findFirst({ where: eq(tags.id, tagId) });
        }

        if (tag) {
          const existing = await db.query.entryTags.findFirst({
            where: and(eq(entryTags.entryId, entryId), eq(entryTags.tagId, tag.id)),
          });
          if (!existing) {
            await db.insert(entryTags).values({ entryId, tagId: tag.id });
          }
        }
      }
    }
  } catch (err) {
    console.error("[AI Extract] Failed to extract insights:", err);
  }
}
