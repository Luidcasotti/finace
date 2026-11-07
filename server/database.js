import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS recurring (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('income','expense')), title TEXT NOT NULL,
      category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
      start_date TEXT NOT NULL, end_month TEXT, UNIQUE(id,user_id)
    );
    CREATE TABLE IF NOT EXISTS installments (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
      category TEXT NOT NULL, total INTEGER NOT NULL CHECK(total > 0),
      count INTEGER NOT NULL CHECK(count BETWEEN 2 AND 120), first_due TEXT NOT NULL,
      UNIQUE(id,user_id)
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('income','expense')), title TEXT NOT NULL,
      category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
      due_date TEXT NOT NULL, settled_on TEXT,
      recurring_id TEXT, occurrence_month TEXT, installment_id TEXT, installment_number INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
      UNIQUE(recurring_id,occurrence_month), UNIQUE(installment_id,installment_number),
      FOREIGN KEY(recurring_id,user_id) REFERENCES recurring(id,user_id),
      FOREIGN KEY(installment_id,user_id) REFERENCES installments(id,user_id)
    );
    CREATE INDEX IF NOT EXISTS entries_user_date ON entries(user_id,due_date);
    CREATE TABLE IF NOT EXISTS reserves (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
      target INTEGER NOT NULL CHECK(target > 0), deadline TEXT, UNIQUE(id,user_id)
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), reserve_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount != 0), date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(reserve_id,user_id) REFERENCES reserves(id,user_id)
    );
    CREATE INDEX IF NOT EXISTS transfers_user ON transfers(user_id,reserve_id,date);
    PRAGMA user_version = 1;
  `);
  return db;
}
