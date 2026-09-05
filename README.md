# Ledgerline

A multi-user expense tracker (Next.js + Postgres + Google sign-in)
with monthly totals, a category breakdown, and an automated month-end
email — every signed-in user gets their own data and their own
Excel-attached summary, sent to their own Google account address.

## What's in here

- `app/page.js` — the tracker UI (mobile-first, installable to your
  iPhone home screen); shows a "Sign in with Google" screen when
  signed out
- `app/api/auth/[...nextauth]/route.js` + `lib/auth.js` — Google
  sign-in via NextAuth
- `app/api/expenses/route.js` + `app/api/expenses/[id]/route.js` — REST
  API for listing, adding and deleting expenses, scoped to the
  signed-in user
- `app/api/cron/monthly-email/route.js` — runs on the last day of each
  month, loops over every registered user, and emails each one their
  own `.xlsx` report
- `lib/db.js` — Postgres schema (an `expenses` table keyed by
  `user_email`, and an `app_users` directory of everyone who's signed
  in) + row mapping
- `vercel.json` — the cron schedule

## 1. Set up Google sign-in

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (create a project first if you don't have one).
2. **Create Credentials → OAuth client ID** → Application type:
   **Web application**.
3. Under **Authorized redirect URIs**, add:
   - `https://<your-vercel-domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
4. Copy the **Client ID** and **Client Secret**.

You may also need to configure the OAuth consent screen (External,
add your own email as a test user) if this is the first OAuth client
in that Google Cloud project.

## 2. Run it locally

```bash
npm install
```

You'll need the database and Google credentials even for local dev —
do steps 1 and 3 first, create a `.env.local` from `.env.example`
with your values (plus `vercel env pull .env.local` to also grab the
Postgres connection string), then:

```bash
npm run dev
```

Open http://localhost:3000.

## 3. Create the database

1. Push this project to a GitHub repo, then import it at
   [vercel.com/new](https://vercel.com/new) — or run `vercel` from this
   folder to deploy without GitHub.
2. In the Vercel dashboard, open the project → **Storage** → **Create
   Database** → **Neon** (Postgres). Connect it to this project.
3. `lib/db.js` reads whichever connection-string variable your
   integration created (`NEON_POSTGRES_URL`, `POSTGRES_URL`, etc.) —
   nothing to copy by hand. The app creates its own tables on first
   request.

## 4. Set environment variables on Vercel

Project → **Settings** → **Environment Variables**:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from step 1
- `NEXTAUTH_SECRET` — random string, e.g. `openssl rand -base64 32`
- `GMAIL_USER` — the Gmail address Ledgerline sends FROM
- `GMAIL_APP_PASSWORD` — an [app password](https://myaccount.google.com/apppasswords)
  for that account (needs 2-Step Verification on first)
- `CRON_SECRET` — random string, e.g. `openssl rand -hex 32`

See `.env.example` for the full list with comments.

## 5. Deploy

```bash
npm i -g vercel   # if you don't have it
vercel            # first deploy, follow the prompts
vercel --prod     # promote to production
```

Vercel reads `vercel.json` and schedules `/api/cron/monthly-email` to
run daily at 14:30 UTC (8:00 PM IST) on the 28th–31st of each month;
the route checks whether today is actually the last day before doing
anything, then emails every registered user their own summary for
their own data — so you get exactly one email per user per month.

You can trigger it manually any time to test — visit
`https://<your-app>.vercel.app/api/cron/monthly-email` with an
`Authorization: Bearer <CRON_SECRET>` header (e.g. via `curl`), or
temporarily remove the `CRON_SECRET` env var to test from the browser.

## Notes

- Anyone with a Google account can sign in and gets their own private
  ledger — there's no invite list. If you want to restrict who can
  sign in, that's a small addition to `lib/auth.js` (a `signIn`
  callback that checks the email against an allow-list) — ask if you
  want that added.
- The Vercel Hobby plan's free cron allowance covers this (one run per
  day, at most).
- Categories live in `lib/categories.js` — edit that one file to add,
  rename, or recolor categories; both the UI and the email report pick
  it up automatically.
