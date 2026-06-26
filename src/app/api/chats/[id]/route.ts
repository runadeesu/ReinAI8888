import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

type ChatRow = { id: number; user_id: number };

async function getOwnedChat(chatId: number) {
  const result = await db.execute({
    sql: "SELECT id, user_id FROM chats WHERE id = ?",
    args: [chatId],
  });
  return result.rows[0] as unknown as ChatRow | undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = Number(id);
  const chat = await getOwnedChat(chatId);
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await db.execute({
    sql: "SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC",
    args: [chatId],
  });

  return NextResponse.json({ messages: result.rows });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = Number(id);
  const chat = await getOwnedChat(chatId);
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await db.batch(
    [
      { sql: "DELETE FROM messages WHERE chat_id = ?", args: [chatId] },
      { sql: "DELETE FROM chats WHERE id = ?", args: [chatId] },
    ],
    "write"
  );

  return NextResponse.json({ ok: true });
}
