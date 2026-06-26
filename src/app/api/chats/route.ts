import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const chats = db
    .prepare("SELECT id, title, created_at FROM chats WHERE user_id = ? ORDER BY id DESC")
    .all(session.userId);

  return NextResponse.json({ chats });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "新しいチャット";

  const result = db
    .prepare("INSERT INTO chats (user_id, title) VALUES (?, ?)")
    .run(session.userId, title);

  return NextResponse.json({ id: result.lastInsertRowid, title });
}
