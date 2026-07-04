import { NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateAgentToken, hashAgentToken } from "@/lib/agentAuth";

export async function GET() {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await db.execute({
    sql: "SELECT last_seen_at FROM agent_tokens WHERE user_id = ?",
    args: [session.userId],
  });
  const row = result.rows[0] as unknown as { last_seen_at: string | null } | undefined;

  // SQLite's datetime('now') returns UTC without a timezone marker (e.g. "2026-07-04 10:23:45").
  // Without a "Z" suffix, JS Date parses that string as local time, which corrupts the
  // "is the agent still connected" check for any browser not in UTC.
  const lastSeenAt = row?.last_seen_at ? row.last_seen_at.replace(" ", "T") + "Z" : null;

  return NextResponse.json({
    connected: !!row,
    lastSeenAt,
  });
}

export async function POST() {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = generateAgentToken();
  const tokenHash = hashAgentToken(token);

  await db.execute({
    sql: `INSERT INTO agent_tokens (user_id, token_hash) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, last_seen_at = NULL`,
    args: [session.userId, tokenHash],
  });

  return NextResponse.json({ token });
}

export async function DELETE() {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db.execute({
    sql: "DELETE FROM agent_tokens WHERE user_id = ?",
    args: [session.userId],
  });

  return NextResponse.json({ ok: true });
}
