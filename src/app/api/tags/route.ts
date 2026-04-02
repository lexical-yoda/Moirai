import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tags, entryTags, entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { tagSchema, parseBody } from "@/lib/validation";
import { parseJsonBody } from "@/lib/api-utils";

// GET /api/tags — list user's tags
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.query.tags.findMany({
    where: eq(tags.userId, session.user.id),
    orderBy: (t, { asc }) => [asc(t.name)],
  });

  return NextResponse.json(result);
}

// POST /api/tags — create a tag and optionally link to an entry
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(tagSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, color, entryId } = parsed.data;

  // Find or create tag
  let tag = await db.query.tags.findFirst({
    where: and(eq(tags.userId, session.user.id), eq(tags.name, name)),
  });

  if (!tag) {
    const id = nanoid();
    await db.insert(tags).values({
      id,
      userId: session.user.id,
      name,
      color: color || null,
      isAiGenerated: false,
    });
    tag = await db.query.tags.findFirst({ where: eq(tags.id, id) });
  }

  // Link to entry if entryId provided (verify ownership first)
  if (entryId && tag) {
    const entry = await db.query.entries.findFirst({
      where: and(eq(entries.id, entryId), eq(entries.userId, session.user.id)),
    });
    if (entry) {
      const existing = await db.query.entryTags.findFirst({
        where: and(eq(entryTags.entryId, entryId), eq(entryTags.tagId, tag.id)),
      });
      if (!existing) {
        await db.insert(entryTags).values({ entryId, tagId: tag.id });
      }
    }
  }

  return NextResponse.json(tag);
}
