import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { queueTask, processQueue } from "@/lib/processing/runner";

// POST /api/entries/[id]/reformat — queue a formatting task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await queueTask(session.user.id, id, "formatting");
  processQueue(session.user.id).catch((err) => console.error("[Processing]", err));

  return NextResponse.json({ ok: true }, { status: 202 });
}
