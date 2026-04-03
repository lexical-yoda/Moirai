import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateReflection } from "@/lib/ai/reflections";
import { reflectionGenerateSchema, parseBody } from "@/lib/validation";
import { parseJsonBody } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/reflections/generate
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 5 reflection generations per 15 minutes per user
  const rl = checkRateLimit(`reflect:${session.user.id}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(reflectionGenerateSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { type, periodStart, periodEnd } = parsed.data;

  try {
    const reflection = await generateReflection(session.user.id, type, periodStart, periodEnd);
    return NextResponse.json(reflection, { status: 201 });
  } catch (err) {
    console.error("[Reflections] Generation failed:", err);
    // Don't leak internal error details to client
    const safeMessages = ["No entries found in this period", "AI service temporarily unavailable", /^A (weekly|monthly) reflection for this period already exists$/];
    const message = err instanceof Error && safeMessages.some((m) => typeof m === "string" ? m === err.message : m.test(err.message))
      ? err.message
      : "Failed to generate reflection. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
