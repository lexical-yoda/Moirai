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

/**
 * Validate that a URL is not targeting dangerous internal endpoints (SSRF protection).
 * Blocks requests to link-local, loopback (unless localhost), and metadata service IPs.
 */
function validateEndpointUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Block metadata service IPs (cloud provider SSRF targets)
    if (hostname === "169.254.169.254" || hostname.startsWith("169.254.")) return false;

    // Block IPv6 loopback and link-local
    if (hostname === "[::1]" || hostname.startsWith("[fe80:")) return false;

    // Block file:// and other non-http schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Decrypt an API key stored in the database.
 * Keys are stored with a "enc:v1:" prefix when encrypted via BETTER_AUTH_SECRET.
 * Plain-text keys (legacy) are returned as-is.
 */
function decryptApiKey(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith("enc:v1:")) return stored; // legacy plain-text key
  try {
    const crypto = require("crypto");
    const secret = process.env.BETTER_AUTH_SECRET || "";
    const payload = stored.slice(7); // strip "enc:v1:"
    const [ivHex, tagHex, encryptedHex] = payload.split(":");
    const key = crypto.scryptSync(secret, "moirai-api-key-salt", 32);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("[AI Config] Failed to decrypt API key:", err);
    return null;
  }
}

/**
 * Encrypt an API key for storage in the database.
 * Returns a string with "enc:v1:" prefix.
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) return "";
  const crypto = require("crypto");
  const secret = process.env.BETTER_AUTH_SECRET || "";
  const key = crypto.scryptSync(secret, "moirai-api-key-salt", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function getAIConfig(userId: string): Promise<AIConfig> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });

  if (!settings) return DEFAULT_CONFIG;

  const endpointUrl = settings.aiEndpointUrl || DEFAULT_CONFIG.endpointUrl;
  const embeddingEndpointUrl = settings.embeddingEndpointUrl || DEFAULT_CONFIG.embeddingEndpointUrl;

  // SSRF validation — reject dangerous internal targets
  if (!validateEndpointUrl(endpointUrl)) {
    console.error(`[AI Config] Blocked SSRF attempt to ${endpointUrl}`);
    return DEFAULT_CONFIG;
  }
  if (embeddingEndpointUrl && !validateEndpointUrl(embeddingEndpointUrl)) {
    console.error(`[AI Config] Blocked SSRF attempt to ${embeddingEndpointUrl}`);
    return { ...DEFAULT_CONFIG, embeddingEndpointUrl: null };
  }

  return {
    provider: settings.aiProvider || DEFAULT_CONFIG.provider,
    endpointUrl,
    modelName: settings.aiModelName || DEFAULT_CONFIG.modelName,
    apiKey: decryptApiKey(settings.aiApiKey) || DEFAULT_CONFIG.apiKey,
    embeddingEndpointUrl,
    embeddingModelName: settings.embeddingModelName || DEFAULT_CONFIG.embeddingModelName,
  };
}
