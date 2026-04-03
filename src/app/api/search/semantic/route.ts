import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getAIConfig } from "@/lib/ai/config";
import { generateEmbedding } from "@/lib/ai/client";

// GET /api/search/semantic?q=query
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q");
  if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });
  if (query.length > 1000) {
    return NextResponse.json({ error: "Query too long (max 1000 characters)" }, { status: 400 });
  }

  try {
    const config = await getAIConfig(session.user.id);
    const { embedding } = await generateEmbedding(config, query);
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    const results = sqlite.prepare(`
      SELECT entry_id, distance
      FROM vec_entries
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT 10
    `).all(embeddingBuffer) as { entry_id: number; distance: number }[];

    const entries = [];
    for (const r of results) {
      const entry = sqlite.prepare(
        "SELECT id, date, title, word_count as wordCount FROM entries WHERE rowid = ? AND user_id = ?"
      ).get(r.entry_id, session.user.id) as { id: string; date: string; title: string; wordCount: number } | undefined;

      if (entry) {
        entries.push({ ...entry, distance: r.distance });
      }
    }

    return NextResponse.json(entries);
  } catch (err) {
    return NextResponse.json(
      { error: "Semantic search unavailable. Ensure embeddings are configured." },
      { status: 503 }
    );
  }
}
