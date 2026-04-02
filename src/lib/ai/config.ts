import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface AIConfig {
  provider: string;
  endpointUrl: string;
  modelName: string | null;
  apiKey: string | null;
  embeddingEndpointUrl: string | null;
  embeddingModelName: string | null;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "llama-server",
  endpointUrl: process.env.AI_ENDPOINT_URL || "http://localhost:8080",
  modelName: null,
  apiKey: null,
  embeddingEndpointUrl: process.env.EMBEDDING_ENDPOINT_URL || null,
  embeddingModelName: null,
};

export async function getAIConfig(userId: string): Promise<AIConfig> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });

  if (!settings) return DEFAULT_CONFIG;

  return {
    provider: settings.aiProvider || DEFAULT_CONFIG.provider,
    endpointUrl: settings.aiEndpointUrl || DEFAULT_CONFIG.endpointUrl,
    modelName: settings.aiModelName || DEFAULT_CONFIG.modelName,
    apiKey: settings.aiApiKey || DEFAULT_CONFIG.apiKey,
    embeddingEndpointUrl: settings.embeddingEndpointUrl || DEFAULT_CONFIG.embeddingEndpointUrl,
    embeddingModelName: settings.embeddingModelName || DEFAULT_CONFIG.embeddingModelName,
  };
}
