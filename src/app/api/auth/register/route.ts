import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db, { ensureSchema } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  await ensureSchema();
  const { username, email, password } = await req.json();

  if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "ユーザーID・メールアドレス・パスワードを入力してください" }, { status: 400 });
  }
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
    return NextResponse.json({ error: "ユーザーIDは3〜32文字で入力してください" }, { status: 400 });
  }
  if (!EMAIL_RE.test(trimmedEmail)) {
    return NextResponse.json({ error: "有効なメールアドレスを入力してください" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
  }

  const existingUsername = await db.execute({
    sql: "SELECT id FROM users WHERE username = ?",
    args: [trimmedUsername],
  });
  if (existingUsername.rows.length > 0) {
    return NextResponse.json({ error: "そのユーザーIDは既に使用されています" }, { status: 409 });
  }

  const existingEmail = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [trimmedEmail],
  });
  if (existingEmail.rows.length > 0) {
    return NextResponse.json({ error: "そのメールアドレスは既に使用されています" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.execute({
    sql: "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    args: [trimmedUsername, trimmedEmail, passwordHash],
  });

  const userId = Number(result.lastInsertRowid);
  const token = await createSessionToken({ userId, username: trimmedUsername });
  await setSessionCookie(token);

  return NextResponse.json({ id: userId, username: trimmedUsername });
}
