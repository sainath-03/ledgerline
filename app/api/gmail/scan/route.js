import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureSchema, addPendingTransaction, markGmailScanned } from "@/lib/db";
import { getValidAccessToken, fetchRecentTransactions } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/gmail/scan — scans the signed-in user's connected Gmail
// for new transaction-looking emails and stores any not seen before
// as pending suggestions. Called on demand from the client (e.g. when
// the tracker screen loads) rather than on a schedule, since the
// point is "check when I open the app", not real-time push.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = session.user.email;

  await ensureSchema();

  const accessToken = await getValidAccessToken(email);
  if (!accessToken) {
    return NextResponse.json({ connected: false, added: 0 });
  }

  const transactions = await fetchRecentTransactions(accessToken);
  let added = 0;
  for (const txn of transactions) {
    const id = `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    await addPendingTransaction(id, email, txn.gmailMessageId, txn.amount, txn.category, txn.note, txn.date);
    added += 1;
  }
  await markGmailScanned(email);

  return NextResponse.json({ connected: true, scanned: transactions.length, added });
}
