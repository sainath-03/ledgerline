import { sql } from "@vercel/postgres";

let ensured = false;

// Creates the table on first use so there's no separate migration step
// to run before the first deploy. Cheap no-op after the first call
// within a warm serverless instance.
export async function ensureSchema() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount NUMERIC(12, 2) NOT NULL,
      category TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      expense_date DATE NOT NULL,
      example BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  ensured = true;
}

export function rowToExpense(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    cat: row.category,
    note: row.note,
    date: row.expense_date.toISOString().slice(0, 10),
    example: row.example
  };
}
