import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries, insights } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

  return NextResponse.json({
    ...insight,
    actionItems: safeJsonParse(insight.actionItems, []),
    keyPeople: safeJsonParse(insight.keyPeople, []),
    themes: safeJsonParse(insight.themes, []),
  });
}
