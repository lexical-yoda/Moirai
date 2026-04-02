import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "moirai.db");

function createDatabase() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  initializeTables(sqlite);

  return sqlite;
}

function initializeTables(db: Database.Database) {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
  ).get();

  if (exists) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL, expires_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique ON sessions(token);

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL, provider_id TEXT NOT NULL, access_token TEXT, refresh_token TEXT,
      access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, id_token TEXT,
      password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      encryption_passphrase_hash TEXT,
      ai_provider TEXT DEFAULT 'llama-server', ai_endpoint_url TEXT, ai_model_name TEXT, ai_api_key TEXT,
      embedding_endpoint_url TEXT, embedding_model_name TEXT, whisper_endpoint_url TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_unique ON user_settings(user_id);

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL, title TEXT DEFAULT '', content TEXT DEFAULT '',
      word_count INTEGER DEFAULT 0, template_used TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS entries_user_date_idx ON entries(user_id, date);

    CREATE TABLE IF NOT EXISTS entry_versions (
      id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL, title TEXT DEFAULT '', content TEXT DEFAULT '',
      word_count INTEGER DEFAULT 0, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS entry_versions_entry_version_idx ON entry_versions(entry_id, version_number);

    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mood TEXT, mood_score REAL, summary TEXT, action_items TEXT, key_people TEXT, themes TEXT,
      extracted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, color TEXT, is_ai_generated INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_idx ON tags(user_id, name);

    CREATE TABLE IF NOT EXISTS entry_links (
      id TEXT PRIMARY KEY NOT NULL,
      source_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      target_entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS entry_links_unique_idx ON entry_links(source_entry_id, target_entry_id);

    CREATE TABLE IF NOT EXISTS entry_tags (
      entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS entry_tags_idx ON entry_tags(entry_id, tag_id);

    CREATE TABLE IF NOT EXISTS voice_recordings (
      id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      audio_path TEXT NOT NULL, transcription TEXT, duration REAL, created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entry_embeddings (
      id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      model_name TEXT NOT NULL, embedded_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      title TEXT, content TEXT, mood_summary TEXT, themes TEXT, key_insights TEXT, entry_ids TEXT,
      generated_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      title, content, content='entries', content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE OF title, content ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
      INSERT INTO entries_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
    END;
  `);

  console.log("[DB] Tables initialized");
}

const sqlite = createDatabase();
export const db = drizzle(sqlite, { schema });
export { sqlite };
