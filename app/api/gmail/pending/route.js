import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureSchema, listPendingTransactions, rowToPending } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/gmail/pending — suggested transactions awaiting review.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const rows = await listPendingTransactions(session.user.email);
  return NextResponse.json({ pending: rows.map(rowToPending) });
}
