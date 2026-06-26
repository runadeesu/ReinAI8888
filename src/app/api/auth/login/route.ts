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

  const result = await db.execute({
    sql: "SELECT id, username, password_hash FROM users WHERE username = ?",
    args: [username.trim()],
  });
  const user = result.rows[0] as unknown as
    | { id: number; username: string; password_hash: string }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: "ユーザー名またはパスワードが正しくありません" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "ユーザー名またはパスワードが正しくありません" }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user.id, username: user.username });
  await setSessionCookie(token);

  return NextResponse.json({ id: user.id, username: user.username });
}
