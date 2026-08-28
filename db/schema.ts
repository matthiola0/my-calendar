import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const dayEntries = sqliteTable(
  'day_entries',
  {
    ownerId: text('owner_id').notNull(),
    date: text('date').notNull(),
    activity: text('activity').notNull().default(''),
    reflection: text('reflection').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.date] })],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    date: text('date').notNull(),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_tasks_owner_date_position').on(
      table.ownerId,
      table.date,
      table.position,
    ),
  ],
);
