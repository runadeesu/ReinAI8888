import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db, { ensureSchema } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const { username, password } = await req.json();

  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "ユーザー名とパスワードを入力してください" }, { status: 400 });
  }
  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
    return NextResponse.json({ error: "ユーザー名は3〜32文字で入力してください" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
  }

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE username = ?",
    args: [trimmedUsername],
  });
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "そのユーザー名は既に使用されています" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.execute({
    sql: "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    args: [trimmedUsername, passwordHash],
  });

  const userId = Number(result.lastInsertRowid);
  const token = await createSessionToken({ userId, username: trimmedUsername });
  await setSessionCookie(token);

  return NextResponse.json({ id: userId, username: trimmedUsername });
}
