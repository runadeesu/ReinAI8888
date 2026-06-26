import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";

type ChatRow = { id: number; user_id: number };

function getOwnedChat(chatId: number, userId: number) {
  return db.prepare("SELECT id, user_id FROM chats WHERE id = ?").get(chatId) as ChatRow | undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = Number(id);
  const chat = getOwnedChat(chatId, session.userId);
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const messages = db
    .prepare("SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC")
    .all(chatId);

  return NextResponse.json({ messages });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = Number(id);
  const chat = getOwnedChat(chatId, session.userId);
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  db.prepare("DELETE FROM chats WHERE id = ?").run(chatId);

  return NextResponse.json({ ok: true });
}
