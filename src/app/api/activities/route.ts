import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/api-utils";

// GET /api/activities — list user's activities
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.query.activities.findMany({
    where: eq(activities.userId, session.user.id),
    orderBy: (a, { asc }) => [asc(a.sortOrder)],
  });

  return NextResponse.json(result);
}

// POST /api/activities — create an activity
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const { name, emoji, type } = jsonResult.data as { name?: string; emoji?: string; type?: string };

  if (!name || name.length > 100 || !type || !["good", "bad"].includes(type)) {
    return NextResponse.json({ error: "name (max 100 chars) and type (good/bad) required" }, { status: 400 });
  }

  // Get next sort order
  const existing = await db.query.activities.findMany({
    where: eq(activities.userId, session.user.id),
    columns: { sortOrder: true },
    orderBy: (a, { desc }) => [desc(a.sortOrder)],
    limit: 1,
  });
  const nextOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

  const id = nanoid();
  await db.insert(activities).values({
    id,
    userId: session.user.id,
    name,
    emoji: emoji || "",
    type,
    sortOrder: nextOrder,
    active: true,
    createdAt: new Date(),
  });

  const created = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  return NextResponse.json(created, { status: 201 });
}
