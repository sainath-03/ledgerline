import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql, getPendingTransaction, setPendingTransactionStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/gmail/pending/[id]
//   { action: "approve", amount?, cat?, note?, date? } — creates the
//   expense using whatever overrides are given (the user may have
//   edited the title/amount/category/date in the review sheet before
//   confirming), falling back to the auto-detected values for
//   anything not overridden.
//   { action: "dismiss" } — discards the suggestion.
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = session.user.email;
  const body = await request.json();
  const { action } = body;

  const pending = await getPendingTransaction(params.id, email);
  if (!pending) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (action === "approve") {
    const amount = body.amount !== undefined ? Number(body.amount) : Number(pending.amount);
    const cat = body.cat !== undefined ? String(body.cat) : pending.category;
    const note = body.note !== undefined ? String(body.note).slice(0, 500) : pending.note;
    const date = body.date !== undefined ? String(body.date) : pending.txn_date;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      INSERT INTO expenses (id, amount, category, note, expense_date, example, user_email)
      VALUES (${id}, ${amount}, ${cat}, ${note}, ${date}::date, FALSE, ${email});
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
