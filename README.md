# Ledgerline

A pocket expense tracker (Next.js + Postgres) with monthly totals, a
category breakdown, and an automated month-end email with a detailed
Excel report attached — deployable to Vercel.

## What's in here

- `app/page.js` — the tracker UI (mobile-first, installable to your
  iPhone home screen)
- `app/api/expenses/route.js` + `app/api/expenses/[id]/route.js` — REST
  API for listing, adding and deleting expenses
- `app/api/cron/monthly-email/route.js` — runs on the last day of each
  month, builds an `.xlsx` report and emails it to you
- `lib/db.js` — Postgres schema + row mapping
- `vercel.json` — the cron schedule

## 1. Run it locally

```bash
npm install
```

You'll need a Postgres database even for local dev — the easiest path
is to create the free Vercel Postgres database first (step 2 below),
then come back and run:

```bash
vercel env pull .env.local
npm run dev
```

Open http://localhost:3000.

## 2. Create the database

1. Push this project to a GitHub repo, then import it at
   [vercel.com/new](https://vercel.com/new) — or run `vercel` from this
   folder to deploy without GitHub.
2. In the Vercel dashboard, open the project → **Storage** → **Create
   Database** → **Postgres**. Connect it to this project.
3. Vercel automatically adds a `POSTGRES_URL` environment variable —
   nothing to copy by hand. The app creates its own table on first
   request (see `lib/db.js`).

## 3. Set up the email

The month-end report is sent from your own Gmail account via an **app
password** (no third-party email service needed):

1. Turn on 2-Step Verification: https://myaccount.google.com/security
2. Create an app password: https://myaccount.google.com/apppasswords
   — choose app "Mail", name it "Ledgerline", and copy the 16-character
   password it gives you.
3. In the Vercel project → **Settings** → **Environment Variables**,
   add:
   - `GMAIL_USER` — your Gmail address
   - `GMAIL_APP_PASSWORD` — the app password from step 2
   - `EMAIL_TO` — where the summary should be sent (can be the same
     address)
   - `CRON_SECRET` — any random string, e.g. output of
     `openssl rand -hex 32`. This stops anyone but Vercel's own cron
     runner from triggering the email endpoint.

See `.env.example` for the full list with comments.

## 4. Deploy

```bash
npm i -g vercel   # if you don't have it
vercel            # first deploy, follow the prompts
vercel --prod     # promote to production
```

Vercel reads `vercel.json` and schedules `/api/cron/monthly-email` to
run daily at 14:30 UTC (8:00 PM IST) on the 28th–31st of each month;
the route itself checks whether today is actually the last day before
sending anything, so you get exactly one email per month.

You can trigger it manually any time to test — visit
`https://<your-app>.vercel.app/api/cron/monthly-email` with an
`Authorization: Bearer <CRON_SECRET>` header (e.g. via `curl`), or
temporarily remove the `CRON_SECRET` env var to test from the browser.

## Notes

- The Vercel Hobby plan's free cron allowance covers this (one run per
  day, at most).
- Categories live in `lib/categories.js` — edit that one file to add,
  rename, or recolor categories; both the UI and the email report pick
  it up automatically.
- Data lives in Postgres, not in the browser — the app works the same
  from your phone, laptop, or anywhere else you open the URL.
