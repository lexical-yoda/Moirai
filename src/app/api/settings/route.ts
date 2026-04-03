import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { settingsSchema, parseBody } from "@/lib/validation";
import { parseJsonBody } from "@/lib/api-utils";
import { encryptApiKey } from "@/lib/ai/config";

// GET /api/settings — never return API key in plaintext
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
  });

  const defaultWhisper = process.env.WHISPER_URL || "";

  return NextResponse.json({
    aiProvider: settings?.aiProvider || "llama-server",
    aiEndpointUrl: settings?.aiEndpointUrl || process.env.AI_ENDPOINT_URL || "",
    aiModelName: settings?.aiModelName || "",
    aiApiKey: settings?.aiApiKey ? "••••••••" : "",
    embeddingEndpointUrl: settings?.embeddingEndpointUrl || "",
    embeddingModelName: settings?.embeddingModelName || "",
    whisperEndpointUrl: settings?.whisperEndpointUrl || defaultWhisper,
    hasApiKey: !!settings?.aiApiKey,
    therapyEnabled: settings?.therapyEnabled || false,
  });
}

// PUT /api/settings
export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(settingsSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { aiProvider, aiEndpointUrl, aiModelName, aiApiKey, embeddingEndpointUrl, embeddingModelName, whisperEndpointUrl, therapyEnabled } = parsed.data;

  const now = new Date();

  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
  });

  // Keep existing key if masked placeholder is sent; encrypt new keys
  const resolvedApiKey = aiApiKey === "••••••••"
    ? existing?.aiApiKey || null
    : aiApiKey ? encryptApiKey(aiApiKey) : null;

  if (existing) {
    await db.update(userSettings).set({
      aiProvider,
      aiEndpointUrl,
      aiModelName: aiModelName || null,
      aiApiKey: resolvedApiKey,
      embeddingEndpointUrl: embeddingEndpointUrl || null,
      embeddingModelName: embeddingModelName || null,
      whisperEndpointUrl: whisperEndpointUrl || null,
      therapyEnabled: therapyEnabled ?? existing.therapyEnabled,
      updatedAt: now,
    }).where(eq(userSettings.userId, session.user.id));
  } else {
    await db.insert(userSettings).values({
      id: nanoid(),
      userId: session.user.id,
      aiProvider,
      aiEndpointUrl,
      aiModelName: aiModelName || null,
      aiApiKey: resolvedApiKey,
      embeddingEndpointUrl: embeddingEndpointUrl || null,
      embeddingModelName: embeddingModelName || null,
      whisperEndpointUrl: whisperEndpointUrl || null,
      therapyEnabled: therapyEnabled || false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ success: true });
}
