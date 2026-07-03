import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await db.execute({
    sql: "SELECT id, title, created_at FROM chats WHERE user_id = ? ORDER BY id DESC",
    args: [session.userId],
  });

  return NextResponse.json({ chats: result.rows });
}

export async function DELETE() {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const chatIds = await db.execute({
    sql: "SELECT id FROM chats WHERE user_id = ?",
    args: [session.userId],
  });
  const ids = chatIds.rows.map((r) => (r as unknown as { id: number }).id);
  if (ids.length > 0) {
    await db.batch(
      [
        ...ids.map((id) => ({ sql: "DELETE FROM messages WHERE chat_id = ?", args: [id] })),
        { sql: "DELETE FROM chats WHERE user_id = ?", args: [session.userId] },
      ],
      "write"
    );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "新しいチャット";

  const result = await db.execute({
    sql: "INSERT INTO chats (user_id, title) VALUES (?, ?)",
    args: [session.userId, title],
  });

  return NextResponse.json({ id: Number(result.lastInsertRowid), title });
}