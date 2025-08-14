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

// Migrations (idempotent)
db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
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
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
`)

export default db
