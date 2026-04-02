import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { auth } from "@/lib/auth";

// GET /api/search?q=query — FTS5 keyword search
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json([]);
  }

  try {
    // FTS5 search with snippet highlighting, joined with entries for user filtering
    const results = sqlite.prepare(`
      SELECT
        e.id,
        e.date,
        e.title,
        e.word_count as wordCount,
        snippet(entries_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
        bm25(entries_fts) as rank
      FROM entries_fts
      JOIN entries e ON e.rowid = entries_fts.rowid
      WHERE entries_fts MATCH ?
        AND e.user_id = ?
      ORDER BY rank
      LIMIT 20
    `).all(query, session.user.id) as {
      id: string;
      date: string;
      title: string;
      wordCount: number;
      snippet: string;
      rank: number;
    }[];

    return NextResponse.json(results);
  } catch (err) {
    console.error("[Search] FTS5 query failed:", err);
    return NextResponse.json(
      { error: "Search index not available. Try writing an entry first." },
      { status: 503 }
    );
  }
}
