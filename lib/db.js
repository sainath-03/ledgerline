import { createPool } from "@vercel/postgres";

// The Neon integration (added with a "NEON" prefix to avoid clashing
// with a pre-existing POSTGRES_URL) creates NEON_POSTGRES_URL, not the
// plain POSTGRES_URL that @vercel/postgres looks for by default. Build
// our own pool pointed at whichever connection string is actually
// present, so this works whether the var is prefixed or not.
//
// The pool is created lazily (on first query) rather than at module
// load — Next.js imports every route module during `next build` to
// collect page data, and that build step doesn't have runtime env
// vars available, so throwing here eagerly would break every build.
let pool;
function getPool() {
  if (!pool) {
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
    pool = createPool({ connectionString });
  }
  return pool;
}

export const sql = (...args) => getPool().sql(...args);

let ensured = false;

// Creates tables on first use so there's no separate migration step to
// run before deploying. ALTER ... ADD COLUMN IF NOT EXISTS keeps this
// safe to re-run against a database created before user accounts
// existed. Cheap no-op after the first call within a warm instance.
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
      user_email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_email TEXT NOT NULL DEFAULT '';`;

  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      email TEXT PRIMARY KEY,
      name TEXT,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  ensured = true;
}

// Called on every sign-in so the app has a directory of accounts to
// loop over for the month-end email, independent of whether that
// person has logged any expenses yet.
export async function upsertUser(email, name, image) {
  await ensureSchema();
  await sql`
    INSERT INTO app_users (email, name, image)
    VALUES (${email}, ${name || null}, ${image || null})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image;
  `;
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
