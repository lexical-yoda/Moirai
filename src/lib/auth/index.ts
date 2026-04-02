import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { users, appSettings } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
    usePlural: true,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  user: {
    additionalFields: {
      isAdmin: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  advanced: {
    cookiePrefix: "moirai",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

/**
 * Check if registration is currently open.
 * Registration is open if: no users exist yet, or admin has explicitly enabled it.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  const userCount = await db.select({ c: count() }).from(users);
  if (userCount[0].c === 0) return true;

  const setting = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "registration_open"),
  });

  return setting?.value === "true";
}

/**
 * Make the first registered user an admin and close registration.
 */
export async function handlePostRegistration(userId: string) {
  const userCount = await db.select({ c: count() }).from(users);

  if (userCount[0].c === 1) {
    // First user — make admin
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
    // Close registration
    await db.insert(appSettings).values({ key: "registration_open", value: "false" })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: "false" } });
  }
}
