import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testConnection } from "@/lib/ai/client";
import { testConnectionSchema, parseBody } from "@/lib/validation";
import { parseJsonBody } from "@/lib/api-utils";

// POST /api/settings/test-connection
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(testConnectionSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await testConnection({
    provider: "",
    endpointUrl: parsed.data.endpointUrl,
    modelName: null,
    apiKey: parsed.data.apiKey || null,
    embeddingEndpointUrl: null,
    embeddingModelName: null,
  });

  return NextResponse.json(result);
}
