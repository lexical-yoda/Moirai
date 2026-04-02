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

  try {
    const res = await fetch(`${endpointUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `HTTP ${res.status}` });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, modelLoaded: data.model_loaded ?? null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Connection failed" });
  }
}
