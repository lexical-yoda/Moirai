import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Auth tables (used by better-auth) ──────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
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

// ── Application tables ─────────────────────────────────────────────────────

export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  encryptionPassphraseHash: text("encryption_passphrase_hash"),
  aiProvider: text("ai_provider").default("llama-server"), // llama-server | ollama | lm-studio | openai-compatible
  aiEndpointUrl: text("ai_endpoint_url").default("http://localhost:8080"),
  aiModelName: text("ai_model_name"),
  aiApiKey: text("ai_api_key"), // encrypted
  embeddingEndpointUrl: text("embedding_endpoint_url"),
  embeddingModelName: text("embedding_model_name"),
  whisperEndpointUrl: text("whisper_endpoint_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  title: text("title").default(""),
  content: text("content").default(""), // markdown, encrypted at rest
  wordCount: integer("word_count").default(0),
  templateUsed: text("template_used"),
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
