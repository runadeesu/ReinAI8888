import { createClient } from "@libsql/client/http";

if (!process.env.TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL is not set");
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized: Promise<void> | null = null;

async function addColumnIfMissing(table: string, column: string, definition: string) {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    // Column already exists — libSQL throws "duplicate column name"
    if (!(err instanceof Error) || !err.message.includes("duplicate column")) throw err;
  }
}

export function ensureSchema() {
  if (!initialized) {
    initialized = (async () => {
      await db.batch(
        [
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT,
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
      );
      await addColumnIfMissing("users", "google_id", "TEXT");
      await addColumnIfMissing("users", "email", "TEXT");
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id)"
      );
    })();
  }
  return initialized;
}

export default db;