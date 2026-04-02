import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries, entryVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { contentHash } from "@/lib/encryption";

// POST /api/entries/[id]/versions/[versionId]/revert — revert to a version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, versionId } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const version = await db.query.entryVersions.findFirst({
    where: and(eq(entryVersions.id, versionId), eq(entryVersions.entryId, id), eq(entryVersions.userId, session.user.id)),
  });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const now = Math.floor(Date.now() / 1000);

  // Atomic: save current as version + revert entry in one transaction
  const revert = sqlite.transaction(() => {
    const latestVersion = sqlite.prepare(
      "SELECT version_number FROM entry_versions WHERE entry_id = ? ORDER BY version_number DESC LIMIT 1"
    ).get(id) as { version_number: number } | undefined;

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

    sqlite.prepare(
      `INSERT INTO entry_versions (id, entry_id, user_id, version_number, title, content, word_count, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nanoid(), id, session.user.id, nextVersionNumber,
      entry.title || "", entry.content || "", entry.wordCount || 0,
      contentHash(entry.content || ""), now
    );

    sqlite.prepare(
      "UPDATE entries SET title = ?, content = ?, word_count = ?, updated_at = ? WHERE id = ?"
    ).run(version.title, version.content, version.wordCount, now, id);
  });

  revert();

  const updated = await db.query.entries.findFirst({ where: eq(entries.id, id) });
  return NextResponse.json(updated);
}
