import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
dayjs.extend(customParseFormat);

const app = express();
app.use(cors());

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '../data-files');

function loadCsv(file, options = {}) {
  const filePath = path.join(DATA_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    ...options,
  });
  return records;
}

function normalizeNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,]/g, '')) || 0;
}

function toISO(dateStr) {
  if (!dateStr) return dayjs.invalid().toISOString();
  const formats = ['M/D/YYYY', 'MM/DD/YYYY', 'M/D/YY', 'YYYY-MM-DD', 'M-D-YYYY'];
  let d = dayjs(dateStr, formats, true);
  if (!d.isValid()) d = dayjs(dateStr);
  return d.toISOString();
}

function loadData() {
  const accounts = loadCsv('account.csv');
  const transactions = loadCsv('transaction.csv').map(t => {
    let amt = normalizeNumber(t.Amount);
    const type = String(t.TransactionType || '').toLowerCase();
    // Normalize sign by type for robustness with CSVs that omit +/-
    if (type === 'debit' && amt > 0) amt = -amt;
    if (type === 'credit' && amt < 0) amt = Math.abs(amt);
    return {
      ...t,
      Amount: amt,
      TransactionDate: toISO(t.TransactionDate),
    };
  });
  const bills = loadCsv('bill.csv').map(b => ({
    ...b,
    Amount: normalizeNumber(b.Amount),
    IsRecurring: String(b.IsRecurring).toLowerCase() === 'true',
    StartDate: toISO(b.StartDate),
  }));
  return { accounts, transactions, bills };
}

function computeBalances(transactions, bills) {
  const currentBalance = transactions.reduce((sum, t) => sum + t.Amount, 0);
  const upcomingTotal = bills.reduce((sum, b) => sum + b.Amount, 0);
  return {
    currentBalance,
    realBalance: currentBalance - upcomingTotal,
    upcomingTotal,
  };
}

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/accounts', (req, res) => {
  try {
    const { accounts } = loadData();
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/transactions', (req, res) => {
  try {
    const { transactions } = loadData();
    // newest first
    transactions.sort((a, b) => (a.TransactionDate < b.TransactionDate ? 1 : -1));
    res.json(transactions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bills', (req, res) => {
  try {
  const { bills } = loadData();
  const today = dayjs().startOf('day');
  const upcoming = bills.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
  upcoming.sort((a, b) => (a.StartDate > b.StartDate ? 1 : -1));
  res.json(upcoming);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/summary', (req, res) => {
  try {
  const { transactions, bills } = loadData();
  const today = dayjs().startOf('day');
  const upcoming = bills.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
  const balances = computeBalances(transactions, upcoming);
    res.json(balances);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts-summary', (req, res) => {
  try {
    const { accounts, transactions } = loadData();
    const byAccount = new Map();
    for (const t of transactions) {
      const key = t.AccountName || 'Unknown';
      byAccount.set(key, (byAccount.get(key) || 0) + t.Amount);
    }
    const display = new Map(accounts.map(a => [a.AccountName, a.DisplayName || a.AccountName]));
    const list = Array.from(byAccount.entries()).map(([AccountName, balance]) => ({
      AccountName,
      DisplayName: display.get(AccountName) || AccountName,
      Balance: balance,
    })).sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static client if present (for Docker / production)
const PUBLIC_DIR = path.join(process.cwd(), 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res) => {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.status(404).send('Not Found');
  });
}

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`API listening on http://${HOST}:${PORT}`));
