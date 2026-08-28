import { getDatabaseBinding } from './index';

let schemaPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (!schemaPromise) {
    const db = getDatabaseBinding();
    schemaPromise = db
      .batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS day_entries (
            owner_id TEXT NOT NULL,
            date TEXT NOT NULL,
            activity TEXT NOT NULL DEFAULT '',
            reflection TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, date)
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY NOT NULL,
            owner_id TEXT NOT NULL,
            date TEXT NOT NULL,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_tasks_owner_date_position
          ON tasks (owner_id, date, position)
        `),
        db.prepare('PRAGMA optimize'),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  return schemaPromise;
}
