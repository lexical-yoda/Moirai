import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/entries/[id]/similar — find similar entries via embedding KNN
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Get the rowid for this entry
    const row = sqlite.prepare("SELECT rowid FROM entries WHERE id = ?").get(id) as { rowid: number } | undefined;
    if (!row) return NextResponse.json([]);

    // Get embedding for this entry
    const embRow = sqlite.prepare("SELECT embedding FROM vec_entries WHERE entry_id = ?").get(row.rowid) as { embedding: Buffer } | undefined;
    if (!embRow) return NextResponse.json([]);

    // KNN search for similar entries
    const similar = sqlite.prepare(`
      SELECT entry_id, distance
      FROM vec_entries
      WHERE embedding MATCH ?
        AND entry_id != ?
      ORDER BY distance
      LIMIT 5
    `).all(embRow.embedding, row.rowid) as { entry_id: number; distance: number }[];

    // Get entry details, filtering by user
    const results = [];
    for (const s of similar) {
      const entryRow = sqlite.prepare(
        "SELECT id, date, title, word_count as wordCount FROM entries WHERE rowid = ? AND user_id = ?"
      ).get(s.entry_id, session.user.id) as { id: string; date: string; title: string; wordCount: number } | undefined;

      if (entryRow) {
        results.push({ ...entryRow, distance: s.distance });
      }
    }

    return NextResponse.json(results);
  } catch {
    // vec_entries table may not exist yet
    return NextResponse.json([]);
  }
}
