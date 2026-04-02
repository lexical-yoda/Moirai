import { NextRequest, NextResponse } from "next/server";

/**
 * Safely parse JSON from a request body. Returns 400 on malformed input.
 */
export async function parseJsonBody(request: NextRequest): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    const data = await request.json();
    return { data };
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
}
