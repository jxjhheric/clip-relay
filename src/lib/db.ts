import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { clipboardItems, shareLinks } from './db/schema';

function resolveSqlitePath(): string {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    // support formats like: file:/abs/path.db or file:relative/path.db or plain path
    if (envUrl.startsWith('file:')) {
      const p = envUrl.slice('file:'.length);
      return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    }
    return path.isAbsolute(envUrl) ? envUrl : path.join(process.cwd(), envUrl);
  }
  return path.join(process.cwd(), 'data', 'custom.db');
}

function ensureDataDir(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureSchema(db: Database.Database) {
  // Create tables if not exists (runtime bootstrap to simplify slim image usage)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS ClipboardItem (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      fileName TEXT,
      fileSize INTEGER,
      contentType TEXT,
      inlineData BLOB,
      filePath TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS clipboard_created_idx ON ClipboardItem (createdAt, id);

    CREATE TABLE IF NOT EXISTS ShareLink (
      token TEXT PRIMARY KEY NOT NULL,
      itemId TEXT NOT NULL,
      expiresAt INTEGER,
      maxDownloads INTEGER,
      downloadCount INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0,
      passwordHash TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      CONSTRAINT share_item_fk FOREIGN KEY (itemId) REFERENCES ClipboardItem(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS share_item_idx ON ShareLink (itemId);
    CREATE INDEX IF NOT EXISTS share_created_idx ON ShareLink (createdAt);
  `);
}

const sqlitePath = resolveSqlitePath();
ensureDataDir(sqlitePath);
const sqlite = new Database(sqlitePath);
ensureSchema(sqlite);

export const db = drizzle(sqlite, { schema: { clipboardItems, shareLinks } });
export { clipboardItems, shareLinks };
