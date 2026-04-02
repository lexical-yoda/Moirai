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

  // Check if entry has therapy notes with actual content
  const entry = await db.query.entries.findFirst({
    where: eq(entries.id, entryId),
    columns: { hasTherapyNotes: true, therapyContent: true },
  });
  if (entry?.hasTherapyNotes && entry.therapyContent &&
      entry.therapyContent.replace(/<[^>]*>/g, " ").trim().length >= 10) {
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

  // Update the recording
  await db.update(voiceRecordings)
    .set({ transcription: text })
    .where(eq(voiceRecordings.id, task.recordingId));

  // Append to entry content
  if (task.entryId) {
    const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
    if (entry) {
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const newContent = entry.content ? `${entry.content}<p>${escaped}</p>` : `<p>${escaped}</p>`;
      await db.update(entries)
        .set({ content: newContent, updatedAt: new Date() })
        .where(eq(entries.id, task.entryId));
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
  const { contentFormattingPrompt, titleGenerationPrompt } = await import("@/lib/ai/prompts");

  const config = await getAIConfig(task.userId);
  const plaintext = entry.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plaintext.length < 20) return;

  // Format content
  const formatMessages = contentFormattingPrompt(plaintext);
  const formatResponse = await chatCompletion(config, formatMessages, { temperature: 0.3 });

  const updates: Record<string, unknown> = {
    formattedContent: formatResponse.content,
    updatedAt: new Date(),
  };

  // Generate title if empty
  if (!entry.title) {
    const titleMessages = titleGenerationPrompt(plaintext);
    const titleResponse = await chatCompletion(config, titleMessages, { temperature: 0.5 });
    updates.generatedTitle = titleResponse.content.replace(/^["']|["']$/g, "").trim();
  }

  // Format therapy content if present
  if (entry.therapyContent) {
    const therapyPlain = entry.therapyContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (therapyPlain.length >= 20) {
      const therapyMessages = contentFormattingPrompt(therapyPlain);
      const therapyResponse = await chatCompletion(config, therapyMessages, { temperature: 0.3 });
      updates.therapyFormattedContent = therapyResponse.content;
    }
  }

  await db.update(entries).set(updates).where(eq(entries.id, task.entryId));
}

// ── Insights ──────────────────────────────────────────────────────────────

async function handleInsights(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for insights task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry || !entry.content) return;

  const { extractInsights } = await import("@/lib/ai/extract");
  await extractInsights(task.userId, task.entryId, entry.content);
}

// ── Embedding ─────────────────────────────────────────────────────────────

async function handleEmbedding(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for embedding task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry || !entry.content) return;

  const { embedEntry } = await import("@/lib/ai/embed-entry");
  await embedEntry(task.userId, task.entryId, entry.content);
}

// ── Therapy ───────────────────────────────────────────────────────────────

async function handleTherapy(task: TaskRecord) {
  if (!task.entryId) throw new Error("No entryId for therapy task");

  const entry = await db.query.entries.findFirst({ where: eq(entries.id, task.entryId) });
  if (!entry) return;
  if (!entry.hasTherapyNotes || !entry.therapyContent) return;

  const { getAIConfig } = await import("@/lib/ai/config");
  const { chatCompletion } = await import("@/lib/ai/client");
  const { therapyItemExtractionPrompt, therapySessionMatchingPrompt } = await import("@/lib/ai/prompts");
  const { therapyItems } = await import("@/lib/db/schema");

  const config = await getAIConfig(task.userId);
  const plaintext = entry.therapyContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plaintext.length < 10) return;

  if (entry.isSessionDay) {
    // Session day: match pending items
    const pendingItems = await db.query.therapyItems.findMany({
      where: and(
        eq(therapyItems.userId, task.userId),
        eq(therapyItems.status, "pending")
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
  } else {
    // Non-session day: extract new therapy items
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
