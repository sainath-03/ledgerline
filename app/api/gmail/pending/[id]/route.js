import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, getPendingTransaction, setPendingTransactionStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/gmail/pending/[id]  { action: "approve" | "dismiss" }
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = session.user.email;
  const { action } = await request.json();

  const pending = await getPendingTransaction(params.id, email);
  if (!pending) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (action === "approve") {
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      INSERT INTO expenses (id, amount, category, note, expense_date, example, user_email)
      VALUES (${id}, ${pending.amount}, ${pending.category}, ${pending.note}, ${pending.txn_date}, FALSE, ${email});
    `;
    await setPendingTransactionStatus(params.id, email, "approved");
    return NextResponse.json({ status: "approved", expenseId: id });
  }

  if (action === "dismiss") {
    await setPendingTransactionStatus(params.id, email, "dismissed");
    return NextResponse.json({ status: "dismissed" });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
