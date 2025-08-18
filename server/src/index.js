import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import db from './db.js';
import { nextOccurrence } from './utils.js';
import { validate, accountSchema, updateAccountSchema, transactionSchema, updateTransactionSchema, billSchema, paycheckSchema, recurringSchema, updateRecurringSchema, confirmRecurringSchema } from './validation.js';
import { hashPassword, comparePassword, generateToken, authenticate } from './auth.js';
import { errorHandler } from './middleware/error.js';
dayjs.extend(customParseFormat);

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || false; // false lets cors allow any origin; set explicit origin when provided
app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));
app.use(express.json());

// Unauthenticated endpoints
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.post('/api/register', (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
  const hashedPassword = hashPassword(password);
  const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  const info = stmt.run(username, hashedPassword);

  // Return token immediately after registration
  const token = generateToken({ id: info.lastInsertRowid, username });
  res.status(201).json({ id: info.lastInsertRowid, username, token });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'username already exists' });
    }
    next(e);
  }
});
app.post('/api/login', (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  if (!comparePassword(password, user.password)) return res.status(401).json({ error: 'invalid credentials' });
  const token = generateToken({ id: user.id, username: user.username });
  res.json({ token });
  } catch (e) {
    next(e);
  }
});

// Authenticated endpoints
const apiRouter = express.Router();
apiRouter.use(authenticate);

apiRouter.get('/accounts', (req, res, next) => {
  try {
  const { archived } = req.query || {};
  const flag = String(archived) === '1' ? 1 : 0;
  const rows = db.prepare('SELECT id, name as AccountName, display_name as DisplayName, initial_balance, type as AccountType FROM accounts WHERE archived=? AND user_id=? ORDER BY display_name').all(flag, req.user.id);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/accounts', validate(accountSchema), (req, res, next) => {
  try {
  const { name, displayName, initialBalance = 0, type = 'Checking' } = req.body;
    // Create account with zero initial balance; track the provided initial as a Manual Adjustment transaction
  const insertAcct = db.prepare('INSERT INTO accounts(name, display_name, initial_balance, type, user_id) VALUES (?, ?, ?, ?, ?)');
  const info = insertAcct.run(String(name), String(displayName), 0, String(type), req.user.id);
    const id = info.lastInsertRowid;
    const init = Number(initialBalance || 0);
  if (init !== 0) {
      let amt = Math.abs(init);
      let tType = init >= 0 ? 'Credit' : 'Debit';
      if (tType === 'Debit') amt = -amt;
      const today = new Date().toISOString().slice(0,10);
      db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, today, amt, tType, 'confirmed', 'Initial Balance', req.user.id);
    }
  res.status(201).json({ id, name, displayName, initialBalance: init, type });
  } catch (e) {
    next(e);
  }
});

apiRouter.delete('/accounts/:id', (req, res, next) => {
  try {
    const info = db.prepare('UPDATE accounts SET archived=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

apiRouter.patch('/accounts/:id', validate(updateAccountSchema), (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM accounts WHERE id=? AND archived=0 AND user_id=?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { displayName, name, type, balanceResetDate, balanceResetAmount } = req.body;
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
    const info = db.prepare('UPDATE accounts SET name=?, display_name=?, type=?, balance_reset_date=?, balance_reset_amount=? WHERE id=? AND user_id=?')
      .run(next.name, next.display_name, next.type, next.balance_reset_date, next.balance_reset_amount, req.params.id, req.user.id);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/transactions', (req, res, next) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const rows = db.prepare(`
      SELECT id, TransactionDate, Amount, TransactionType, Status, Description, AccountName, DisplayName, RecurringId, Synthetic
      FROM (
    SELECT t.id, t.date as TransactionDate, t.amount as Amount, t.type as TransactionType, t.status as Status, t.description as Description,
      a.name as AccountName, a.display_name as DisplayName, t.recurring_id as RecurringId, 0 as Synthetic
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id AND a.user_id = ?
        UNION ALL
        SELECT NULL as id, r.start_date as TransactionDate,
              CASE WHEN r.type = 'Bill' THEN -ABS(r.estimated_amount) ELSE ABS(r.estimated_amount) END as Amount,
              CASE WHEN r.type = 'Bill' THEN 'Debit' ELSE 'Credit' END as TransactionType,
              'pending' as Status,
              r.name as Description,
              '(unassigned)' as AccountName,
              '(unassigned)' as DisplayName,
      r.id as RecurringId,
      1 as Synthetic
    FROM recurrings r
    WHERE r.archived=0 AND date(r.start_date) <= date(?) AND r.user_id = ?
      )
      ORDER BY TransactionDate DESC, id DESC
      LIMIT 500
  `).all(req.user.id, today, req.user.id);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/transactions', validate(transactionSchema), (req, res, next) => {
  try {
  const { accountId, date, amount, type, status = 'pending', description } = req.body;
  // Ensure account belongs to user
  const acct = db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=? AND archived=0').get(accountId, req.user.id);
  if (!acct) return res.status(400).json({ error: 'invalid account' });
  let amt = Number(amount);
  const t = String(type).toLowerCase();
  if (t === 'debit' && amt > 0) amt = -amt;
  if (t === 'credit' && amt < 0) amt = Math.abs(amt);
  const stmt = db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = stmt.run(accountId, date, amt, String(type), String(status), description || null, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    next(e);
  }
});

apiRouter.patch('/transactions/:id', validate(updateTransactionSchema), (req, res, next) => {
  try {
    const { date, amount, type, status, description, accountId } = req.body;
    const existing = db.prepare('SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id=? AND a.user_id=?').get(req.params.id, req.user.id);
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
    // If changing account, ensure new account belongs to user
    if (accountId != null) {
      const acct = db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=? AND archived=0').get(accountId, req.user.id);
      if (!acct) return res.status(400).json({ error: 'invalid account' });
    }
    const info = db.prepare('UPDATE transactions SET date=?, amount=?, type=?, status=?, description=?, account_id=? WHERE id=?')
      .run(update.date, update.amount, update.type, update.status, update.description, update.account_id, req.params.id);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    next(e);
  }
});

apiRouter.delete('/transactions/:id', (req, res, next) => {
  try {
    // Delete only if transaction belongs to an account owned by user
    const info = db.prepare('DELETE FROM transactions WHERE id IN (SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id=? AND a.user_id=?)').run(req.params.id, req.params.id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/bills', (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT id, name as BillName, estimated_amount as Amount, start_date as StartDate,
             is_recurring as IsRecurring, recurring_type as RecurringType
      FROM recurrings
      WHERE archived=0 AND type='Bill' AND user_id=?
      ORDER BY start_date
    `).all(req.user.id);
    const today = dayjs().startOf('day');
    const upcoming = rows.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
    res.json(upcoming);
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/bills', validate(billSchema), (req, res, next) => {
  try {
    const { name, amount, startDate, isRecurring = true, recurringType = null } = req.body;
  const stmt = db.prepare(`INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type, user_id) VALUES (?, 'Bill', ?, ?, ?, ?, ?)`);
  const info = stmt.run(String(name), Number(amount), String(startDate), isRecurring ? 1 : 0, recurringType || null, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid, type: 'Bill' });
  } catch (e) {
    next(e);
  }
});

apiRouter.delete('/bills/:id', (req, res, next) => {
  try {
  const info = db.prepare('UPDATE recurrings SET archived=1 WHERE id=? AND type=\'Bill\' AND user_id=?').run(req.params.id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/paychecks', (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT id, name as PaycheckName, estimated_amount as Amount, start_date as StartDate,
             is_recurring as IsRecurring, recurring_type as RecurringType
      FROM recurrings
      WHERE archived=0 AND type='Paycheck' AND user_id=?
      ORDER BY start_date
    `).all(req.user.id);
    const today = dayjs().startOf('day');
    const upcoming = rows.filter(b => dayjs(b.StartDate).isSame(today) || dayjs(b.StartDate).isAfter(today));
    res.json(upcoming);
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/paychecks', validate(paycheckSchema), (req, res, next) => {
  try {
    const { name, amount, startDate, isRecurring = true, recurringType = null } = req.body;
  const stmt = db.prepare(`INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type, user_id) VALUES (?, 'Paycheck', ?, ?, ?, ?, ?)`);
  const info = stmt.run(String(name), Number(amount), String(startDate), isRecurring ? 1 : 0, recurringType || null, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid, type: 'Paycheck' });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/recurrings', (req, res, next) => {
  try {
    const { type } = req.query || {};
    const params = [];
    let whereType = '';
    if (type && (type === 'Bill' || type === 'Paycheck')) {
      whereType = `AND type=?`;
      params.push(type);
    }
    const rows = db.prepare(`
      SELECT id, name, type, estimated_amount, start_date, is_recurring, recurring_type
      FROM recurrings
  WHERE archived=0 ${whereType} AND user_id=?
      ORDER BY start_date
  `).all(...params, req.user.id);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/recurrings', validate(recurringSchema), (req, res, next) => {
  try {
    const { name, type, estimatedAmount, startDate, isRecurring = true, recurringType = null } = req.body;
    if (type !== 'Bill' && type !== 'Paycheck') return res.status(400).json({ error: 'type must be Bill or Paycheck' });
  const stmt = db.prepare(`INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(String(name), String(type), Number(estimatedAmount), String(startDate), isRecurring ? 1 : 0, recurringType || null, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    next(e);
  }
});

apiRouter.delete('/recurrings/:id', (req, res, next) => {
  try {
    const info = db.prepare('UPDATE recurrings SET archived=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/recurrings/:id/confirm', validate(confirmRecurringSchema), (req, res, next) => {
  try {
    const r = db.prepare('SELECT id, name, type, estimated_amount, start_date, is_recurring, recurring_type FROM recurrings WHERE id=? AND archived=0 AND user_id=?').get(req.params.id, req.user.id);
    if (!r) return res.status(404).json({ error: 'Recurring not found' });
    const { date, amount, accountId, description } = req.body;
    let amt = Number(amount);
    let tType = r.type === 'Bill' ? 'Debit' : 'Credit';
    if (r.type === 'Bill' && amt > 0) amt = -amt;
    if (r.type === 'Paycheck' && amt < 0) amt = Math.abs(amt);
    // Ensure account belongs to user
    const acct = db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=? AND archived=0').get(accountId, req.user.id);
    if (!acct) return res.status(400).json({ error: 'invalid account' });
    const stmt = db.prepare('INSERT INTO transactions(account_id, date, amount, type, status, description, recurring_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(Number(accountId), String(date), amt, tType, 'confirmed', description || r.name, r.id, req.user.id);
    // Advance recurring next date if recurring
    if (r.is_recurring) {
      const next = nextOccurrence(r.start_date, r.recurring_type);
      db.prepare('UPDATE recurrings SET start_date=? WHERE id=? AND user_id=?').run(next, r.id, req.user.id);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/recurrings/:id/skip', (req, res, next) => {
  try {
    const r = db.prepare('SELECT id, start_date, recurring_type, is_recurring FROM recurrings WHERE id=? AND archived=0 AND user_id=?').get(req.params.id, req.user.id);
    if (!r) return res.status(404).json({ error: 'Recurring not found' });
    if (!r.is_recurring) return res.json({ ok: true });
    const next = nextOccurrence(r.start_date, r.recurring_type);
    db.prepare('UPDATE recurrings SET start_date=? WHERE id=? AND user_id=?').run(next, r.id, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

apiRouter.patch('/recurrings/:id', validate(updateRecurringSchema), (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM recurrings WHERE id=? AND archived=0 AND user_id=?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, type, estimatedAmount, startDate, isRecurring, recurringType, archived } = req.body;
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
    const info = db.prepare('UPDATE recurrings SET name=?, type=?, estimated_amount=?, start_date=?, is_recurring=?, recurring_type=?, archived=? WHERE id=? AND user_id=?')
      .run(nextVals.name, nextVals.type, nextVals.estimated_amount, nextVals.start_date, nextVals.is_recurring, nextVals.recurring_type, nextVals.archived, req.params.id, req.user.id);
    res.json({ ok: true, changes: info.changes });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/summary', (req, res, next) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    // Expand paychecks into future occurrences and choose the paycheck-after-next (2nd future occurrence).
    const rows = db.prepare(`
      SELECT id, start_date, is_recurring, recurring_type, estimated_amount
      FROM recurrings
      WHERE archived=0 AND type='Paycheck' AND user_id = ?
      ORDER BY start_date
    `).all(req.user.id);

    // Helper to get next occurrence using server-side nextOccurrence function
    const expandOccurrences = (startDate, recurringType, maxPer = 3) => {
      const out = [];
      let cur = startDate;
      // advance until cur > today
      let safety = 0;
      while (dayjs(cur).isSame(dayjs(today)) || dayjs(cur).isBefore(dayjs(today))) {
        cur = nextOccurrence(cur, recurringType);
        safety++;
        if (safety > 200) break;
      }
      for (let i = 0; i < maxPer; i++) {
        if (!cur) break;
        out.push(cur);
        cur = nextOccurrence(cur, recurringType);
      }
      return out;
    };

    // Build paycheck occurrence objects with amounts: [{ date: dayjs, amount: number }]
    let occurrencesObj = [];
    rows.forEach(r => {
      const start = r.start_date;
      const amt = Math.abs(Number(r.estimated_amount || 0));
      if (r.is_recurring) {
        const fut = expandOccurrences(start, r.recurring_type, 3);
        fut.forEach(d => { if (dayjs(d).isAfter(dayjs(today))) occurrencesObj.push({ date: dayjs(d), amount: amt }); });
      } else {
        if (dayjs(start).isAfter(dayjs(today))) occurrencesObj.push({ date: dayjs(start), amount: amt });
      }
    });
    occurrencesObj.sort((a, b) => a.date.valueOf() - b.date.valueOf());
    const occurrences = occurrencesObj.map(o => o.date.format('YYYY-MM-DD'));

    let upperDate = null;
    if (occurrences.length >= 2) upperDate = occurrences[1];
    else if (occurrences.length === 1) upperDate = occurrences[0];
    else upperDate = dayjs().add(20, 'day').format('YYYY-MM-DD');

  const summary = db.prepare(`
      SELECT
        (
          SELECT SUM(Balance)
          FROM (
            SELECT
              CASE
                WHEN a.balance_reset_date IS NOT NULL AND a.balance_reset_amount IS NOT NULL THEN
                  (0 + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND date(t.date) >= date(a.balance_reset_date) AND t.user_id = ?), 0))
                ELSE
                  (a.initial_balance + IFNULL((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.user_id = ?), 0))
              END as Balance
            FROM accounts a
            WHERE a.archived=0 AND (a.type IS NULL OR a.type != 'Savings') AND a.user_id = ?
          )
        ) as currentBalance,
        (
          SELECT IFNULL(SUM(estimated_amount), 0)
          FROM recurrings
          WHERE archived=0 AND type='Bill' AND date(start_date) >= date(?) AND date(start_date) <= date(?) AND user_id = ?
        ) as upcomingTotal
    `).get(req.user.id, req.user.id, req.user.id, today, upperDate, req.user.id);

    // Also return the upper bound used for upcomingTotal and the count of bills in that window
    const billCountRow = db.prepare(`
      SELECT COUNT(*) as c
      FROM recurrings
      WHERE archived=0 AND type='Bill' AND date(start_date) >= date(?) AND date(start_date) <= date(?) AND user_id = ?
    `).get(today, upperDate, req.user.id);

    const currentBalance = Number(summary.currentBalance || 0);
    const realBalance = currentBalance - Number(summary.upcomingTotal || 0);

    // Build bills list once for fine-grained date window sums
    const billRows = db.prepare(`
      SELECT start_date, estimated_amount
      FROM recurrings
      WHERE archived=0 AND type='Bill' AND user_id = ?
    `).all(req.user.id);

    const t0 = dayjs(today);
    const fallbackMax = t0.add(20, 'day');
    const nextObj = occurrencesObj[0] || null;
    const secondObj = occurrencesObj[1] || null;

    const sumBillsBetween = (startInclusive, endInclusive) => {
      return billRows
        .map(b => ({ d: dayjs(b.start_date), amt: Math.abs(Number(b.estimated_amount || 0)) }))
        .filter(x => (x.d.isSame(startInclusive) || x.d.isAfter(startInclusive)) && (x.d.isSame(endInclusive) || x.d.isBefore(endInclusive) || x.d.isSame(endInclusive)))
        .reduce((s, x) => s + x.amt, 0);
    };
    const sumBillsBefore = (cutoff) => {
      return billRows
        .map(b => ({ d: dayjs(b.start_date), amt: Math.abs(Number(b.estimated_amount || 0)) }))
        .filter(x => (x.d.isAfter(t0) || x.d.isSame(t0)) && x.d.isBefore(cutoff))
        .reduce((s, x) => s + x.amt, 0);
    };

    // adjustedRealBalance per client logic but computed from currentBalance directly
    let adjustedRealBalance = 0;
    let shortfallUsed = false;
    let shortfallWindowStart = null;
    let shortfallWindowEnd = null;
    if (!nextObj) {
      const billsUpTo = sumBillsBetween(t0, fallbackMax);
      adjustedRealBalance = currentBalance - billsUpTo;
    } else {
      const billsBeforeNext = sumBillsBefore(nextObj.date);
      const baseAfterBeforeNext = currentBalance - billsBeforeNext;
      const upperForAfterNext = (secondObj && secondObj.date.isBefore(fallbackMax) || secondObj && secondObj.date.isSame(fallbackMax)) ? secondObj.date : fallbackMax;
      const billsBetweenNextAndUpper = sumBillsBetween(nextObj.date, upperForAfterNext);
      const payInBetween = occurrencesObj
        .filter(p => (p.date.isAfter(nextObj.date) || p.date.isSame(nextObj.date)) && (p.date.isBefore(upperForAfterNext) || p.date.isSame(upperForAfterNext)))
        .reduce((s, p) => s + Math.abs(Number(p.amount || 0)), 0);
      const netBetween = payInBetween - billsBetweenNextAndUpper;
      adjustedRealBalance = baseAfterBeforeNext + (netBetween < 0 ? netBetween : 0);
      shortfallUsed = netBetween < 0;
      shortfallWindowStart = nextObj.date.format('YYYY-MM-DD');
      shortfallWindowEnd = upperForAfterNext.format('YYYY-MM-DD');
    }
    // Cap upper bound to currentBalance (available non-savings balances)
    if (adjustedRealBalance > currentBalance) adjustedRealBalance = currentBalance;

    // dailySpend: divide adjustedRealBalance by days to next paycheck (or 20 days)
    let dailySpend = 0;
    if (adjustedRealBalance > 0) {
      const nextDate = occurrencesObj[0]?.date || null;
      const target = nextDate ? (nextDate.isBefore(fallbackMax) ? nextDate : fallbackMax) : fallbackMax;
      const days = Math.max(1, target.startOf('day').diff(t0.startOf('day'), 'day'));
      dailySpend = Math.max(0, adjustedRealBalance / days);
    }

    res.json({
      currentBalance,
      upcomingTotal: summary.upcomingTotal || 0,
      realBalance,
      adjustedRealBalance,
      dailySpend,
      shortfallUsed,
      shortfallWindowStart,
      shortfallWindowEnd,
      upcomingUpperDate: upperDate,
      upcomingCount: billCountRow ? billCountRow.c || 0 : 0
    });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/accounts-summary', (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT
        a.id as AccountId,
        a.name as AccountName,
        a.display_name as DisplayName,
        a.type as AccountType,
        (
          SELECT
            CASE
              WHEN a.balance_reset_date IS NOT NULL AND a.balance_reset_amount IS NOT NULL THEN
                (0 + IFNULL(SUM(t.amount), 0))
              ELSE
                (a.initial_balance + IFNULL(SUM(t.amount), 0))
            END
          FROM transactions t
          WHERE t.account_id = a.id AND
                (a.balance_reset_date IS NULL OR date(t.date) >= date(a.balance_reset_date)) AND t.user_id = ?
        ) as Balance
      FROM accounts a
      WHERE a.archived = 0 AND a.user_id = ?
      ORDER BY a.display_name
    `).all(req.user.id, req.user.id);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.use('/api', apiRouter);

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

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`API listening on http://${HOST}:${PORT}`));
