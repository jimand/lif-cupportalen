import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'cups.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cups (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    location        TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT,
    age_classes     TEXT NOT NULL,
    url             TEXT,
    description     TEXT,
    source_email    TEXT,
    status          TEXT DEFAULT 'pending',
    thumbs_up       INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS votes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cup_id          INTEGER NOT NULL REFERENCES cups(id) ON DELETE CASCADE,
    voter_token     TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(cup_id, voter_token)
  );

  CREATE TABLE IF NOT EXISTS email_jobs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    gmail_message_id    TEXT UNIQUE NOT NULL,
    subject             TEXT,
    sender              TEXT,
    raw_body            TEXT,
    parsed_cup_id       INTEGER REFERENCES cups(id),
    status              TEXT DEFAULT 'pending',
    received_at         TEXT,
    processed_at        TEXT
  );
`);

export default db;
