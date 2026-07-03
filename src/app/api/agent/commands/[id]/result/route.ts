import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getUserIdFromAgentToken } from "@/lib/agentAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const userId = await getUserIdFromAgentToken(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { output, exitCode } = await req.json();

  const result = await db.execute({
    sql: "SELECT id, user_id FROM agent_commands WHERE id = ?",
    args: [Number(id)],
  });
  const row = result.rows[0] as unknown as { id: number; user_id: number } | undefined;
  if (!row || row.user_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await db.execute({
    sql: `UPDATE agent_commands
          SET status = 'done', output = ?, exit_code = ?, completed_at = datetime('now')
          WHERE id = ?`,
    args: [typeof output === "string" ? output.slice(0, 50000) : "", typeof exitCode === "number" ? exitCode : null, Number(id)],
  });

  return NextResponse.json({ ok: true });
}
