import { db, sqlite } from "@/lib/db";
import { processingTasks, entries, voiceRecordings, userSettings } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export type TaskType = "transcription" | "formatting" | "insights" | "activities" | "therapy" | "embedding";

// Per-user lock to prevent concurrent processQueue calls
const activeLocks = new Set<string>();

/**
 * Queue a processing task for background execution.
 */
export async function queueTask(
  userId: string,
  entryId: string | null,
  type: TaskType,
  recordingId?: string
) {
  const now = new Date();
  const id = nanoid();
  await db.insert(processingTasks).values({
    id,
    userId,
    entryId,
    recordingId: recordingId || null,
    type,
    status: "pending",
    retries: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Queue standard tasks after an entry save (formatting, insights, embedding).
 * Optionally queues therapy if the entry has therapy notes.
 */
export async function queueEntryTasks(userId: string, entryId: string, content: string) {
  if (!content || content.replace(/<[^>]*>/g, " ").trim().length < 20) return;

  await queueTask(userId, entryId, "formatting");
  await queueTask(userId, entryId, "insights");
  await queueTask(userId, entryId, "embedding");

  // Queue therapy extraction if therapy is enabled for this user
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { therapyEnabled: true },
  });
  if (settings?.therapyEnabled) {
    await queueTask(userId, entryId, "therapy");
  }
}

/**
 * Process all pending tasks for a user sequentially.
 * Called as fire-and-forget after queueing tasks.
 * Uses per-user in-memory lock to prevent concurrent execution.
 */
export async function processQueue(userId: string) {
  if (activeLocks.has(userId)) return; // Already processing for this user
  activeLocks.add(userId);

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Atomically claim the next pending task using raw SQL
      // This prevents race conditions where two processes pick the same task
      const result = sqlite.prepare(
        `UPDATE processing_tasks SET status = 'running', updated_at = ?
         WHERE id = (
           SELECT id FROM processing_tasks
           WHERE user_id = ? AND status = 'pending'
           ORDER BY created_at ASC LIMIT 1
         ) AND status = 'pending'
         RETURNING id`
      ).get(Math.floor(Date.now() / 1000), userId) as { id: string } | undefined;

      if (!result) break;

      // Re-fetch with Drizzle for proper typing
      const claimed = await db.query.processingTasks.findFirst({
        where: eq(processingTasks.id, result.id),
      });
      if (!claimed) break;

      try {
        await executeTask(claimed);

        await db.update(processingTasks)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(processingTasks.id, claimed.id));
      } catch (err) {
        const retries = (claimed.retries || 0) + 1;
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (retries >= claimed.maxRetries) {
          await db.update(processingTasks)
            .set({ status: "failed", retries, errorMessage, updatedAt: new Date() })
            .where(eq(processingTasks.id, claimed.id));
        } else {
          await db.update(processingTasks)
            .set({ status: "pending", retries, errorMessage, updatedAt: new Date() })
            .where(eq(processingTasks.id, claimed.id));
        }

        console.error(`[Processing] Task ${claimed.type} failed (attempt ${retries}/${claimed.maxRetries}):`, errorMessage);
      }
    }
  } finally {
    activeLocks.delete(userId);
  }
}

type TaskRecord = typeof processingTasks.$inferSelect;

async function executeTask(task: TaskRecord) {
  switch (task.type) {
    case "transcription":
      return handleTranscription(task);
    case "formatting":
      return handleFormatting(task);
    case "insights":
      return handleInsights(task);
    case "embedding":
      return handleEmbedding(task);
    case "therapy":
      return handleTherapy(task);
    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}

// ── Transcription ─────────────────────────────────────────────────────────

async function handleTranscription(task: TaskRecord) {
  if (!task.recordingId) throw new Error("No recordingId for transcription task");

  const recording = await db.query.voiceRecordings.findFirst({
    where: eq(voiceRecordings.id, task.recordingId),
  });
  if (!recording) throw new Error("Recording not found");
  if (recording.transcription) return; // Already transcribed

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, task.userId),
  });
  const whisperUrl = settings?.whisperEndpointUrl || process.env.WHISPER_URL;
  if (!whisperUrl) throw new Error("Whisper not configured");

  const fs = await import("fs");
  const path = await import("path");
  const { VOICE_DIR } = await import("@/lib/constants");
  const filePath = path.join(VOICE_DIR, recording.audioPath);

  if (!fs.existsSync(filePath)) throw new Error("Audio file not found on disk");

  const fileBuffer = fs.readFileSync(filePath);
  const uint8 = new Uint8Array(fileBuffer);
  const timeout = 5 * 60 * 1000;

  const attempts = [
    () => {
      const form = new FormData();
      form.append("file", new Blob([uint8]), recording.audioPath);
      return fetch(`${whisperUrl}/transcribe`, { method: "POST", body: form, signal: AbortSignal.timeout(timeout) });
    },
    () => {
      const form = new FormData();
      form.append("audio_file", new Blob([uint8]), recording.audioPath);
      return fetch(`${whisperUrl}/asr?task=transcribe&output=json`, { method: "POST", body: form, signal: AbortSignal.timeout(timeout) });
    },
    () => {
      const form = new FormData();
      form.append("file", new Blob([uint8]), recording.audioPath);
      form.append("model", "whisper-1");
      return fetch(`${whisperUrl}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(timeout) });
    },
  ];

  let text = "";
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) continue;
      const result = await res.json();
      text = result.text || result.transcript || "";
      if (text) break;
    } catch (err) {
      console.error("[Processing] Transcription attempt failed:", err instanceof Error ? err.message : err);
      continue;
    }
  }

  if (!text) throw new Error("Transcription failed — all API formats returned empty or errored");

  // LLM cleanup — fix transcription errors using context
  let cleanedText = text;
  try {
    const { getAIConfig } = await import("@/lib/ai/config");
    const { chatCompletion } = await import("@/lib/ai/client");
    const { transcriptionCleanupPrompt } = await import("@/lib/ai/prompts");
    const { people: peopleTable, activities: activitiesTable } = await import("@/lib/db/schema");
    const { safeJsonParse } = await import("@/lib/json");

    const config = await getAIConfig(task.userId);
    const [userPeople, userActivities] = await Promise.all([
      db.query.people.findMany({ where: eq(peopleTable.userId, task.userId), columns: { name: true, aliases: true } }),
      db.query.activities.findMany({ where: eq(activitiesTable.userId, task.userId), columns: { name: true } }),
    ]);

    const knownContext = {
      people: userPeople.flatMap((p) => [p.name, ...safeJsonParse(p.aliases, [])]),
      activities: userActivities.map((a) => a.name),
    };

    const messages = transcriptionCleanupPrompt(text, knownContext);
    const response = await chatCompletion(config, messages, { temperature: 0.1, maxTokens: 2048 });
    if (response.content && response.content.trim().length > 0) {
      cleanedText = response.content.trim();
    }
  } catch (err) {
    console.error("[Processing] Transcription cleanup failed, using raw text:", err instanceof Error ? err.message : err);
  }

  // Update the recording
  await db.update(voiceRecordings)
    .set({ transcription: cleanedText })
    .where(eq(voiceRecordings.id, task.recordingId));

  // Append to entry content with recording ID marker
  if (task.entryId) {
    const { wrapTranscription } = await import("@/lib/transcription");
    const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
    if (entry) {
      const wrappedContent = wrapTranscription(task.recordingId!, cleanedText);
      const newContent = entry.content ? `${entry.content}${wrappedContent}` : wrappedContent;
      await db.update(entries)
        .set({ content: newContent, updatedAt: new Date() })
        .where(eq(entries.id, task.entryId));

      // Queue follow-up AI tasks (formatting, insights, embedding, therapy)
      await queueTask(task.userId, task.entryId, "formatting");
      await queueTask(task.userId, task.entryId, "insights");
      await queueTask(task.userId, task.entryId, "embedding");

      // Queue therapy if enabled for user
      const userSettingsRow = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, task.userId),
        columns: { therapyEnabled: true },
      });
      if (userSettingsRow?.therapyEnabled) {
        await queueTask(task.userId, task.entryId, "therapy");
      }
    }
  }
}

// ── Formatting ────────────────────────────────────────────────────────────

async function handleFormatting(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for formatting task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry || !entry.content) return;

  const { getAIConfig } = await import("@/lib/ai/config");
  const { chatCompletion } = await import("@/lib/ai/client");
  const { contentFormattingPrompt } = await import("@/lib/ai/prompts");
  const { stripRecordingMarkers } = await import("@/lib/transcription");

  const config = await getAIConfig(task.userId);
  const cleanContent = stripRecordingMarkers(entry.content);
  const plaintext = cleanContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plaintext.length < 20) return;

  // Format content + generate title in one JSON call
  const formatMessages = contentFormattingPrompt(plaintext);
  const formatResponse = await chatCompletion(config, formatMessages, {
    temperature: 0.3,
    responseFormat: { type: "json_object" },
  });

  let parsed: { formatted: string; title: string };
  try {
    parsed = JSON.parse(formatResponse.content);
  } catch {
    const match = formatResponse.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      console.error("[Processing] Formatting: no JSON in response:", formatResponse.content.slice(0, 300));
      throw new Error("Failed to parse formatting response");
    }
  }

  // Strip any injected temporal transitions the model may have added
  let formatted = parsed.formatted || formatResponse.content;
  const injectedPhrases = /\b(but )?(the next day|the following day|later that week|the day after|subsequently|afterwards),?\s*/gi;
  formatted = formatted.replace(injectedPhrases, "");

  const updates: Record<string, unknown> = {
    formattedContent: formatted,
    updatedAt: new Date(),
  };

  if (!entry.title && parsed.title) {
    updates.generatedTitle = parsed.title.replace(/^["']|["']$/g, "").trim();
  }

  await db.update(entries).set(updates).where(eq(entries.id, task.entryId));
}

// ── Insights ──────────────────────────────────────────────────────────────

async function handleInsights(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for insights task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry || !entry.content) return;

  const { stripRecordingMarkers } = await import("@/lib/transcription");
  const { extractInsights } = await import("@/lib/ai/extract");
  await extractInsights(task.userId, task.entryId, stripRecordingMarkers(entry.content));
}

// ── Embedding ─────────────────────────────────────────────────────────────

async function handleEmbedding(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for embedding task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry || !entry.content) return;

  const { stripRecordingMarkers } = await import("@/lib/transcription");
  const { embedEntry } = await import("@/lib/ai/embed-entry");
  await embedEntry(task.userId, task.entryId, stripRecordingMarkers(entry.content));
}

// ── Therapy ───────────────────────────────────────────────────────────────

async function handleTherapy(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for therapy task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry || !entry.content) return;

  const { getAIConfig } = await import("@/lib/ai/config");
  const { chatCompletion } = await import("@/lib/ai/client");
  const { therapyItemExtractionPrompt, therapySessionMatchingPrompt, therapyTakeawayExtractionPrompt } = await import("@/lib/ai/prompts");
  const { therapyItems } = await import("@/lib/db/schema");
  const { stripRecordingMarkers } = await import("@/lib/transcription");

  const config = await getAIConfig(task.userId);
  const cleanContent = stripRecordingMarkers(entry.content);
  const plaintext = cleanContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plaintext.length < 20) return;

  if (entry.isSessionDay) {
    // Session day: match pending items against session content
    const pendingItems = await db.query.therapyItems.findMany({
      where: and(
        eq(therapyItems.userId, task.userId),
        eq(therapyItems.status, "pending"),
        eq(therapyItems.type, "topic")
      ),
    });

    if (pendingItems.length > 0) {
      const messages = therapySessionMatchingPrompt(plaintext, pendingItems);
      const response = await chatCompletion(config, messages, {
        temperature: 0.2,
        responseFormat: { type: "json_object" },
      });

      let result: { addressed: string[] };
      try {
        result = JSON.parse(response.content);
      } catch {
        const match = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          result = JSON.parse(match[1]);
        } else {
          console.error("[Processing] Therapy session matching: no JSON in response:", response.content.slice(0, 300));
          return;
        }
      }

      if (result.addressed?.length) {
        const validIds = pendingItems.map((i) => i.id);
        const toUpdate = result.addressed.filter((id) => validIds.includes(id));
        if (toUpdate.length > 0) {
          await db.update(therapyItems)
            .set({ status: "discussed", sessionEntryId: task.entryId, updatedAt: new Date() })
            .where(inArray(therapyItems.id, toUpdate));
        }
      }
    }

    // Also extract takeaways (therapist suggestions, breakthroughs, homework)
    const takeawayMessages = therapyTakeawayExtractionPrompt(plaintext);
    const takeawayResponse = await chatCompletion(config, takeawayMessages, {
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    let takeawayResult: { takeaways: Array<{ description: string }> };
    try {
      takeawayResult = JSON.parse(takeawayResponse.content);
    } catch {
      const match = takeawayResponse.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        takeawayResult = JSON.parse(match[1]);
      } else {
        takeawayResult = { takeaways: [] };
      }
    }

    if (takeawayResult.takeaways?.length) {
      const now = new Date();
      for (const item of takeawayResult.takeaways.slice(0, 10)) {
        if (!item.description || typeof item.description !== "string") continue;
        const description = item.description.slice(0, 1000).trim();
        if (!description) continue;
        await db.insert(therapyItems).values({
          id: nanoid(),
          userId: task.userId,
          entryId: task.entryId!,
          description,
          type: "takeaway",
          priority: "medium",
          status: "resolved",
          sessionEntryId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  } else {
    // Non-session day: extract therapy topics from main entry content
    const messages = therapyItemExtractionPrompt(plaintext);
    const response = await chatCompletion(config, messages, {
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    let result: { items: Array<{ description: string; priority: string }> };
    try {
      result = JSON.parse(response.content);
    } catch {
      const match = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        result = JSON.parse(match[1]);
      } else {
        console.error("[Processing] Therapy item extraction: no JSON in response:", response.content.slice(0, 300));
        return;
      }
    }

    if (result.items?.length) {
      const now = new Date();
      for (const item of result.items.slice(0, 10)) {
        if (!item.description || typeof item.description !== "string") continue;
        const description = item.description.slice(0, 1000).trim();
        if (!description) continue;
        const priority = ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium";
        await db.insert(therapyItems).values({
          id: nanoid(),
          userId: task.userId,
          entryId: task.entryId!,
          description,
          type: "topic",
          priority,
          status: "pending",
          sessionEntryId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
}

/**
 * Cancel all pending tasks for an entry (useful when entry is re-saved before processing finishes).
 */
export async function cancelPendingTasks(userId: string, entryId: string) {
  await db.update(processingTasks)
    .set({ status: "failed", errorMessage: "Cancelled — entry was re-saved", updatedAt: new Date() })
    .where(
      and(
        eq(processingTasks.userId, userId),
        eq(processingTasks.entryId, entryId),
        eq(processingTasks.status, "pending")
      )
    );
}
