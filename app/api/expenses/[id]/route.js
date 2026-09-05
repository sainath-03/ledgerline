import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/expenses/:id — scoped to the signed-in user so nobody
// can delete another account's row by guessing an id.
export async function DELETE(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  await sql`DELETE FROM expenses WHERE id = ${params.id} AND user_email = ${session.user.email};`;
  return NextResponse.json({ ok: true });
}
