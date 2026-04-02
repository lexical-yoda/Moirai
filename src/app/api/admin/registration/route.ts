import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user?.isAdmin) return null;
  return user;
}

// GET /api/admin/registration — check if registration is open
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const setting = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "registration_open"),
  });

  return NextResponse.json({ open: setting?.value === "true" });
}

// PUT /api/admin/registration — toggle registration
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.open !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await db.insert(appSettings).values({ key: "registration_open", value: String(body.open) })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: String(body.open) } });

  return NextResponse.json({ open: body.open });
}
