import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries, entryVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/entries/[id]/versions/[versionId] — get version content
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, versionId } = await params;

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const version = await db.query.entryVersions.findFirst({
    where: and(eq(entryVersions.id, versionId), eq(entryVersions.entryId, id), eq(entryVersions.userId, session.user.id)),
  });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  return NextResponse.json(version);
}
