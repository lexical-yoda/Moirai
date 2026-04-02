import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries, entryVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/entries/[id]/versions — list all versions
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify entry belongs to user
  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db.query.entryVersions.findMany({
    where: eq(entryVersions.entryId, id),
    orderBy: (v, { desc }) => [desc(v.versionNumber)],
    columns: {
      id: true,
      versionNumber: true,
      title: true,
      wordCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(versions);
}
