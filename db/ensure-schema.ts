import { getDatabaseBinding } from './index';

let schemaPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (!schemaPromise) {
    const db = getDatabaseBinding();
    schemaPromise = db
      .batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS password_users (
            id TEXT PRIMARY KEY NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_password_users_username
          ON password_users (username)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES password_users(id) ON DELETE CASCADE
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
          ON auth_sessions (user_id)
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
          ON auth_sessions (expires_at)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS google_users (
            id TEXT PRIMARY KEY NOT NULL,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS google_auth_sessions (
            token_hash TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES google_users(id) ON DELETE CASCADE
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_google_auth_sessions_user_id
          ON google_auth_sessions (user_id)
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_google_auth_sessions_expires_at
          ON google_auth_sessions (expires_at)
        `),
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
