import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { auth } from "@/lib/auth";

async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user?.isAdmin) return null;
  return user;
}

// GET /api/admin/users — list all users
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allUsers = await db.query.users.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return NextResponse.json(allUsers);
}

// DELETE /api/admin/users — delete a user
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await request.json().catch(() => ({ userId: null }));
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (userId === admin.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Prevent deleting the last admin — would cause permanent lockout
  const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (targetUser?.isAdmin) {
    const adminCount = await db.select({ c: count() }).from(users).where(eq(users.isAdmin, true));
    if (adminCount[0].c <= 1) {
      return NextResponse.json({ error: "Cannot delete the last admin account" }, { status: 400 });
    }
  }

  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ success: true });
}
