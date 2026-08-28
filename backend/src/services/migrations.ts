import type { Database } from 'better-sqlite3';

/**
 * Numrerade migrationer med versionstabell.
 *
 * Ersätter den tidigare loopen av `try { ALTER TABLE ... } catch {}`, som
 * svalde ALLA fel tyst – ett verkligt schemafel (låst databas, felstavad SQL)
 * blev osynligt och appen startade med ofullständigt schema.
 *
 * Regler:
 *  - Migrationer körs i ordning, en gång var, och registreras i
 *    `schema_migrations`.
 *  - Varje migration körs i en transaktion. Kastar den rullas den tillbaka
 *    och processen avbryts – ett halvt applicerat schema är värre än att
 *    inte starta.
 *  - Migration 1–4 är avsiktligt idempotenta, eftersom de beskriver schemat
 *    som redan finns i drift. Den befintliga databasen kan alltså köra dem
 *    utan att något ändras.
 *  - Lägg till nya migrationer sist i listan. Ändra aldrig en som körts.
 */

interface Migration {
  id: number;
  name: string;
  up: (db: Database) => void;
}

function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function addColumn(db: Database, table: string, column: string, definition: string): void {
  // Explicit kontroll istället för att fånga "duplicate column name" – då är
  // varje undantag som slipper igenom ett verkligt fel.
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'baseline-tabeller',
    up: (db) => {
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
    },
  },

  {
    id: 2,
    name: 'kolumntillagg',
    up: (db) => {
      addColumn(db, 'cups', 'cup_type', 'TEXT');
      addColumn(db, 'cups', 'notes', 'TEXT');
      addColumn(db, 'cups', 'recommended', 'INTEGER DEFAULT 0');
      addColumn(db, 'cups', 'registration_deadline', 'TEXT');
      addColumn(db, 'cups', 'rejected_reason', 'TEXT');
      addColumn(db, 'subscriptions', 'status', "TEXT DEFAULT 'confirmed'");
      addColumn(db, 'subscriptions', 'token_expires_at', 'TEXT');
      addColumn(db, 'subscriptions', 'age_classes', 'TEXT');
    },
  },

  {
    id: 3,
    name: 'index',
    up: (db) => {
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
    },
  },

  {
    id: 4,
    name: 'received-at-till-iso',
    up: (db) => {
      // Gmails Date-header sparades ordagrant ("Mon, 13 May 2025 ..."), vilket
      // gjorde "ORDER BY received_at DESC" lexikografisk på veckodagsnamn.
      const legacy = db
        .prepare(
          `SELECT id, received_at FROM email_jobs
           WHERE received_at IS NOT NULL AND received_at NOT GLOB '[0-9][0-9][0-9][0-9]-*'`
        )
        .all() as { id: number; received_at: string }[];

      if (legacy.length === 0) return;

      const update = db.prepare(`UPDATE email_jobs SET received_at = ? WHERE id = ?`);
      for (const row of legacy) {
        const d = new Date(row.received_at);
        if (!isNaN(d.getTime())) update.run(d.toISOString(), row.id);
      }
      console.log(`[${new Date().toISOString()}] Migrering: ${legacy.length} email_jobs.received_at omvandlade till ISO`);
    },
  },
];

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare(`SELECT id FROM schema_migrations`).all() as { id: number }[]).map((r) => r.id)
  );

  const record = db.prepare(`INSERT INTO schema_migrations (id, name) VALUES (?, ?)`);
  let ran = 0;

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    // Transaktion per migration: ett fel mitt i får inte lämna halva schemat.
    const apply = db.transaction(() => {
      migration.up(db);
      record.run(migration.id, migration.name);
    });

    try {
      apply();
      ran++;
      console.log(
        `[${new Date().toISOString()}] Migrering ${String(migration.id).padStart(3, '0')} "${migration.name}" applicerad`
      );
    } catch (err) {
      // Att starta med ofullständigt schema ger obegripliga fel senare –
      // bättre att stanna här med ett tydligt meddelande.
      console.error(
        `[${new Date().toISOString()}] MIGRERING MISSLYCKADES: ${migration.id} "${migration.name}". ` +
        'Databasen är oförändrad (transaktionen rullades tillbaka). Startar inte.',
        err
      );
      throw err;
    }
  }

  if (ran === 0) {
    console.log(`[${new Date().toISOString()}] Databasschemat är aktuellt (${applied.size} migrationer)`);
  }
}
