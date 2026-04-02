import { toNextJsHandler } from "better-auth/next-js";
import { auth, isRegistrationOpen, handlePostRegistration } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";

  const { allowed, retryAfterMs } = checkRateLimit(`auth:${ip}`, 10, 15 * 60 * 1000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  // Block registration if closed
  const url = new URL(request.url);
  if (url.pathname.endsWith("/sign-up/email")) {
    const open = await isRegistrationOpen();
    if (!open) {
      return NextResponse.json(
        { error: "Registration is currently closed." },
        { status: 403 }
      );
    }
  }

  // Call the original handler
  const response = await handler.POST(request);

  // After successful signup, handle first-user admin + close registration
  if (url.pathname.endsWith("/sign-up/email") && response.ok) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      if (data?.user?.id) {
        await handlePostRegistration(data.user.id);
      }
    } catch {
      // Non-blocking — don't fail the signup
    }
  }

  return response;
}
