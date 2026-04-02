import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processingTasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { processQueue } from "@/lib/processing/runner";

// POST /api/processing/retry/[id] — retry a failed task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const task = await db.query.processingTasks.findFirst({
    where: and(eq(processingTasks.id, id), eq(processingTasks.userId, session.user.id)),
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (task.status !== "failed") {
    return NextResponse.json({ error: "Only failed tasks can be retried" }, { status: 400 });
  }

  await db.update(processingTasks)
    .set({ status: "pending", retries: 0, errorMessage: null, updatedAt: new Date() })
    .where(eq(processingTasks.id, id));

  // Fire-and-forget
  processQueue(session.user.id).catch((err) => console.error("[Processing]", err));

  return NextResponse.json({ ok: true });
}
