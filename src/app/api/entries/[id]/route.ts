import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { contentHash } from "@/lib/encryption";
import { entryUpdateSchema, parseBody } from "@/lib/validation";
import { parseJsonBody } from "@/lib/api-utils";

async function getUser(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return session.user;
}

function wordCount(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

// GET /api/entries/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, user.id)),
  });

  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entry);
}

// PUT /api/entries/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, user.id)),
  });

  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(entryUpdateSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { title, content, formattedContent, isSessionDay } = parsed.data;
  const now = new Date();
  const wc = wordCount(content || "");
  const newHash = contentHash(content || "");
  const oldHash = contentHash(entry.content || "");

  // Atomic version creation + entry update in a transaction
  const saveVersion = sqlite.transaction(() => {
    if (newHash !== oldHash) {
      const latestVersion = sqlite.prepare(
        "SELECT version_number FROM entry_versions WHERE entry_id = ? ORDER BY version_number DESC LIMIT 1"
      ).get(id) as { version_number: number } | undefined;

      const versionNumber = latestVersion ? latestVersion.version_number + 1 : 1;
      sqlite.prepare(
        `INSERT INTO entry_versions (id, entry_id, user_id, version_number, title, content, word_count, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        nanoid(), id, user.id, versionNumber,
        entry.title || "", entry.content || "", entry.wordCount || 0,
        oldHash, Math.floor(now.getTime() / 1000)
      );
    }

    const updates: string[] = ["title = ?", "content = ?", "word_count = ?", "updated_at = ?"];
    const values: unknown[] = [title, content, wc, Math.floor(now.getTime() / 1000)];

    if (formattedContent !== undefined) { updates.push("formatted_content = ?"); values.push(formattedContent); }
    if (isSessionDay !== undefined) { updates.push("is_session_day = ?"); values.push(isSessionDay ? 1 : 0); }

    values.push(id);
    sqlite.prepare(`UPDATE entries SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  });

  saveVersion();

  const updated = await db.query.entries.findFirst({ where: eq(entries.id, id) });
  return NextResponse.json(updated);
}

// DELETE /api/entries/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, user.id)),
  });

  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cancel any pending or running processing tasks before deletion
  const { processingTasks } = await import("@/lib/db/schema");
  const { or } = await import("drizzle-orm");
  await db.update(processingTasks)
    .set({ status: "failed", errorMessage: "Entry deleted", updatedAt: new Date() })
    .where(and(
      eq(processingTasks.entryId, id),
      or(eq(processingTasks.status, "pending"), eq(processingTasks.status, "running"))
    ));

  await db.delete(entries).where(eq(entries.id, id));
  return NextResponse.json({ success: true });
}
