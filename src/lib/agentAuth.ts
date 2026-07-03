import { randomBytes, createHash } from "crypto";
import db from "@/lib/db";

export function generateAgentToken() {
  return `reinai_agent_${randomBytes(24).toString("hex")}`;
}

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getUserIdFromAgentToken(req: Request): Promise<number | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;

  const tokenHash = hashAgentToken(token);
  const result = await db.execute({
    sql: "SELECT user_id FROM agent_tokens WHERE token_hash = ?",
    args: [tokenHash],
  });
  const row = result.rows[0] as unknown as { user_id: number } | undefined;
  if (!row) return null;

  await db.execute({
    sql: "UPDATE agent_tokens SET last_seen_at = datetime('now') WHERE token_hash = ?",
    args: [tokenHash],
  });

  return row.user_id;
}
