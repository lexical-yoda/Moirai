import { AIConfig } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
}

export interface EmbeddingResponse {
  embedding: number[];
}

/**
 * Unified AI client — all backends use OpenAI-compatible API format.
 */
export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; responseFormat?: { type: string } }
): Promise<ChatResponse> {
  const url = `${config.endpointUrl}/v1/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2048,
  };
  if (config.modelName) {
    body.model = config.modelName;
  }
  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[AI Client] Chat completion failed (${res.status}):`, text.slice(0, 500));
    throw new Error("AI service temporarily unavailable");
  }

  const data = await res.json();
  return { content: data.choices[0].message.content };
}

export async function generateEmbedding(
  config: AIConfig,
  text: string
): Promise<EmbeddingResponse> {
  const url = config.embeddingEndpointUrl
    ? `${config.embeddingEndpointUrl}/v1/embeddings`
    : `${config.endpointUrl}/v1/embeddings`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = { input: text };
  if (config.embeddingModelName) {
    body.model = config.embeddingModelName;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    console.error(`[AI Client] Embedding failed (${res.status}):`, errorText.slice(0, 500));
    throw new Error("Embedding service temporarily unavailable");
  }

  const data = await res.json();
  return { embedding: data.data[0].embedding };
}

export async function testConnection(config: AIConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${config.endpointUrl}/v1/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
