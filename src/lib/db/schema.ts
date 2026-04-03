import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Auth tables (used by better-auth) ──────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ── Global settings ────────────────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Application tables ─────────────────────────────────────────────────────

export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  encryptionPassphraseHash: text("encryption_passphrase_hash"),
  aiProvider: text("ai_provider").default("llama-server"), // llama-server | ollama | lm-studio | openai-compatible
  aiEndpointUrl: text("ai_endpoint_url"),
  aiModelName: text("ai_model_name"),
  aiApiKey: text("ai_api_key"), // encrypted
  embeddingEndpointUrl: text("embedding_endpoint_url"),
  embeddingModelName: text("embedding_model_name"),
  whisperEndpointUrl: text("whisper_endpoint_url"),
  therapyEnabled: integer("therapy_enabled", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  title: text("title").default(""),
  generatedTitle: text("generated_title"),
  content: text("content").default(""), // raw HTML from editor
  formattedContent: text("formatted_content"), // LLM-formatted version
  wordCount: integer("word_count").default(0),
  templateUsed: text("template_used"),
  isSessionDay: integer("is_session_day", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("entries_user_date_idx").on(table.userId, table.date),
]);

export const entryVersions = sqliteTable("entry_versions", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: text("title").default(""),
  content: text("content").default(""), // encrypted
  wordCount: integer("word_count").default(0),
  contentHash: text("content_hash").notNull(), // SHA-256 for dedup
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("entry_versions_entry_version_idx").on(table.entryId, table.versionNumber),
]);

export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mood: text("mood"),
  moodScore: real("mood_score"), // -1 to 1
  summary: text("summary"),
  actionItems: text("action_items"), // JSON
  keyPeople: text("key_people"), // JSON
  themes: text("themes"), // JSON
  extractedAt: integer("extracted_at", { mode: "timestamp" }).notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  isAiGenerated: integer("is_ai_generated", { mode: "boolean" }).default(false),
}, (table) => [
  uniqueIndex("tags_user_name_idx").on(table.userId, table.name),
]);

export const entryTags = sqliteTable("entry_tags", {
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("entry_tags_idx").on(table.entryId, table.tagId),
]);

export const entryLinks = sqliteTable("entry_links", {
  id: text("id").primaryKey(),
  sourceEntryId: text("source_entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  targetEntryId: text("target_entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("entry_links_unique_idx").on(table.sourceEntryId, table.targetEntryId),
]);

export const voiceRecordings = sqliteTable("voice_recordings", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  audioPath: text("audio_path").notNull(),
  transcription: text("transcription"),
  duration: real("duration"), // seconds
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const entryEmbeddings = sqliteTable("entry_embeddings", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  modelName: text("model_name").notNull(),
  embeddedAt: integer("embedded_at", { mode: "timestamp" }).notNull(),
});

export const reflections = sqliteTable("reflections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "weekly" | "monthly"
  periodStart: text("period_start").notNull(), // YYYY-MM-DD
  periodEnd: text("period_end").notNull(), // YYYY-MM-DD
  title: text("title"),
  content: text("content"), // markdown, encrypted
  moodSummary: text("mood_summary"),
  themes: text("themes"), // JSON
  keyInsights: text("key_insights"), // JSON
  entryIds: text("entry_ids"), // JSON
  generatedAt: integer("generated_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Activity tracking ──────────────────────────────────────────────────────

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").default(""),
  type: text("type").notNull(), // "good" | "bad"
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const activityLogs = sqliteTable("activity_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  entryId: text("entry_id").references(() => entries.id, { onDelete: "set null" }),
  date: text("date").notNull(), // YYYY-MM-DD
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("manual"), // "manual" | "ai"
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("activity_logs_unique_idx").on(table.userId, table.activityId, table.date),
]);

// ── Therapy tracking ───────────────────────────────────────────────────────

export const therapyItems = sqliteTable("therapy_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  type: text("type").notNull().default("topic"), // "topic" | "takeaway"
  priority: text("priority").notNull().default("medium"), // "high" | "medium" | "low"
  status: text("status").notNull().default("pending"), // "pending" | "discussed" | "resolved"
  sessionEntryId: text("session_entry_id").references(() => entries.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── People identity mapping ──────────────────────────────────────────────────

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Display name (e.g., "Sarah")
  aliases: text("aliases").notNull().default("[]"), // JSON array of alternate names (e.g., ["Mom", "Amma", "S"])
  relationship: text("relationship"), // Optional: "partner", "friend", "family", "colleague", etc.
  notes: text("notes"), // Optional notes about this person
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("people_user_name_idx").on(table.userId, table.name),
]);

// ── Background processing ──────────────────────────────────────────────────

export const processingTasks = sqliteTable("processing_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entryId: text("entry_id").references(() => entries.id, { onDelete: "cascade" }),
  recordingId: text("recording_id"),
  type: text("type").notNull(), // "transcription" | "formatting" | "insights" | "activities" | "therapy" | "embedding"
  status: text("status").notNull().default("pending"), // "pending" | "running" | "completed" | "failed"
  retries: integer("retries").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
