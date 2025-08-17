import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const DEFAULT_DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'data', 'app.db')

// Ensure directory exists
const ensureDir = (p) => {
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

ensureDir(DEFAULT_DB_PATH)
const db = new Database(DEFAULT_DB_PATH)
db.pragma('journal_mode = WAL')

// Base schema (idempotent creates)
db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  start_date TEXT NOT NULL,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurring_type TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  description TEXT,
  account_id INTEGER NOT NULL,
  recurring_id INTEGER,
  user_id INTEGER,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- New Recurrings table to support Bills and Paychecks
CREATE TABLE IF NOT EXISTS recurrings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Bill','Paycheck')),
  estimated_amount REAL NOT NULL,
  start_date TEXT NOT NULL,
  is_recurring INTEGER NOT NULL DEFAULT 1,
  recurring_type TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recurrings_type ON recurrings(type);
CREATE INDEX IF NOT EXISTS idx_recurrings_start ON recurrings(start_date);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
`)

// Progressive migrations for existing databases
try {
  const cols = db.prepare("PRAGMA table_info('transactions')").all();
  const hasRecurringId = cols.some(c => c.name === 'recurring_id');
  if (!hasRecurringId) {
    db.prepare('ALTER TABLE transactions ADD COLUMN recurring_id INTEGER').run();
  }
  // Create index now that column exists
  db.prepare('CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurring_id)').run();
} catch (e) {
  // Ignore; older SQLite might not support some ops in WAL
}

// Add user_id columns if missing
try {
  const aCols = db.prepare("PRAGMA table_info('accounts')").all();
  const hasUserInAccounts = aCols.some(c => c.name === 'user_id');
  if (!hasUserInAccounts) db.prepare('ALTER TABLE accounts ADD COLUMN user_id INTEGER').run();

  const tCols = db.prepare("PRAGMA table_info('transactions')").all();
  const hasUserInTx = tCols.some(c => c.name === 'user_id');
  if (!hasUserInTx) db.prepare('ALTER TABLE transactions ADD COLUMN user_id INTEGER').run();

  const rCols = db.prepare("PRAGMA table_info('recurrings')").all();
  const hasUserInR = rCols.some(c => c.name === 'user_id');
  if (!hasUserInR) db.prepare('ALTER TABLE recurrings ADD COLUMN user_id INTEGER').run();

  db.prepare('CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_recurrings_user ON recurrings(user_id)').run();
} catch (e) {
  // best-effort
}

// Progressive migration: add manual balance reset support to accounts
try {
  const aCols = db.prepare("PRAGMA table_info('accounts')").all();
  const hasType = aCols.some(c => c.name === 'type');
  const hasResetDate = aCols.some(c => c.name === 'balance_reset_date');
  const hasResetAmount = aCols.some(c => c.name === 'balance_reset_amount');
  if (!hasType) db.prepare("ALTER TABLE accounts ADD COLUMN type TEXT NOT NULL DEFAULT 'Checking'").run();
  if (!hasResetDate) db.prepare('ALTER TABLE accounts ADD COLUMN balance_reset_date TEXT').run();
  if (!hasResetAmount) db.prepare('ALTER TABLE accounts ADD COLUMN balance_reset_amount REAL').run();
} catch (e) {
  // ignore
}

// One-time data migration: copy legacy bills -> recurrings as type 'Bill' if recurrings is empty
try {
  const hasBills = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bills'").get();
  if (hasBills) {
    const recCount = db.prepare('SELECT COUNT(*) as c FROM recurrings').get().c;
    const billCount = db.prepare('SELECT COUNT(*) as c FROM bills').get().c;
    if (recCount === 0 && billCount > 0) {
      db.prepare("INSERT INTO recurrings(name, type, estimated_amount, start_date, is_recurring, recurring_type) SELECT name, 'Bill', amount, start_date, is_recurring, recurring_type FROM bills").run();
    }
  }
} catch (e) {
  // best-effort migration; ignore
}

export default db
