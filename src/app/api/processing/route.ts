import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processingTasks } from "@/lib/db/schema";
import { eq, and, or, gte, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/processing — list recent tasks (active + last 24h)
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const tasks = await db.query.processingTasks.findMany({
    where: and(
      eq(processingTasks.userId, session.user.id),
      or(
        eq(processingTasks.status, "pending"),
        eq(processingTasks.status, "running"),
        gte(processingTasks.updatedAt, oneDayAgo)
      )
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 50,
  });

  // Count active tasks for badge
  const activeCount = tasks.filter((t) => t.status === "pending" || t.status === "running").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;

  return NextResponse.json({ tasks, activeCount, failedCount });
}

// DELETE /api/processing — clear completed and failed tasks
export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.delete(processingTasks).where(
    and(
      eq(processingTasks.userId, session.user.id),
      inArray(processingTasks.status, ["completed", "failed"])
    )
  );

  return NextResponse.json({ ok: true });
}
