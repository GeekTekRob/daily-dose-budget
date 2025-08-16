import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import db from './db.js';
import { nextOccurrence } from './utils.js';
dayjs.extend(customParseFormat);

const app = express();
app.use(cors());

// CSV ingestion removed; now using SQLite via ./db.js

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/accounts', (req, res) => {
  try {
  const { archived } = req.query || {};
  const flag = String(archived) === '1' ? 1 : 0;
  const rows = db.prepare('SELECT id, name as AccountName, display_name as DisplayName, initial_balance, type as AccountType FROM accounts WHERE archived=? ORDER BY display_name').all(flag);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts', express.json(), (req, res) => {
  try {
  const { name, displayName, initialBalance = 0, type = 'Checking' } = req.body || {};
    if (!name || !displayName) return res.status(400).json({ error: 'name and displayName required' });
    // Create account with zero initial balance; track the provided initial as a Manual Adjustment transaction
  const insertAcct = db.prepare('INSERT INTO accounts(name, display_name, initial_balance, type) VALUES (?, ?, ?, ?)');
  const info = insertAcct.run(String(name), String(displayName), 0, String(type));
    const id = info.lastInsertRowid;
    const init = Number(initialBalance || 0);
  if (init !== 0) {
      let amt = Math.abs(init);
      let tType = init >= 0 ? 'Credit' : 'Debit';
      if (tType === 'Debit') amt = -amt;
      const today = new Date().toISOString().slice(0,10);
      db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, today, amt, tType, 'confirmed', 'Initial Balance');
    }
  res.status(201).json({ id, name, displayName, initialBalance: init, type });
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

// Edit account fields and/or set manual balance reset
app.patch('/api/accounts/:id', express.json(), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM accounts WHERE id=? AND archived=0').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { displayName, name, type, balanceResetDate, balanceResetAmount } = req.body || {};
    const next = {
      name: name != null ? String(name) : existing.name,
      display_name: displayName != null ? String(displayName) : existing.display_name,
      type: type != null ? String(type) : existing.type,
      balance_reset_date: existing.balance_reset_date,
      balance_reset_amount: existing.balance_reset_amount,
    };
    // If a manual balance reset is requested, set baseline to 0 and insert a Manual Adjustment transaction at the given date
    if (balanceResetDate != null && balanceResetAmount != null) {
      next.balance_reset_date = String(balanceResetDate);
      next.balance_reset_amount = 0; // baseline 0 so the adjustment transaction sets the new balance
      let target = Number(balanceResetAmount);
      let amt = Math.abs(target);
      let tType = target >= 0 ? 'Credit' : 'Debit';
      if (tType === 'Debit') amt = -amt;
      db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description) VALUES (?, ?, ?, ?, ?, ?)')
        .run(existing.id, String(balanceResetDate), amt, tType, 'confirmed', 'Balance Adjustment');
    }
    const info = db.prepare('UPDATE accounts SET name=?, display_name=?, type=?, balance_reset_date=?, balance_reset_amount=? WHERE id=?')
      .run(next.name, next.display_name, next.type, next.balance_reset_date, next.balance_reset_amount, req.params.id);
    res.json({ ok: true, changes: info.changes });
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
    // Add synthetic pending rows for overdue recurrings (no account yet)
    const today = dayjs().format('YYYY-MM-DD');
    const overdue = db.prepare(`
      SELECT id, name, type, estimated_amount, start_date, recurring_type
      FROM recurrings
      WHERE archived=0 AND date(start_date) <= date(?)
    `).all(today).map(r => ({
      id: undefined,
      TransactionDate: r.start_date,
      Amount: r.type === 'Bill' ? -Math.abs(Number(r.estimated_amount || 0)) : Math.abs(Number(r.estimated_amount || 0)),
      TransactionType: r.type === 'Bill' ? 'Debit' : 'Credit',
      Status: 'pending',
      Description: r.name,
      AccountName: '(unassigned)',
      DisplayName: '(unassigned)',
      RecurringId: r.id,
      Synthetic: 1,
    }));
    res.json([...rows, ...overdue].sort((a,b) => (new Date(b.TransactionDate) - new Date(a.TransactionDate))));
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
    const { date, amount, type, status, description, accountId } = req.body || {};
    const existing = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const update = {
      date: date != null ? String(date) : existing.date,
      amount: amount != null ? Number(amount) : Number(existing.amount),
      type: type != null ? String(type) : String(existing.type),
      status: status != null ? String(status) : String(existing.status),
      description: description != null ? String(description) : existing.description,
      account_id: accountId != null ? Number(accountId) : Number(existing.account_id),
    };
    // Normalize amount sign with type
    if (update.type.toLowerCase() === 'debit' && update.amount > 0) update.amount = -update.amount;
    if (update.type.toLowerCase() === 'credit' && update.amount < 0) update.amount = Math.abs(update.amount);
    const info = db.prepare('UPDATE transactions SET date=?, amount=?, type=?, status=?, description=?, account_id=? WHERE id=?')
      .run(update.date, update.amount, update.type, update.status, update.description, update.account_id, req.params.id);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/transactions/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bills', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name as BillName, estimated_amount as Amount, start_date as StartDate,
             is_recurring as IsRecurring, recurring_type as RecurringType
      FROM recurrings
      WHERE archived=0 AND type='Bill'
      ORDER BY start_date
    `).all();
    const today = dayjs().startOf('day');
    const upcoming = rows.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
    res.json(upcoming);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bills', express.json(), (req, res) => {
  try {
    const { name, amount, startDate, isRecurring = true, recurringType = null } = req.body || {};
    if (!name || amount == null || !startDate) return res.status(400).json({ error: 'name, amount, startDate required' });
    const stmt = db.prepare(`INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type) VALUES (?, 'Bill', ?, ?, ?, ?)`);
    const info = stmt.run(String(name), Number(amount), String(startDate), isRecurring ? 1 : 0, recurringType || null);
    res.status(201).json({ id: info.lastInsertRowid, type: 'Bill' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bills/:id', (req, res) => {
  try {
    const info = db.prepare('UPDATE recurrings SET archived=1 WHERE id=? AND type=\'Bill\'').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paychecks (recurrings type: Paycheck)
app.get('/api/paychecks', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name as PaycheckName, estimated_amount as Amount, start_date as StartDate,
             is_recurring as IsRecurring, recurring_type as RecurringType
      FROM recurrings
      WHERE archived=0 AND type='Paycheck'
      ORDER BY start_date
    `).all();
    const today = dayjs().startOf('day');
    const upcoming = rows.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
    res.json(upcoming);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/paychecks', express.json(), (req, res) => {
  try {
    const { name, amount, startDate, isRecurring = true, recurringType = null } = req.body || {};
    if (!name || amount == null || !startDate) return res.status(400).json({ error: 'name, amount, startDate required' });
    const stmt = db.prepare(`INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type) VALUES (?, 'Paycheck', ?, ?, ?, ?)`);
    const info = stmt.run(String(name), Number(amount), String(startDate), isRecurring ? 1 : 0, recurringType || null);
    res.status(201).json({ id: info.lastInsertRowid, type: 'Paycheck' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generic recurrings endpoints
app.get('/api/recurrings', (req, res) => {
  try {
    const { type } = req.query || {};
    const whereType = type && (type === 'Bill' || type === 'Paycheck') ? `AND type='${type}'` : '';
    const rows = db.prepare(`
      SELECT id, name, type, estimated_amount, start_date, is_recurring, recurring_type
      FROM recurrings
      WHERE archived=0 ${whereType}
      ORDER BY start_date
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recurrings', express.json(), (req, res) => {
  try {
    const { name, type, estimatedAmount, startDate, isRecurring = true, recurringType = null } = req.body || {};
    if (!name || !type || estimatedAmount == null || !startDate) return res.status(400).json({ error: 'name, type, estimatedAmount, startDate required' });
    if (type !== 'Bill' && type !== 'Paycheck') return res.status(400).json({ error: 'type must be Bill or Paycheck' });
    const stmt = db.prepare(`INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type) VALUES (?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(String(name), String(type), Number(estimatedAmount), String(startDate), isRecurring ? 1 : 0, recurringType || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/recurrings/:id', (req, res) => {
  try {
    const info = db.prepare('UPDATE recurrings SET archived=1 WHERE id=?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Confirm a recurring occurrence: creates a linked transaction
app.post('/api/recurrings/:id/confirm', express.json(), (req, res) => {
  try {
    const r = db.prepare('SELECT id, name, type, estimated_amount, start_date, is_recurring, recurring_type FROM recurrings WHERE id=? AND archived=0').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Recurring not found' });
    const { date, amount, accountId, description } = req.body || {};
    if (!date || amount == null || !accountId) return res.status(400).json({ error: 'date, amount, accountId required' });
    let amt = Number(amount);
    let tType = r.type === 'Bill' ? 'Debit' : 'Credit';
    if (r.type === 'Bill' && amt > 0) amt = -amt;
    if (r.type === 'Paycheck' && amt < 0) amt = Math.abs(amt);
    const stmt = db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(Number(accountId), String(date), amt, tType, 'confirmed', description || r.name, r.id);
    // Advance recurring next date if recurring
    if (r.is_recurring) {
      const next = nextOccurrence(r.start_date, r.recurring_type);
      db.prepare('UPDATE recurrings SET start_date=? WHERE id=?').run(next, r.id);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Skip current occurrence (advance without creating a transaction)
app.post('/api/recurrings/:id/skip', (req, res) => {
  try {
    const r = db.prepare('SELECT id, start_date, recurring_type, is_recurring FROM recurrings WHERE id=? AND archived=0').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Recurring not found' });
    if (!r.is_recurring) return res.json({ ok: true });
    const next = nextOccurrence(r.start_date, r.recurring_type);
    db.prepare('UPDATE recurrings SET start_date=? WHERE id=?').run(next, r.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Edit recurring fields
app.patch('/api/recurrings/:id', express.json(), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM recurrings WHERE id=? AND archived=0').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, type, estimatedAmount, startDate, isRecurring, recurringType, archived } = req.body || {};
    const nextVals = {
      name: name != null ? String(name) : existing.name,
      type: type != null ? String(type) : existing.type,
      estimated_amount: estimatedAmount != null ? Number(estimatedAmount) : Number(existing.estimated_amount),
      start_date: startDate != null ? String(startDate) : existing.start_date,
      is_recurring: isRecurring != null ? (isRecurring ? 1 : 0) : existing.is_recurring,
      recurring_type: recurringType != null ? String(recurringType) : existing.recurring_type,
      archived: archived != null ? (archived ? 1 : 0) : existing.archived,
    };
    if (nextVals.type !== 'Bill' && nextVals.type !== 'Paycheck') return res.status(400).json({ error: 'type must be Bill or Paycheck' });
    const info = db.prepare('UPDATE recurrings SET name=?, type=?, estimated_amount=?, start_date=?, is_recurring=?, recurring_type=?, archived=? WHERE id=?')
      .run(nextVals.name, nextVals.type, nextVals.estimated_amount, nextVals.start_date, nextVals.is_recurring, nextVals.recurring_type, nextVals.archived, req.params.id);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/summary', (req, res) => {
  try {
    // Sum per-account balances (honor manual reset) for total currentBalance
    const acctBalances = db.prepare(`
      SELECT 
        CASE 
          WHEN a.balance_reset_date IS NOT NULL AND a.balance_reset_amount IS NOT NULL THEN 
            (0 + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND date(t.date) >= date(a.balance_reset_date)), 0))
          ELSE 
            (a.initial_balance + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id), 0))
        END as Balance
      , a.type as AccountType
      FROM accounts a
      WHERE a.archived=0
    `).all();
    const currentBalance = acctBalances
      .filter(r => (r.AccountType || 'Checking') !== 'Savings')
      .reduce((s, r) => s + (Number(r.Balance) || 0), 0);
  const bills = db.prepare("SELECT estimated_amount as amount, start_date FROM recurrings WHERE archived=0 AND type='Bill'").all();
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
  // Calculate balance using balance_reset if present: baseline 0 + sum(transactions since reset date)
    const rows = db.prepare(`
      SELECT 
        a.id as AccountId,
        a.name as AccountName,
        a.display_name as DisplayName,
  a.type as AccountType,
        CASE 
          WHEN a.balance_reset_date IS NOT NULL AND a.balance_reset_amount IS NOT NULL THEN 
      (0 + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND date(t.date) >= date(a.balance_reset_date)), 0))
          ELSE 
            (a.initial_balance + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id), 0))
        END as Balance
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
