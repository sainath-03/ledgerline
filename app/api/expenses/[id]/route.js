import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/expenses/:id
export async function DELETE(_request, { params }) {
  await ensureSchema();
  await sql`DELETE FROM expenses WHERE id = ${params.id};`;
  return NextResponse.json({ ok: true });
}
