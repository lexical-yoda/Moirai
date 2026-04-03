import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/api-utils";
import { safeJsonParse } from "@/lib/json";

// GET /api/people — list all people for the user
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.query.people.findMany({
    where: eq(people.userId, session.user.id),
    orderBy: (p, { asc }) => [asc(p.name)],
  });

  return NextResponse.json(result.map((p) => ({
    ...p,
    aliases: safeJsonParse(p.aliases, []),
  })));
}

// POST /api/people — create a person
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const data = jsonResult.data as { name?: string; aliases?: string[]; relationship?: string; notes?: string };

  if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const name = data.name.trim();
  const aliases = Array.isArray(data.aliases) ? data.aliases.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim().toLowerCase()) : [];
  const now = new Date();

  const id = nanoid();
  try {
    await db.insert(people).values({
      id,
      userId: session.user.id,
      name,
      aliases: JSON.stringify(aliases),
      relationship: data.relationship || null,
      notes: data.notes || null,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return NextResponse.json({ error: "Person with this name already exists" }, { status: 409 });
  }

  const created = await db.query.people.findFirst({ where: eq(people.id, id) });
  return NextResponse.json({ ...created, aliases: safeJsonParse(created?.aliases || "[]", []) }, { status: 201 });
}
