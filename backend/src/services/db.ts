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

  CREATE TABLE IF NOT EXISTS attachments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cup_id        INTEGER REFERENCES cups(id) ON DELETE CASCADE,
    email_job_id  INTEGER REFERENCES email_jobs(id),
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size          INTEGER NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE,
    token      TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Kolumntillägg. "duplicate column name" är det förväntade felet när
// kolumnen redan finns – allt annat loggas istället för att sväljas tyst,
// så ett verkligt schemafel inte blir osynligt.
// (Ersätts av numrerade migrationsfiler, se todo.md.)
for (const col of [
  `ALTER TABLE cups ADD COLUMN cup_type TEXT`,
  `ALTER TABLE cups ADD COLUMN notes TEXT`,
  `ALTER TABLE subscriptions ADD COLUMN status TEXT DEFAULT 'confirmed'`,
  `ALTER TABLE subscriptions ADD COLUMN token_expires_at TEXT`,
  `ALTER TABLE cups ADD COLUMN recommended INTEGER DEFAULT 0`,
  `ALTER TABLE cups ADD COLUMN registration_deadline TEXT`,
  `ALTER TABLE cups ADD COLUMN rejected_reason TEXT`,
  `ALTER TABLE subscriptions ADD COLUMN age_classes TEXT`,
]) {
  try {
    db.exec(col);
  } catch (err: any) {
    if (!/duplicate column name/i.test(err?.message || '')) {
      console.error(`[${new Date().toISOString()}] Schemaändring misslyckades: ${col}`, err);
    }
  }
}

// Index på det som faktiskt filtreras och sorteras. Förebyggande vid
// nuvarande datavolym, men gratis att lägga till.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cups_status_start ON cups(status, start_date);
  CREATE INDEX IF NOT EXISTS idx_cups_status_thumbs ON cups(status, thumbs_up DESC);
  CREATE INDEX IF NOT EXISTS idx_cups_created ON cups(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_attachments_cup ON attachments(cup_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_job ON attachments(email_job_id);
  CREATE INDEX IF NOT EXISTS idx_email_jobs_received ON email_jobs(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_votes_cup ON votes(cup_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
`);

// Engångsmigrering: email_jobs.received_at sparades tidigare som Gmails råa
// RFC2822-header ("Mon, 13 May 2025 ..."). SQLite kan inte tolka det, så
// sorteringen blev lexikografisk på veckodagsnamn. Konvertera till ISO.
try {
  const legacy = db
    .prepare(`SELECT id, received_at FROM email_jobs WHERE received_at IS NOT NULL AND received_at NOT GLOB '[0-9][0-9][0-9][0-9]-*'`)
    .all() as { id: number; received_at: string }[];

  if (legacy.length > 0) {
    const update = db.prepare(`UPDATE email_jobs SET received_at = ? WHERE id = ?`);
    const migrate = db.transaction((rows: typeof legacy) => {
      for (const row of rows) {
        const d = new Date(row.received_at);
        if (!isNaN(d.getTime())) update.run(d.toISOString(), row.id);
      }
    });
    migrate(legacy);
    console.log(`[${new Date().toISOString()}] Migrerade ${legacy.length} email_jobs.received_at till ISO-format`);
  }
} catch (err) {
  console.error(`[${new Date().toISOString()}] Migrering av received_at misslyckades:`, err);
}

export default db;
