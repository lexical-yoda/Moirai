import { sqlite } from "./index";

export function runMigrations() {
  // Create FTS5 virtual table for full-text search on entries
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      title,
      content,
      content='entries',
      content_rowid='rowid'
    );
  `);

  // Triggers to keep FTS5 in sync with entries table
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE OF title, content ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
      INSERT INTO entries_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
    END;
  `);
}
