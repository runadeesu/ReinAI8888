import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { chatId, command } = await req.json();
  if (typeof chatId !== "number" || typeof command !== "string" || !command.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const chatResult = await db.execute({
    sql: "SELECT id, user_id FROM chats WHERE id = ?",
    args: [chatId],
  });
  const chat = chatResult.rows[0] as unknown as { id: number; user_id: number } | undefined;
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await db.execute({
    sql: "INSERT INTO agent_commands (user_id, chat_id, command) VALUES (?, ?, ?)",
    args: [session.userId, chatId, command],
  });

  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
