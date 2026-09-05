import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import { ensureSchema, rowToExpense } from "@/lib/db";
import { categoryName } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function money(n) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function buildWorkbook(expenses, monthLabel) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ledgerline";
  wb.created = new Date();

  const txSheet = wb.addWorksheet("Transactions");
  txSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Category", key: "category", width: 16 },
    { header: "Note", key: "note", width: 40 },
    { header: "Amount (₹)", key: "amount", width: 16 }
  ];
  txSheet.getRow(1).font = { bold: true };
  txSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE7F7" } };

  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  for (const e of sorted) {
    total += e.amount;
    txSheet.addRow({ date: e.date, category: categoryName(e.cat), note: e.note, amount: e.amount });
  }
  txSheet.getColumn("amount").numFmt = "#,##0.00";

  const totalRow = txSheet.addRow({ date: "", category: "", note: "Total", amount: total });
  totalRow.font = { bold: true };
  totalRow.getCell("amount").numFmt = "#,##0.00";

  const catSheet = wb.addWorksheet("By Category");
  catSheet.columns = [
    { header: "Category", key: "category", width: 18 },
    { header: "Amount (₹)", key: "amount", width: 16 },
    { header: "% of total", key: "pct", width: 12 }
  ];
  catSheet.getRow(1).font = { bold: true };
  catSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE7F7" } };

  const byCat = {};
  for (const e of expenses) {
    byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  }
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  for (const [catId, amount] of catRows) {
    catSheet.addRow({
      category: categoryName(catId),
      amount,
      pct: total ? amount / total : 0
    });
  }
  catSheet.getColumn("amount").numFmt = "#,##0.00";
  catSheet.getColumn("pct").numFmt = "0.0%";

  const catTotalRow = catSheet.addRow({ category: "Total", amount: total, pct: total ? 1 : 0 });
  catTotalRow.font = { bold: true };
  catTotalRow.getCell("amount").numFmt = "#,##0.00";
  catTotalRow.getCell("pct").numFmt = "0.0%";

  return { buffer: await wb.xlsx.writeBuffer(), total, byCat };
}

async function sendEmail({ subject, text, attachment }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: `Ledgerline <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_TO || process.env.GMAIL_USER,
    subject,
    text,
    attachments: attachment
      ? [
          {
            filename: attachment.filename,
            content: attachment.buffer,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          }
        ]
      : []
  });
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isLastDayOfMonth(now)) {
    return NextResponse.json({ skipped: true, reason: "not the last day of the month" });
  }

  await ensureSchema();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const result = await sql`
    SELECT * FROM expenses
    WHERE expense_date >= ${start}::date
      AND expense_date < (${start}::date + INTERVAL '1 month')
      AND example = FALSE
    ORDER BY expense_date ASC;
  `;
  const expenses = result.rows.map(rowToExpense);

  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  if (expenses.length === 0) {
    await sendEmail({
      subject: `Ledgerline — ${monthLabel} expense summary`,
      text: `No expenses were logged in Ledgerline for ${monthLabel}.`
    });
    return NextResponse.json({ sent: true, entries: 0 });
  }

  const { buffer, total, byCat } = await buildWorkbook(expenses, monthLabel);

  const topCats = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([catId, amount]) => `${categoryName(catId)} (${money(amount)})`)
    .join(", ");

  const text = [
    `Here's your Ledgerline summary for ${monthLabel}.`,
    "",
    `Total spent: ${money(total)}`,
    `Entries logged: ${expenses.length}`,
    `Top categories: ${topCats}`,
    "",
    "The full breakdown is attached as an Excel file."
  ].join("\n");

  await sendEmail({
    subject: `Ledgerline — ${monthLabel} expense summary`,
    text,
    attachment: {
      filename: `Ledgerline-${monthLabel.replace(" ", "-")}.xlsx`,
      buffer: Buffer.from(buffer)
    }
  });

  return NextResponse.json({ sent: true, entries: expenses.length, total });
}
