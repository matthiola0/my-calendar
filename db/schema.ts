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
    cycleId: text('cycle_id'),
    phaseId: text('phase_id'),
    sectionId: text('section_id'),
    recurrenceId: text('recurrence_id'),
    deadline: text('deadline'),
    habitCue: text('habit_cue'),
    tinyStart: text('tiny_start'),
    identity: text('identity'),
    leetcodeProblemId: text('leetcode_problem_id'),
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
    index('idx_tasks_owner_cycle_done').on(
      table.ownerId,
      table.cycleId,
      table.done,
    ),
    index('idx_tasks_owner_recurrence_date').on(
      table.ownerId,
      table.recurrenceId,
      table.date,
    ),
    index('idx_tasks_owner_leetcode_date').on(
      table.ownerId,
      table.leetcodeProblemId,
      table.date,
    ),
  ],
);

export const leetcodeProblems = sqliteTable(
  'leetcode_problems',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull().default(''),
    difficulty: text('difficulty').notNull().default('medium'),
    plannedDate: text('planned_date'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_leetcode_problems_owner_planned').on(table.ownerId, table.plannedDate),
  ],
);

export const leetcodeAttempts = sqliteTable(
  'leetcode_attempts',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    problemId: text('problem_id').notNull(),
    taskId: text('task_id'),
    attemptedOn: text('attempted_on').notNull(),
    status: text('status').notNull(),
    notes: text('notes').notNull().default(''),
    attemptNumber: integer('attempt_number').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    uniqueIndex('idx_leetcode_attempts_owner_problem_number').on(
      table.ownerId,
      table.problemId,
      table.attemptNumber,
    ),
    uniqueIndex('idx_leetcode_attempts_owner_task').on(table.ownerId, table.taskId),
    index('idx_leetcode_attempts_owner_date').on(table.ownerId, table.attemptedOn),
  ],
);

export const daySections = sqliteTable(
  'day_sections',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_day_sections_owner_position').on(table.ownerId, table.position),
  ],
);

export const customFields = sqliteTable(
  'custom_fields',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index('idx_custom_fields_owner_position').on(table.ownerId, table.position),
  ],
);

export const customFieldEntries = sqliteTable(
  'custom_field_entries',
  {
    ownerId: text('owner_id').notNull(),
    fieldId: text('field_id').notNull(),
    date: text('date').notNull(),
    content: text('content').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.fieldId, table.date] }),
    index('idx_custom_field_entries_owner_date').on(table.ownerId, table.date),
  ],
);

export const cycles = sqliteTable(
  'cycles',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    reward: text('reward').notNull().default(''),
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
