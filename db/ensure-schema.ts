import { getDatabaseBinding } from './index';

let schemaPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (!schemaPromise) {
    const db = getDatabaseBinding();
    schemaPromise = initializeSchema(db)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  return schemaPromise;
}

async function initializeSchema(db: D1Database) {
  await db.batch([
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
            revision TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, date)
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            date TEXT NOT NULL,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, id)
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_tasks_owner_date_position
          ON tasks (owner_id, date, position)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS cycles (
            id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            title TEXT NOT NULL,
            goal TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            revision TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, id)
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_cycles_owner_dates
          ON cycles (owner_id, start_date, end_date)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS cycle_phases (
            id TEXT NOT NULL,
            cycle_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, id)
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_cycle_phases_owner_cycle_position
          ON cycle_phases (owner_id, cycle_id, position)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS rate_limits (
            key TEXT PRIMARY KEY NOT NULL,
            window_start INTEGER NOT NULL,
            count INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
          ON rate_limits (window_start)
        `),
    db.prepare('PRAGMA optimize'),
  ]);

  const dayColumns = await db
    .prepare('PRAGMA table_info(day_entries)')
    .all<{ name: string }>();
  if (!dayColumns.results.some((column) => column.name === 'revision')) {
    await db
      .prepare("ALTER TABLE day_entries ADD COLUMN revision TEXT NOT NULL DEFAULT ''")
      .run();
  }

  const taskColumns = await db
    .prepare('PRAGMA table_info(tasks)')
    .all<{ name: string; pk: number }>();
  const ownerPrimaryKey = taskColumns.results.find(
    (column) => column.name === 'owner_id',
  )?.pk;
  const idPrimaryKey = taskColumns.results.find(
    (column) => column.name === 'id',
  )?.pk;

  if (ownerPrimaryKey !== 1 || idPrimaryKey !== 2) {
    await db.batch([
      db.prepare('DROP TABLE IF EXISTS tasks_owner_scoped'),
      db.prepare(`
        CREATE TABLE tasks_owner_scoped (
          id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          date TEXT NOT NULL,
          text TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (owner_id, id)
        )
      `),
      db.prepare(`
        INSERT INTO tasks_owner_scoped
          (id, owner_id, date, text, done, position, created_at, updated_at)
        SELECT id, owner_id, date, text, done, position, created_at, updated_at
        FROM tasks
      `),
      db.prepare('DROP TABLE tasks'),
      db.prepare('ALTER TABLE tasks_owner_scoped RENAME TO tasks'),
      db.prepare(`
        CREATE INDEX idx_tasks_owner_date_position
        ON tasks (owner_id, date, position)
      `),
    ]);
  }

  await db.prepare('PRAGMA optimize').run();
}
