import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureSchema, getGmailAccount, disconnectGmail } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/gmail/status — is Gmail auto-tracking connected for this user?
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const account = await getGmailAccount(session.user.email);
  return NextResponse.json({ connected: !!account });
}

// DELETE /api/gmail/status — disconnect Gmail auto-tracking.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await disconnectGmail(session.user.email);
  return NextResponse.json({ connected: false });
}
