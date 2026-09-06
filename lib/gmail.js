import { getGmailAccount, updateGmailAccessToken } from "@/lib/db";

// Senders and subject/body keywords that real transaction emails from
// Indian UPI apps and banks reliably use. Broad on purpose — false
// positives just become a suggestion the user dismisses; false
// negatives mean a transaction never gets suggested at all.
const GMAIL_QUERY =
  '(from:googlepay-noreply@google.com OR from:noreply@phonepe.com OR from:paytmupi@paytm.com OR from:alerts@paytm.com OR subject:(debited OR "payment successful" OR "you paid" OR "transaction alert" OR "spent on"))';

async function refreshAccessToken(email, refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) {
    throw new Error(`Failed to refresh Gmail token: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await updateGmailAccessToken(email, data.access_token, expiresAt);
  return data.access_token;
}

// Returns a usable access token for this user's connected Gmail
// account, refreshing it first if it's missing or about to expire.
// Returns null if the user hasn't connected Gmail.
export async function getValidAccessToken(email) {
  const account = await getGmailAccount(email);
  if (!account) return null;

  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null;
  const stillValid = account.access_token && expiresAt && expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return account.access_token;

  return refreshAccessToken(email, account.refresh_token);
}

async function gmailFetch(accessToken, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractPlainText(payload) {
  if (!payload) return "";
  if (payload.body?.data && (payload.mimeType === "text/plain" || payload.mimeType === "text/html")) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  return "";
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

const AMOUNT_RE = /(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d{1,2})?)/i;
const CREDIT_WORDS = /\b(credited|refund(?:ed)?|received|cashback|reversed)\b/i;
const DEBIT_WORDS = /\b(debited|paid|spent|payment successful|purchase)\b/i;

const CATEGORY_HINTS = [
  { cat: "food", words: /swiggy|zomato|restaurant|cafe|food|eatery|dominos|starbucks/i },
  { cat: "transport", words: /uber|ola|rapido|irctc|metro|fuel|petrol|diesel|fastag/i },
  { cat: "shopping", words: /amazon|flipkart|myntra|ajio|mall|store|shopping/i },
  { cat: "bills", words: /electricity|recharge|broadband|dth|gas|water bill|bill payment|jio|airtel|vodafone/i },
  { cat: "health", words: /pharmacy|hospital|clinic|apollo|medplus|diagnostic/i },
  { cat: "fun", words: /netflix|spotify|bookmyshow|prime video|hotstar|movie/i }
];

function guessCategory(text) {
  for (const { cat, words } of CATEGORY_HINTS) {
    if (words.test(text)) return cat;
  }
  return "other";
}

function guessMerchant(text) {
  const patterns = [
    /paid to ([A-Za-z0-9 &._-]{2,40})/i,
    /payment (?:of [^\s]+ )?to ([A-Za-z0-9 &._-]{2,40})/i,
    /spent (?:on|at) ([A-Za-z0-9 &._-]{2,40})/i,
    /at ([A-Za-z0-9 &._-]{2,40}) on/i,
    /towards ([A-Za-z0-9 &._-]{2,40})/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

// Parses one Gmail message into a candidate transaction, or returns
// null if it doesn't look like a genuine debit (credits/refunds are
// deliberately excluded — this is a spend tracker, not a full ledger).
function parseMessage(message) {
  const headers = message.payload?.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const rawBody = extractPlainText(message.payload) || message.snippet || "";
  const body = stripHtml(rawBody);
  const combined = `${subject} ${body}`;

  if (CREDIT_WORDS.test(combined) && !DEBIT_WORDS.test(combined)) return null;

  const amountMatch = combined.match(AMOUNT_RE);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;

  const merchant = guessMerchant(combined);
  const category = guessCategory(combined);
  const date = new Date(Number(message.internalDate)).toISOString().slice(0, 10);

  return {
    amount,
    category,
    note: merchant || subject.slice(0, 60),
    date,
    gmailMessageId: message.id
  };
}

// Fetches recent candidate emails and returns parsed transactions.
// `maxResults` caps how many messages we pull per scan.
export async function fetchRecentTransactions(accessToken, maxResults = 15) {
  const list = await gmailFetch(
    accessToken,
    `/messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=${maxResults}`
  );
  const ids = (list.messages || []).map((m) => m.id);

  const transactions = [];
  for (const id of ids) {
    try {
      const message = await gmailFetch(accessToken, `/messages/${id}?format=full`);
      const parsed = parseMessage(message);
      if (parsed) transactions.push(parsed);
    } catch (e) {
      console.error(`Failed to fetch/parse Gmail message ${id}`, e);
    }
  }
  return transactions;
}
