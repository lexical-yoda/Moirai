import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, sqlite } from "@/lib/db";
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
 * Uses a transaction to prevent race conditions with concurrent registrations.
 */
export async function handlePostRegistration(userId: string) {
  const promoteFirstUser = sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
    if (row.c === 1) {
      // First user — make admin and close registration atomically
      sqlite.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(userId);
      sqlite.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('registration_open', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'"
      ).run();
    }
  });

  promoteFirstUser();
}
