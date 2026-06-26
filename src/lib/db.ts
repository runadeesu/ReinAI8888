import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir) && !process.env.TURSO_DATABASE_URL) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? `file:${path.join(dataDir, "reinai.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized: Promise<void> | null = null;

export function ensureSchema() {
  if (!initialized) {
    initialized = db.batch(
      [
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          title TEXT NOT NULL DEFAULT '新しいチャット',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER NOT NULL REFERENCES chats(id),
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ],
      "write"
    ).then(() => {});
  }
  return initialized;
}

export default db;
