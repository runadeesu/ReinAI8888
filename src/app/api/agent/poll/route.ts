import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getUserIdFromAgentToken } from "@/lib/agentAuth";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const userId = await getUserIdFromAgentToken(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await db.execute({
    sql: `SELECT id, command FROM agent_commands
          WHERE user_id = ? AND status = 'pending'
          ORDER BY id ASC LIMIT 1`,
    args: [userId],
  });
  const row = result.rows[0] as unknown as { id: number; command: string } | undefined;

  if (!row) return NextResponse.json({ command: null });

  return NextResponse.json({ command: { id: row.id, command: row.command } });
}
