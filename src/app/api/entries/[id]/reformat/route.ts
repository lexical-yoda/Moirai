import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { queueTask, processQueue } from "@/lib/processing/runner";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/entries/[id]/reformat — queue a formatting task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 10 reformats per 15 minutes per user
  const rl = checkRateLimit(`reformat:${session.user.id}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { id } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await queueTask(session.user.id, id, "formatting");
  processQueue(session.user.id).catch((err) => console.error("[Processing]", err));

  return NextResponse.json({ ok: true }, { status: 202 });
}
