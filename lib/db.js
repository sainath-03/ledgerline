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

  // One row per user who has connected Gmail for auto-tracking. The
  // refresh token is long-lived and is what lets a scan run without
  // the user being present; the access token + expiry are a cache so
  // we don't hit Google's token endpoint on every single scan.
  await sql`
    CREATE TABLE IF NOT EXISTS gmail_accounts (
      user_email TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      last_scanned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // Transactions detected from Gmail, awaiting the user's approval
  // before they become real expenses. Kept even after approval/
  // dismissal (status column) so the same email is never re-suggested.
  await sql`
    CREATE TABLE IF NOT EXISTS pending_transactions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      gmail_message_id TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      note TEXT NOT NULL DEFAULT '',
      txn_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_email, gmail_message_id)
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

// Called when a user completes the "Connect Gmail" consent flow.
// Google only returns a refresh_token when prompt=consent is forced,
// which is how that flow is triggered, so this should always have one.
export async function saveGmailAccount(email, refreshToken, accessToken, expiresAt) {
  await ensureSchema();
  await sql`
    INSERT INTO gmail_accounts (user_email, refresh_token, access_token, access_token_expires_at)
    VALUES (${email}, ${refreshToken}, ${accessToken || null}, ${expiresAt || null})
    ON CONFLICT (user_email) DO UPDATE SET
      refresh_token = EXCLUDED.refresh_token,
      access_token = EXCLUDED.access_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at;
  `;
}

export async function getGmailAccount(email) {
  await ensureSchema();
  const result = await sql`SELECT * FROM gmail_accounts WHERE user_email = ${email};`;
  return result.rows[0] || null;
}

export async function updateGmailAccessToken(email, accessToken, expiresAt) {
  await sql`
    UPDATE gmail_accounts
    SET access_token = ${accessToken}, access_token_expires_at = ${expiresAt}
    WHERE user_email = ${email};
  `;
}

export async function disconnectGmail(email) {
  await sql`DELETE FROM gmail_accounts WHERE user_email = ${email};`;
}

export async function markGmailScanned(email) {
  await sql`UPDATE gmail_accounts SET last_scanned_at = now() WHERE user_email = ${email};`;
}

// Inserts a newly detected transaction as a suggestion, silently doing
// nothing if this Gmail message has already been turned into a
// suggestion for this user (approved, dismissed, or still pending).
export async function addPendingTransaction(id, email, gmailMessageId, amount, category, note, txnDate) {
  await sql`
    INSERT INTO pending_transactions (id, user_email, gmail_message_id, amount, category, note, txn_date)
    VALUES (${id}, ${email}, ${gmailMessageId}, ${amount}, ${category}, ${note}, ${txnDate})
    ON CONFLICT (user_email, gmail_message_id) DO NOTHING;
  `;
}

export async function listPendingTransactions(email) {
  const result = await sql`
    SELECT * FROM pending_transactions
    WHERE user_email = ${email} AND status = 'pending'
    ORDER BY txn_date DESC, created_at DESC;
  `;
  return result.rows;
}

export async function setPendingTransactionStatus(id, email, status) {
  await sql`
    UPDATE pending_transactions SET status = ${status}
    WHERE id = ${id} AND user_email = ${email};
  `;
}

export async function getPendingTransaction(id, email) {
  const result = await sql`
    SELECT * FROM pending_transactions WHERE id = ${id} AND user_email = ${email};
  `;
  return result.rows[0] || null;
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

export function rowToPending(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    cat: row.category,
    note: row.note,
    date: row.txn_date.toISOString().slice(0, 10)
  };
}
