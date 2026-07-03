import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await db.execute({
    sql: "SELECT id, user_id, status, output, exit_code FROM agent_commands WHERE id = ?",
    args: [Number(id)],
  });
  const row = result.rows[0] as unknown as
    | { id: number; user_id: number; status: string; output: string | null; exit_code: number | null }
    | undefined;

  if (!row || row.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    status: row.status,
    output: row.output,
    exitCode: row.exit_code,
  });
}
