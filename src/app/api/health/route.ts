import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { testConnection } from "@/lib/ai/client";

// GET /api/health
// Without auth: basic liveness (for load balancers)
// With auth: detailed status of user's configured services
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

  if (!session?.user) {
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  }

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
  });

  const checks: Record<string, { status: string; endpoint?: string; error?: string }> = {};

  // Test AI endpoint if configured
  if (settings?.aiEndpointUrl) {
    const result = await testConnection({
      provider: settings.aiProvider || "llama-server",
      endpointUrl: settings.aiEndpointUrl,
      modelName: null,
      apiKey: settings.aiApiKey || null,
      embeddingEndpointUrl: null,
      embeddingModelName: null,
    });
    checks.ai = {
      status: result.ok ? "online" : "offline",
      endpoint: settings.aiEndpointUrl,
      error: result.error,
    };
  }

  // Test Whisper endpoint if configured
  if (settings?.whisperEndpointUrl) {
    try {
      const res = await fetch(`${settings.whisperEndpointUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      checks.whisper = {
        status: res.ok ? "online" : "offline",
        endpoint: settings.whisperEndpointUrl,
      };
    } catch (err) {
      checks.whisper = {
        status: "offline",
        endpoint: settings.whisperEndpointUrl,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  return NextResponse.json({ status: "ok", services: checks });
}
