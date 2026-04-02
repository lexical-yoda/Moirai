import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries, insights, entryTags, tags } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { safeJsonParse } from "@/lib/json";

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
