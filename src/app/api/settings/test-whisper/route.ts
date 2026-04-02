import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api-utils";

// POST /api/settings/test-whisper
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const { endpointUrl } = jsonResult.data as { endpointUrl?: string };

  if (!endpointUrl) {
    return NextResponse.json({ ok: false, error: "Endpoint URL required" });
  }

  // Try multiple health check paths (different whisper servers use different endpoints)
  const healthPaths = ["/health", "/docs", "/"];
  for (const path of healthPaths) {
    try {
      const res = await fetch(`${endpointUrl}${path}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        return NextResponse.json({ ok: true });
      }
    } catch (err) {
      console.error("[Settings] Whisper test failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: false, error: "Connection failed — server not reachable" });
}
