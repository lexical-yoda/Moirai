import { z } from "zod/v4";

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
  .refine((d) => {
    const date = new Date(d + "T00:00:00");
    if (isNaN(date.getTime())) return false;
    // Verify the parsed date matches input (catches Feb 30 → Mar 2 rollover)
    const [y, m, day] = d.split("-").map(Number);
    return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === day;
  }, "Invalid calendar date");

export const entrySchema = z.object({
  date: dateString,
  title: z.string().max(500).optional().default(""),
  content: z.string().max(500_000).optional().default(""),
  templateUsed: z.string().max(50).optional().nullable(),
  isSessionDay: z.boolean().optional(),
  skipProcessing: z.boolean().optional(),
});

export const entryUpdateSchema = z.object({
  title: z.string().max(500).optional().default(""),
  content: z.string().max(500_000).optional().default(""),
  formattedContent: z.string().max(500_000).optional().nullable(),
  isSessionDay: z.boolean().optional(),
});

export const tagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(20).optional().nullable(),
  entryId: z.string().max(50).optional().nullable(),
});

// Allow http:// for local dev (localhost, 127.0.0.1, Docker service names), require https:// otherwise in production
const endpointUrlSchema = z.string().url().max(500).refine(
  (url) => {
    if (process.env.NODE_ENV !== "production") return true;
    try {
      const parsed = new URL(url);
      // Allow HTTP for private/local IPs and Docker service names
      const isPrivate = ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)
        || parsed.hostname.startsWith("10.")
        || parsed.hostname.startsWith("192.168.")
        || (parsed.hostname.startsWith("172.") && (() => {
            const second = parseInt(parsed.hostname.split(".")[1]);
            return second >= 16 && second <= 31;
          })())
        || !parsed.hostname.includes(".");  // Docker service names
      return isPrivate || parsed.protocol === "https:";
    } catch { return false; }
  },
  { message: "HTTPS required for public endpoints in production" }
);

export const settingsSchema = z.object({
  aiProvider: z.enum(["llama-server", "ollama", "lm-studio", "openai-compatible"]),
  aiEndpointUrl: endpointUrlSchema,
  aiModelName: z.string().max(200).optional().default(""),
  aiApiKey: z.string().max(500).optional().default(""),
  embeddingEndpointUrl: endpointUrlSchema.or(z.literal("")).optional().default(""),
  embeddingModelName: z.string().max(200).optional().default(""),
  whisperEndpointUrl: endpointUrlSchema.or(z.literal("")).optional().default(""),
  therapyEnabled: z.boolean().optional(),
});

export const reflectionGenerateSchema = z.object({
  type: z.enum(["weekly", "monthly"]),
  periodStart: dateString,
  periodEnd: dateString,
}).refine((d) => d.periodStart <= d.periodEnd, {
  message: "periodStart must be before periodEnd",
});

export const testConnectionSchema = z.object({
  endpointUrl: z.string().url().max(500),
  apiKey: z.string().max(500).optional().default(""),
});

export const therapyItemUpdateSchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["pending", "discussed", "resolved"]).optional(),
});

export const personUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  aliases: z.array(z.string().max(100)).max(20).optional(),
  relationship: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const activityLogSchema = z.object({
  activityId: z.string().min(1).max(50),
  date: dateString,
  completed: z.boolean().optional(),
  source: z.enum(["manual", "ai"]).optional(),
  entryId: z.string().max(50).optional().nullable(),
});

export const MAX_SEARCH_QUERY_LENGTH = 1000;

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => i.message).join(", ") };
  }
  return { success: true, data: result.data };
}
