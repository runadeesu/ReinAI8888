import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
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

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(trimmedUsername);
  if (existing) {
    return NextResponse.json({ error: "そのユーザー名は既に使用されています" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(trimmedUsername, passwordHash);

  const userId = result.lastInsertRowid as number;
  const token = await createSessionToken({ userId, username: trimmedUsername });
  await setSessionCookie(token);

  return NextResponse.json({ id: userId, username: trimmedUsername });
}
