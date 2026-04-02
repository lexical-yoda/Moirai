import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reflections } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { safeJsonParse } from "@/lib/json";

// GET /api/reflections — list user's reflections
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.query.reflections.findMany({
    where: eq(reflections.userId, session.user.id),
    orderBy: [desc(reflections.periodEnd)],
    columns: {
      id: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      title: true,
      moodSummary: true,
      themes: true,
      generatedAt: true,
    },
  });

  const parsed = result.map((r) => ({
    ...r,
    themes: safeJsonParse(r.themes, []),
  }));

  return NextResponse.json(parsed);
}
