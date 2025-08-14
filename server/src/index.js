import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import db from './db.js';
dayjs.extend(customParseFormat);

const app = express();
app.use(cors());

// CSV ingestion removed; now using SQLite via ./db.js

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/accounts', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name as AccountName, display_name as DisplayName, initial_balance FROM accounts WHERE archived=0 ORDER BY display_name').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts', express.json(), (req, res) => {
  try {
    const { name, displayName, initialBalance = 0 } = req.body || {};
    if (!name || !displayName) return res.status(400).json({ error: 'name and displayName required' });
    const stmt = db.prepare('INSERT INTO accounts(name, display_name, initial_balance) VALUES (?, ?, ?)');
    const info = stmt.run(name, displayName, Number(initialBalance || 0));
    res.status(201).json({ id: info.lastInsertRowid, name, displayName, initialBalance: Number(initialBalance || 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const info = db.prepare('UPDATE accounts SET archived=1 WHERE id=?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/transactions', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.id, t.date as TransactionDate, t.amount as Amount, t.type as TransactionType, t.status as Status, t.description as Description,
             a.name as AccountName, a.display_name as DisplayName
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      ORDER BY t.date DESC, t.id DESC
      LIMIT 500
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transactions', express.json(), (req, res) => {
  try {
  const { accountId, date, amount, type, status = 'pending', description } = req.body || {};
    if (!accountId || !date || !amount || !type) return res.status(400).json({ error: 'accountId, date, amount, type required' });
  let amt = Number(amount);
  const t = String(type).toLowerCase();
  if (t === 'debit' && amt > 0) amt = -amt;
  if (t === 'credit' && amt < 0) amt = Math.abs(amt);
  const stmt = db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(accountId, date, amt, String(type), String(status), description || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/transactions/:id', express.json(), (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status required' });
    const info = db.prepare('UPDATE transactions SET status=? WHERE id=?').run(String(status), req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bills', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name as BillName, amount as Amount, start_date as StartDate, is_recurring as IsRecurring, recurring_type as RecurringType FROM bills ORDER BY start_date').all();
    const today = dayjs().startOf('day');
    const upcoming = rows.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
    res.json(upcoming);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bills', express.json(), (req, res) => {
  try {
    const { name, amount, startDate, isRecurring = false, recurringType = null } = req.body || {};
    if (!name || !amount || !startDate) return res.status(400).json({ error: 'name, amount, startDate required' });
    const stmt = db.prepare('INSERT INTO bills(name, amount, start_date, is_recurring, recurring_type) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(String(name), Number(amount), String(startDate), isRecurring ? 1 : 0, recurringType || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bills/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM bills WHERE id=?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/summary', (req, res) => {
  try {
    const tx = db.prepare('SELECT amount FROM transactions').all();
    const accounts = db.prepare('SELECT initial_balance FROM accounts WHERE archived=0').all();
    const currentBalance = tx.reduce((s, r) => s + (Number(r.amount) || 0), 0)
      + accounts.reduce((s, r) => s + (Number(r.initial_balance) || 0), 0);
    const bills = db.prepare('SELECT amount, start_date FROM bills').all();
    const today = dayjs().startOf('day');
    const upcomingTotal = bills
      .filter(b => dayjs(b.start_date || b.StartDate).isSame(today) || dayjs(b.start_date || b.StartDate).isAfter(today))
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    res.json({ currentBalance, upcomingTotal, realBalance: currentBalance - upcomingTotal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts-summary', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.id as AccountId, a.name as AccountName, a.display_name as DisplayName,
             (a.initial_balance + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id), 0)) as Balance
      FROM accounts a
      WHERE a.archived = 0
      ORDER BY a.display_name
    `).all();
    res.json(rows);
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
