import { NextResponse } from "next/server";
import { sql, ensureSchema, rowToExpense } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/expenses?year=2026&month=9  (month is 1-12; both optional)
export async function GET(request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  let result;
  if (year && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    result = await sql`
      SELECT * FROM expenses
      WHERE expense_date >= ${start}::date
        AND expense_date < (${start}::date + INTERVAL '1 month')
      ORDER BY expense_date DESC, created_at DESC;
    `;
  } else {
    result = await sql`SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC;`;
  }

  return NextResponse.json({ expenses: result.rows.map(rowToExpense) });
}

// POST /api/expenses  { amount, cat, note, date }
export async function POST(request) {
  await ensureSchema();
  const body = await request.json();
  const amount = Number(body.amount);
  const cat = String(body.cat || "other");
  const note = String(body.note || "").slice(0, 500);
  const date = String(body.date || new Date().toISOString().slice(0, 10));

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const id = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  await sql`
    INSERT INTO expenses (id, amount, category, note, expense_date, example)
    VALUES (${id}, ${amount}, ${cat}, ${note}, ${date}::date, FALSE);
  `;

  return NextResponse.json({ expense: { id, amount, cat, note, date, example: false } }, { status: 201 });
}
