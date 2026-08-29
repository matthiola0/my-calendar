import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Task = {
  id: string;
  text: string;
  done: boolean;
  cycleId: string | null;
  phaseId: string | null;
  sectionId: string | null;
  recurrenceId: string | null;
  habitCue: string | null;
  tinyStart: string | null;
  identity: string | null;
  streak: number;
  recoveryDue: boolean;
};

type DayEntry = {
  tasks: Task[];
  activity: string;
  reflection: string;
  revision: string | null;
};

type TaskRow = {
  id: string;
  date: string;
  text: string;
  done: number;
  cycleId: string | null;
  phaseId: string | null;
  sectionId: string | null;
  recurrenceId: string | null;
  habitCue: string | null;
  tinyStart: string | null;
  identity: string | null;
};

type SeriesRow = {
  recurrenceId: string;
  date: string;
  done: number;
};

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  const date = new URL(request.url).searchParams.get('date');
  if (!date || !isValidDate(date)) return invalidDate();

  await ensureSchema();
  const db = getDatabaseBinding();
  const day = await db
    .prepare(
      'SELECT activity, reflection, revision FROM day_entries WHERE owner_id = ? AND date = ?',
    )
    .bind(ownerId, date)
    .first<{ activity: string; reflection: string; revision: string }>();
  const taskRows = await db
    .prepare(
      `SELECT id, date, text, done, cycle_id AS cycleId, phase_id AS phaseId,
        section_id AS sectionId, recurrence_id AS recurrenceId,
        habit_cue AS habitCue, tiny_start AS tinyStart, identity
       FROM tasks WHERE owner_id = ? AND date = ? ORDER BY position ASC`,
    )
    .bind(ownerId, date)
    .all<TaskRow>();
  const seriesStats = await loadSeriesStats(db, ownerId, taskRows.results);

  return Response.json(
    {
      tasks: taskRows.results.map((task) => ({
        id: task.id,
        text: task.text,
        done: Boolean(task.done),
        cycleId: task.cycleId,
        phaseId: task.phaseId,
        sectionId: task.sectionId,
        recurrenceId: task.recurrenceId,
        habitCue: task.habitCue,
        tinyStart: task.tinyStart,
        identity: task.identity,
        streak: task.recurrenceId ? seriesStats.get(`${task.recurrenceId}:${date}`)?.streak ?? 0 : 0,
        recoveryDue: task.recurrenceId ? seriesStats.get(`${task.recurrenceId}:${date}`)?.recoveryDue ?? false : false,
      })),
      activity: day?.activity ?? '',
      reflection: day?.reflection ?? '',
      revision: day?.revision ?? null,
    } satisfies DayEntry,
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }

  const parsed = parseEntry(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { date, entry } = parsed;
  await ensureSchema();
  const db = getDatabaseBinding();
  if (!(await taskReferencesAreValid(db, ownerId, entry.tasks))) {
    return Response.json({ error: '綁定的大週期、階段或每日分段不存在。' }, { status: 400 });
  }
  const now = Date.now();
  const nextRevision = crypto.randomUUID();
  const dayMutation = entry.revision === null
    ? db
      .prepare(`
        INSERT INTO day_entries (owner_id, date, activity, reflection, revision, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, date) DO NOTHING
      `)
      .bind(ownerId, date, entry.activity, entry.reflection, nextRevision, now)
    : db
      .prepare(`
        UPDATE day_entries SET
          activity = ?,
          reflection = ?,
          revision = ?,
          updated_at = ?
        WHERE owner_id = ? AND date = ? AND revision = ?
      `)
      .bind(
        entry.activity,
        entry.reflection,
        nextRevision,
        now,
        ownerId,
        date,
        entry.revision,
      );
  const statements = [
    dayMutation,
    db
      .prepare(`
        DELETE FROM tasks
        WHERE owner_id = ? AND date = ?
          AND EXISTS (
            SELECT 1 FROM day_entries
            WHERE owner_id = ? AND date = ? AND revision = ?
          )
      `)
      .bind(ownerId, date, ownerId, date, nextRevision),
    ...entry.tasks.map((task, position) =>
      db
        .prepare(`
          INSERT INTO tasks
            (id, owner_id, date, text, done, cycle_id, phase_id, section_id,
             recurrence_id, habit_cue, tiny_start, identity, position, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM day_entries
            WHERE owner_id = ? AND date = ? AND revision = ?
          )
        `)
        .bind(
          task.id,
          ownerId,
          date,
          task.text,
          task.done ? 1 : 0,
          task.cycleId,
          task.phaseId,
          task.sectionId,
          task.recurrenceId,
          task.habitCue,
          task.tinyStart,
          task.identity,
          position,
          now,
          now,
          ownerId,
          date,
          nextRevision,
        ),
    ),
  ];

  const results = await db.batch(statements);
  if (!results[0].meta.changes) return conflict();
  return Response.json({ ok: true, revision: nextRevision, updatedAt: now });
}

function parseEntry(body: unknown):
  | { ok: true; date: string; entry: DayEntry }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '缺少行事曆內容。' };
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.date !== 'string' || !isValidDate(candidate.date)) {
    return { ok: false, error: '日期格式不正確。' };
  }
  if (
    typeof candidate.activity !== 'string' ||
    typeof candidate.reflection !== 'string' ||
    (candidate.revision !== null && typeof candidate.revision !== 'string') ||
    (typeof candidate.revision === 'string' && candidate.revision.length > 100) ||
    candidate.activity.length > 20_000 ||
    candidate.reflection.length > 20_000
  ) {
    return { ok: false, error: '紀錄內容格式不正確或過長。' };
  }
  if (!Array.isArray(candidate.tasks) || candidate.tasks.length > 100) {
    return { ok: false, error: '待辦清單格式不正確或項目過多。' };
  }

  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  for (const rawTask of candidate.tasks) {
    if (!rawTask || typeof rawTask !== 'object') {
      return { ok: false, error: '待辦項目格式不正確。' };
    }
    const task = rawTask as Record<string, unknown>;
    const cycleId = task.cycleId === undefined ? null : task.cycleId;
    const phaseId = task.phaseId === undefined ? null : task.phaseId;
    const sectionId = task.sectionId === undefined ? null : task.sectionId;
    const recurrenceId = task.recurrenceId === undefined ? null : task.recurrenceId;
    const habitCue = task.habitCue === undefined ? null : task.habitCue;
    const tinyStart = task.tinyStart === undefined ? null : task.tinyStart;
    const identity = task.identity === undefined ? null : task.identity;
    if (
      typeof task.id !== 'string' ||
      task.id.length < 1 ||
      task.id.length > 100 ||
      seenIds.has(task.id) ||
      typeof task.text !== 'string' ||
      task.text.trim().length < 1 ||
      task.text.length > 500 ||
      typeof task.done !== 'boolean' ||
      (cycleId !== null && (typeof cycleId !== 'string' || cycleId.length < 1 || cycleId.length > 100)) ||
      (phaseId !== null && (typeof phaseId !== 'string' || phaseId.length < 1 || phaseId.length > 100)) ||
      (phaseId !== null && cycleId === null) ||
      (sectionId !== null && (typeof sectionId !== 'string' || sectionId.length < 1 || sectionId.length > 100)) ||
      (recurrenceId !== null && (typeof recurrenceId !== 'string' || recurrenceId.length < 1 || recurrenceId.length > 100)) ||
      (habitCue !== null && (typeof habitCue !== 'string' || habitCue.length > 300)) ||
      (tinyStart !== null && (typeof tinyStart !== 'string' || tinyStart.length > 300)) ||
      (identity !== null && (typeof identity !== 'string' || identity.length > 300))
    ) {
      return { ok: false, error: '待辦項目內容不正確。' };
    }
    seenIds.add(task.id);
    tasks.push({
      id: task.id,
      text: task.text.trim(),
      done: task.done,
      cycleId,
      phaseId,
      sectionId,
      recurrenceId,
      habitCue: typeof habitCue === 'string' && habitCue.trim() ? habitCue.trim() : null,
      tinyStart: typeof tinyStart === 'string' && tinyStart.trim() ? tinyStart.trim() : null,
      identity: typeof identity === 'string' && identity.trim() ? identity.trim() : null,
      streak: 0,
      recoveryDue: false,
    });
  }

  return {
    ok: true,
    date: candidate.date,
    entry: {
      tasks,
      activity: candidate.activity,
      reflection: candidate.reflection,
      revision: candidate.revision,
    },
  };
}

async function loadSeriesStats(db: D1Database, ownerId: string, tasks: TaskRow[]) {
  const recurrenceIds = [...new Set(tasks.flatMap((task) => task.recurrenceId ? [task.recurrenceId] : []))];
  const stats = new Map<string, { streak: number; recoveryDue: boolean }>();
  if (recurrenceIds.length === 0) return stats;

  const placeholders = recurrenceIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(`
      SELECT recurrence_id AS recurrenceId, date, done
      FROM tasks
      WHERE owner_id = ? AND recurrence_id IN (${placeholders})
      ORDER BY recurrence_id, date, position
    `)
    .bind(ownerId, ...recurrenceIds)
    .all<SeriesRow>();
  const grouped = new Map<string, SeriesRow[]>();
  for (const row of rows.results) {
    const series = grouped.get(row.recurrenceId) ?? [];
    series.push(row);
    grouped.set(row.recurrenceId, series);
  }

  for (const task of tasks) {
    if (!task.recurrenceId) continue;
    const series = grouped.get(task.recurrenceId) ?? [];
    const index = series.findIndex((row) => row.date === task.date);
    if (index < 0) continue;
    let streak = 0;
    let cursor = series[index].done ? index : index - 1;
    while (cursor >= 0 && series[cursor].done) {
      streak += 1;
      cursor -= 1;
    }
    stats.set(`${task.recurrenceId}:${task.date}`, {
      streak,
      recoveryDue: !series[index].done && index > 0 && !series[index - 1].done,
    });
  }
  return stats;
}

async function taskReferencesAreValid(db: D1Database, ownerId: string, tasks: Task[]) {
  const [cycleRows, phaseRows, sectionRows] = await Promise.all([
    db.prepare('SELECT id FROM cycles WHERE owner_id = ?').bind(ownerId).all<{ id: string }>(),
    db
      .prepare('SELECT id, cycle_id AS cycleId FROM cycle_phases WHERE owner_id = ?')
      .bind(ownerId)
      .all<{ id: string; cycleId: string }>(),
    db.prepare('SELECT id FROM day_sections WHERE owner_id = ?').bind(ownerId).all<{ id: string }>(),
  ]);
  const cycleIds = new Set(cycleRows.results.map((cycle) => cycle.id));
  const phaseCycles = new Map(phaseRows.results.map((phase) => [phase.id, phase.cycleId]));
  const sectionIds = new Set(sectionRows.results.map((section) => section.id));

  return tasks.every((task) =>
    (task.cycleId === null || cycleIds.has(task.cycleId)) &&
    (task.phaseId === null || phaseCycles.get(task.phaseId) === task.cycleId) &&
    (task.sectionId === null || sectionIds.has(task.sectionId)),
  );
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}

function invalidDate() {
  return Response.json({ error: '日期格式不正確。' }, { status: 400 });
}

function conflict() {
  return Response.json(
    { error: '這一天已在其他裝置更新，請重新讀取後再試。' },
    { status: 409 },
  );
}
