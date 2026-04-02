import { db, sqlite } from "@/lib/db";
import { entryEmbeddings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getAIConfig } from "./config";
import { generateEmbedding } from "./client";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

let vecTableInitialized = false;
let vecTableDimension = 0;

function ensureVecTable(dimension: number) {
  if (vecTableInitialized && vecTableDimension === dimension) return;

  try {
    // Check if table exists with correct dimensions
    sqlite.prepare("SELECT count(*) FROM vec_entries LIMIT 0").get();
    vecTableInitialized = true;
    vecTableDimension = dimension;
  } catch {
    // Table doesn't exist — create it
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_entries USING vec0(
        entry_id INTEGER PRIMARY KEY,
        embedding float[${Number(dimension)}]
      )
    `);
    vecTableInitialized = true;
    vecTableDimension = dimension;
  }
}

/**
 * Generate and store embedding for an entry. Fire-and-forget.
 */
export async function embedEntry(userId: string, entryId: string, content: string) {
  try {
    const plaintext = stripHtml(content);
    if (plaintext.length < 20) return;

    const config = await getAIConfig(userId);
    if (!config.embeddingEndpointUrl && !config.endpointUrl) return;

    const { embedding } = await generateEmbedding(config, plaintext);
    const modelName = config.embeddingModelName || "default";

    ensureVecTable(embedding.length);

    // Get the rowid for this entry
    const row = sqlite.prepare("SELECT rowid FROM entries WHERE id = ?").get(entryId) as { rowid: number } | undefined;
    if (!row) return;

    // Upsert into vec_entries
    const embeddingBuffer = new Float32Array(embedding);
    try {
      sqlite.prepare("DELETE FROM vec_entries WHERE entry_id = ?").run(row.rowid);
    } catch {
      // May not exist yet
    }
    sqlite.prepare("INSERT INTO vec_entries(entry_id, embedding) VALUES (?, ?)").run(
      row.rowid,
      Buffer.from(embeddingBuffer.buffer)
    );

    // Upsert metadata
    await db.delete(entryEmbeddings).where(eq(entryEmbeddings.entryId, entryId));
    await db.insert(entryEmbeddings).values({
      id: nanoid(),
      entryId,
      userId,
      modelName,
      embeddedAt: new Date(),
    });
  } catch (err) {
    console.error("[Embed] Failed to embed entry:", err);
  }
}
