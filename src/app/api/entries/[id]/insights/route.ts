import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries, insights, entryTags, tags } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { safeJsonParse } from "@/lib/json";
import { parseJsonBody } from "@/lib/api-utils";

// GET /api/entries/[id]/insights
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const insight = await db.query.insights.findFirst({
    where: and(eq(insights.entryId, id), eq(insights.userId, session.user.id)),
  });

  if (!insight) return NextResponse.json(null);

  // Fetch entry tags grouped by category
  const tagLinks = await db.query.entryTags.findMany({
    where: eq(entryTags.entryId, id),
  });
  const tagIds = tagLinks.map((t) => t.tagId);
  const linkedTags = tagIds.length > 0
    ? await db.query.tags.findMany({
        where: and(eq(tags.userId, session.user.id), inArray(tags.id, tagIds)),
      })
    : [];

  const events: string[] = [];
  const places: string[] = [];
  for (const tag of linkedTags) {
    if (tag.name.startsWith("event:")) events.push(tag.name.slice(6));
    else if (tag.name.startsWith("place:")) places.push(tag.name.slice(6));
  }

  return NextResponse.json({
    ...insight,
    actionItems: safeJsonParse(insight.actionItems, []),
    keyPeople: safeJsonParse(insight.keyPeople, []),
    themes: safeJsonParse(insight.themes, []),
    events,
    places,
  });
}

// PUT /api/entries/[id]/insights — update people (edit/remove)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const insight = await db.query.insights.findFirst({
    where: and(eq(insights.entryId, id), eq(insights.userId, session.user.id)),
  });
  if (!insight) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const data = jsonResult.data as { action: string; oldName?: string; newName?: string };

  const currentPeople: string[] = safeJsonParse(insight.keyPeople, []);

  if (data.action === "edit" && data.oldName && data.newName) {
    const updated = currentPeople.map((p) => p === data.oldName ? data.newName! : p);
    await db.update(insights)
      .set({ keyPeople: JSON.stringify(updated) })
      .where(eq(insights.id, insight.id));

    // Also update person: tags
    const oldTag = await db.query.tags.findFirst({
      where: and(eq(tags.userId, session.user.id), eq(tags.name, `person:${data.oldName.toLowerCase()}`)),
    });
    if (oldTag) {
      // Try to find or create the new tag
      const newTagName = `person:${data.newName.toLowerCase()}`;
      let newTag = await db.query.tags.findFirst({
        where: and(eq(tags.userId, session.user.id), eq(tags.name, newTagName)),
      });
      if (!newTag) {
        const { nanoid } = await import("nanoid");
        const tagId = nanoid();
        await db.insert(tags).values({ id: tagId, userId: session.user.id, name: newTagName, isAiGenerated: true });
        newTag = await db.query.tags.findFirst({ where: eq(tags.id, tagId) });
      }
      // Swap tag link
      if (newTag) {
        await db.delete(entryTags).where(and(eq(entryTags.entryId, id), eq(entryTags.tagId, oldTag.id)));
        const existing = await db.query.entryTags.findFirst({
          where: and(eq(entryTags.entryId, id), eq(entryTags.tagId, newTag.id)),
        });
        if (!existing) await db.insert(entryTags).values({ entryId: id, tagId: newTag.id });
      }
    }

    // Replace in entry content
    const entry = await db.query.entries.findFirst({ where: eq(entries.id, id) });
    if (entry?.content) {
      const escaped = data.oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      const newContent = entry.content.replace(regex, data.newName);
      if (newContent !== entry.content) {
        await db.update(entries).set({ content: newContent, updatedAt: new Date() }).where(eq(entries.id, id));
      }
    }

    return NextResponse.json({ keyPeople: updated });
  }

  if (data.action === "remove" && data.oldName) {
    const updated = currentPeople.filter((p) => p !== data.oldName);
    await db.update(insights)
      .set({ keyPeople: JSON.stringify(updated) })
      .where(eq(insights.id, insight.id));

    return NextResponse.json({ keyPeople: updated });
  }

  // Place edit/remove — places are stored as tags with "place:" prefix
  if (data.action === "edit-place" && data.oldName && data.newName) {
    const oldTagName = `place:${data.oldName.toLowerCase()}`;
    const newTagName = `place:${data.newName.toLowerCase()}`;

    const oldTag = await db.query.tags.findFirst({
      where: and(eq(tags.userId, session.user.id), eq(tags.name, oldTagName)),
    });
    if (oldTag) {
      let newTag = await db.query.tags.findFirst({
        where: and(eq(tags.userId, session.user.id), eq(tags.name, newTagName)),
      });
      if (!newTag) {
        const { nanoid } = await import("nanoid");
        const tagId = nanoid();
        await db.insert(tags).values({ id: tagId, userId: session.user.id, name: newTagName, isAiGenerated: true });
        newTag = await db.query.tags.findFirst({ where: eq(tags.id, tagId) });
      }
      if (newTag) {
        await db.delete(entryTags).where(and(eq(entryTags.entryId, id), eq(entryTags.tagId, oldTag.id)));
        const existing = await db.query.entryTags.findFirst({
          where: and(eq(entryTags.entryId, id), eq(entryTags.tagId, newTag.id)),
        });
        if (!existing) await db.insert(entryTags).values({ entryId: id, tagId: newTag.id });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (data.action === "remove-place" && data.oldName) {
    const tagName = `place:${data.oldName.toLowerCase()}`;
    const tag = await db.query.tags.findFirst({
      where: and(eq(tags.userId, session.user.id), eq(tags.name, tagName)),
    });
    if (tag) {
      await db.delete(entryTags).where(and(eq(entryTags.entryId, id), eq(entryTags.tagId, tag.id)));
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
