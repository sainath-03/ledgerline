import { createPool } from "@vercel/postgres";

// The Neon integration (added with a "NEON" prefix to avoid clashing
// with a pre-existing POSTGRES_URL) creates NEON_POSTGRES_URL, not the
// plain POSTGRES_URL that @vercel/postgres looks for by default. Build
// our own pool pointed at whichever connection string is actually
// present, so this works whether the var is prefixed or not.
const connectionString =
  process.env.NEON_POSTGRES_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No Postgres connection string found. Expected NEON_POSTGRES_URL (or POSTGRES_URL) to be set."
  );
}

const pool = createPool({ connectionString });
export const sql = pool.sql.bind(pool);

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
