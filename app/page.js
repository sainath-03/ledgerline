"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/categories";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmt(n) { return `₹${Math.round(n).toLocaleString("en-IN")}`; }
function fmt2(n) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="app">
        <p className="status-note">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app signin-screen">
        <div className="wordmark">Ledger<span>line</span></div>
        <p className="signin-copy">
          Track your expenses, monthly totals, and category breakdowns —
          sign in to see your own ledger.
        </p>
        <button className="btn primary" onClick={() => signIn("google")}>
          Sign in with Google
        </button>
      </div>
    );
  }

  return <Tracker session={session} />;
}

function Tracker({ session }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: "", cat: "food", note: "", date: todayStr() });

  async function refresh() {
    try {
      setError(null);
      const res = await fetch("/api/expenses", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load expenses");
      const data = await res.json();
      setExpenses(data.expenses);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const inView = useMemo(() => {
    return expenses.filter((t) => {
      const d = new Date(`${t.date}T00:00:00`);
      return d.getFullYear() === view.year && d.getMonth() === view.month;
    });
  }, [expenses, view]);

  const total = inView.reduce((s, t) => s + t.amount, 0);
  const hasExample = inView.some((t) => t.example);

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === view.year && now.getMonth() === view.month;
  const daysElapsed = isCurrentMonth
    ? now.getDate()
    : new Date(view.year, view.month + 1, 0).getDate();
  const dailyAvg = daysElapsed ? total / daysElapsed : 0;

  const byCat = {};
  inView.forEach((t) => { byCat[t.cat] = (byCat[t.cat] || 0) + t.amount; });
  const catRows = Object.entries(byCat)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
  const maxCat = catRows[0]?.amount || 0;

  const byDay = {};
  inView.forEach((t) => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  const days = Object.keys(byDay).sort().reverse();

  function shiftMonth(delta) {
    setView((v) => {
      let month = v.month + delta;
      let year = v.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  }

  async function deleteExpense(id) {
    setExpenses((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    } catch (e) {
      refresh();
    }
  }

  async function clearExamples() {
    const examples = inView.filter((t) => t.example);
    setExpenses((prev) => prev.filter((t) => !t.example));
    await Promise.all(examples.map((t) => fetch(`/api/expenses/${t.id}`, { method: "DELETE" })));
    refresh();
  }

  function openSheet() {
    setForm({ amount: "", cat: "food", note: "", date: todayStr() });
    setSheetOpen(true);
  }

  async function saveExpense() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, cat: form.cat, note: form.note, date: form.date })
      });
      if (!res.ok) throw new Error("Could not save expense");
      const d = new Date(`${form.date}T00:00:00`);
      setView({ year: d.getFullYear(), month: d.getMonth() });
      setSheetOpen(false);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="wordmark">Ledger<span>line</span></div>
        <div className="month-nav">
          <button aria-label="Previous month" onClick={() => shiftMonth(-1)}>&#8249;</button>
          <span className="month-label">{MONTH_NAMES[view.month].slice(0, 3)} {view.year}</span>
          <button aria-label="Next month" onClick={() => shiftMonth(1)}>&#8250;</button>
        </div>
      </header>

      <div className="account-row">
        {session.user.image && <img className="account-avatar" src={session.user.image} alt="" />}
        <span className="account-name">{session.user.name || session.user.email}</span>
        <button className="signout-link" onClick={() => signOut()}>Sign out</button>
      </div>

      <div className="total-tile">
        <span className="label">Spent this month</span>
        <span className="amount">{fmt(total)}</span>
        <div className="sub">
          <span>Daily avg <b>{fmt(dailyAvg)}</b></span>
          <span>Entries <b>{inView.length}</b></span>
        </div>
      </div>

      {loading && <p className="status-note">Loading your expenses…</p>}
      {error && <p className="status-note error">{error}</p>}

      {hasExample && (
        <div className="sample-banner">
          <span>These are example entries so you can see how it works.</span>
          <button onClick={clearExamples}>Clear &amp; start fresh</button>
        </div>
      )}

      <section className="card">
        <h2>By category</h2>
        {catRows.length === 0 ? (
          <p className="empty-note">No expenses logged for this month yet.</p>
        ) : (
          catRows.map((row) => {
            const cat = CATEGORY_BY_ID[row.id] || CATEGORY_BY_ID.other;
            const pct = maxCat ? Math.max(4, Math.round((row.amount / maxCat) * 100)) : 0;
            return (
              <div className="cat-group" key={row.id}>
                <div className="cat-row">
                  <span className="cat-dot" style={{ background: cat.color }} />
                  <span className="cat-name">{cat.name}</span>
                  <span className="cat-amount">{fmt(row.amount)}</span>
                </div>
                <div className="cat-bar-wrap">
                  <div className="cat-bar" style={{ width: `${pct}%`, background: cat.color }} />
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="card">
        <h2>Transactions</h2>
        {days.length === 0 ? (
          <p className="empty-note">Tap the + button to log your first expense.</p>
        ) : (
          days.map((day) => {
            const items = byDay[day];
            const dayTotal = items.reduce((s, t) => s + t.amount, 0);
            const dt = new Date(`${day}T00:00:00`);
            const label = day === todayStr()
              ? "Today"
              : dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
            return (
              <div className="day-group" key={day}>
                <div className="day-heading">
                  <span>{label}</span>
                  <span className="day-total">{fmt(dayTotal)}</span>
                </div>
                {items.map((t) => {
                  const cat = CATEGORY_BY_ID[t.cat] || CATEGORY_BY_ID.other;
                  return (
                    <div className="txn" key={t.id}>
                      <span className="txn-dot" style={{ background: cat.color }} />
                      <span className="txn-main">
                        <span className="txn-note">
                          {t.note || cat.name}
                          {t.example && <span className="txn-example">Example</span>}
                        </span>
                        <div className="txn-cat">{cat.name}</div>
                      </span>
                      <span className="txn-amount">{fmt2(t.amount)}</span>
                      <button className="txn-del" aria-label="Delete expense" onClick={() => deleteExpense(t.id)}>&times;</button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </section>

      <p className="install-tip">On iPhone: tap <b>Share</b> → <b>Add to Home Screen</b> to use Ledgerline like an app.</p>

      <button className="fab" aria-label="Add expense" onClick={openSheet}>+</button>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSheetOpen(false); }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
            <div className="sheet-handle" />
            <h3 id="sheetTitle">Add expense</h3>
            <label className="field">
              Amount (₹)
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                autoComplete="off"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="field">
              Category
              <div className="cat-picker">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className="cat-chip"
                    data-active={form.cat === c.id}
                    onClick={() => setForm((f) => ({ ...f, cat: c.id }))}
                  >
                    <span className="dot" style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              Note
              <input
                type="text"
                placeholder="e.g. Groceries at DMart"
                autoComplete="off"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <label className="field">
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <div className="sheet-actions">
              <button className="btn ghost" onClick={() => setSheetOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={saving} onClick={saveExpense}>
                {saving ? "Saving…" : "Save expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
