import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const passwordUsers = sqliteTable(
  'password_users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordSalt: text('password_salt').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_password_users_username').on(table.username)],
);

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_auth_sessions_user_id').on(table.userId),
    index('idx_auth_sessions_expires_at').on(table.expiresAt),
  ],
);

export const googleUsers = sqliteTable('google_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const googleAuthSessions = sqliteTable(
  'google_auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_google_auth_sessions_user_id').on(table.userId),
    index('idx_google_auth_sessions_expires_at').on(table.expiresAt),
  ],
);

export const dayEntries = sqliteTable(
  'day_entries',
  {
    ownerId: text('owner_id').notNull(),
    date: text('date').notNull(),
    activity: text('activity').notNull().default(''),
    reflection: text('reflection').notNull().default(''),
    revision: text('revision').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.date] })],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    date: text('date').notNull(),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_tasks_owner_date_position').on(
      table.ownerId,
      table.date,
      table.position,
    ),
  ],
);

export const cycles = sqliteTable(
  'cycles',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: text('status').notNull().default('active'),
    revision: text('revision').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_cycles_owner_dates').on(table.ownerId, table.startDate, table.endDate),
  ],
);

export const cyclePhases = sqliteTable(
  'cycle_phases',
  {
    id: text('id').notNull(),
    cycleId: text('cycle_id').notNull(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_cycle_phases_owner_cycle_position').on(
      table.ownerId,
      table.cycleId,
      table.position,
    ),
  ],
);

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [index('idx_rate_limits_window_start').on(table.windowStart)],
);
