import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const ATTEMPT_STATUSES = new Set(['stuck', 'hinted', 'solved', 'reviewed']);

type ProblemRow = {
  id: string;
  title: string;
  url: string;
  difficulty: string;
  plannedDate: string | null;
  createdAt: number;
  updatedAt: number;
};

type AttemptRow = {
  id: string;
  problemId: string;
  taskId: string | null;
  attemptedOn: string;
  status: string;
  notes: string;
  attemptNumber: number;
  createdAt: number;
};

type ScheduleRow = {
  id: string;
  problemId: string;
  date: string;
  done: number;
};

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  await ensureSchema();
  const db = getDatabaseBinding();
  const [problemRows, attemptRows, scheduleRows] = await Promise.all([
    db.prepare(`
      SELECT id, title, url, difficulty, planned_date AS plannedDate,
        created_at AS createdAt, updated_at AS updatedAt
      FROM leetcode_problems
      WHERE owner_id = ?
      ORDER BY CASE WHEN planned_date IS NULL THEN 1 ELSE 0 END, planned_date, created_at
    `).bind(ownerId).all<ProblemRow>(),
    db.prepare(`
      SELECT id, problem_id AS problemId, task_id AS taskId,
        attempted_on AS attemptedOn, status, notes,
        attempt_number AS attemptNumber, created_at AS createdAt
      FROM leetcode_attempts
      WHERE owner_id = ?
      ORDER BY problem_id, attempt_number
    `).bind(ownerId).all<AttemptRow>(),
    db.prepare(`
      SELECT id, leetcode_problem_id AS problemId, date, done
      FROM tasks
      WHERE owner_id = ? AND leetcode_problem_id IS NOT NULL
      ORDER BY date, position
    `).bind(ownerId).all<ScheduleRow>(),
  ]);

  return Response.json({
    problems: problemRows.results.map((problem) => ({
      ...problem,
      attempts: attemptRows.results.filter((attempt) => attempt.problemId === problem.id),
      scheduledTasks: scheduleRows.results
        .filter((task) => task.problemId === problem.id)
        .map((task) => ({ ...task, done: Boolean(task.done) })),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  const body = await readJson(request);
  if (!body.ok) return body.response;
  if (!body.value || typeof body.value !== 'object') return invalid('缺少 LeetCode 紀錄內容。');
  const candidate = body.value as Record<string, unknown>;

  await ensureSchema();
  const db = getDatabaseBinding();
  if (candidate.action === 'schedule') return scheduleProblem(db, ownerId, candidate);
  if (candidate.action === 'attempt') return recordAttempt(db, ownerId, candidate);
  return createProblem(db, ownerId, candidate);
}

async function createProblem(db: D1Database, ownerId: string, candidate: Record<string, unknown>) {
  const parsed = parseProblem(candidate);
  if (!parsed) return invalid('題目名稱、難度、網址或規劃日期格式不正確。');

  const id = crypto.randomUUID();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO leetcode_problems
        (id, owner_id, title, url, difficulty, planned_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, ownerId, parsed.title, parsed.url, parsed.difficulty, parsed.plannedDate, now, now),
  ];
  let taskId: string | null = null;
  if (parsed.plannedDate) {
    taskId = crypto.randomUUID();
    const revision = crypto.randomUUID();
    statements.push(
      upsertDayEntry(db, ownerId, parsed.plannedDate, revision, now),
      insertScheduledTask(db, ownerId, taskId, id, parsed.plannedDate, parsed.title, now),
    );
  }
  await db.batch(statements);
  return Response.json({ ok: true, id, taskId }, { status: 201 });
}

async function scheduleProblem(db: D1Database, ownerId: string, candidate: Record<string, unknown>) {
  const problemId = optionalId(candidate.problemId);
  const date = typeof candidate.date === 'string' && isValidDate(candidate.date) ? candidate.date : null;
  if (!problemId || !date) return invalid('題目或排程日期格式不正確。');

  const problem = await db.prepare(
    'SELECT title FROM leetcode_problems WHERE owner_id = ? AND id = ?',
  ).bind(ownerId, problemId).first<{ title: string }>();
  if (!problem) return Response.json({ error: '找不到這道題目。' }, { status: 404 });

  const existing = await db.prepare(`
    SELECT id FROM tasks
    WHERE owner_id = ? AND leetcode_problem_id = ? AND date = ?
  `).bind(ownerId, problemId, date).first<{ id: string }>();
  if (existing) return Response.json({ ok: true, taskId: existing.id, created: false });

  const now = Date.now();
  const taskId = crypto.randomUUID();
  const revision = crypto.randomUUID();
  await db.batch([
    upsertDayEntry(db, ownerId, date, revision, now),
    insertScheduledTask(db, ownerId, taskId, problemId, date, problem.title, now),
    db.prepare(`
      UPDATE leetcode_problems SET planned_date = ?, updated_at = ?
      WHERE owner_id = ? AND id = ?
    `).bind(date, now, ownerId, problemId),
  ]);
  return Response.json({ ok: true, taskId, created: true }, { status: 201 });
}

async function recordAttempt(db: D1Database, ownerId: string, candidate: Record<string, unknown>) {
  const problemId = optionalId(candidate.problemId);
  const taskId = candidate.taskId === null || candidate.taskId === undefined
    ? null
    : optionalId(candidate.taskId);
  const attemptedOn = typeof candidate.attemptedOn === 'string' && isValidDate(candidate.attemptedOn)
    ? candidate.attemptedOn
    : null;
  const status = typeof candidate.status === 'string' && ATTEMPT_STATUSES.has(candidate.status)
    ? candidate.status
    : null;
  const notes = typeof candidate.notes === 'string' ? candidate.notes.trim() : '';
  if (!problemId || taskId === undefined || !attemptedOn || !status || !notes || notes.length > 10_000) {
    return invalid('請選擇作答狀況，並留下一點筆記。');
  }

  const problem = await db.prepare(
    'SELECT id FROM leetcode_problems WHERE owner_id = ? AND id = ?',
  ).bind(ownerId, problemId).first();
  if (!problem) return Response.json({ error: '找不到這道題目。' }, { status: 404 });

  if (taskId) {
    const task = await db.prepare(`
      SELECT id FROM tasks
      WHERE owner_id = ? AND id = ? AND leetcode_problem_id = ? AND date = ?
    `).bind(ownerId, taskId, problemId, attemptedOn).first();
    if (!task) return invalid('這筆每日任務與題目或日期不相符。');
    const existingAttempt = await db.prepare(
      'SELECT id FROM leetcode_attempts WHERE owner_id = ? AND task_id = ?',
    ).bind(ownerId, taskId).first();
    if (existingAttempt) return Response.json({ error: '這筆每日任務已經有作答紀錄。' }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO leetcode_attempts
        (id, owner_id, problem_id, task_id, attempted_on, status, notes,
         attempt_number, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?,
        (SELECT COALESCE(MAX(attempt_number), 0) + 1
         FROM leetcode_attempts WHERE owner_id = ? AND problem_id = ?),
        ?, ?)
    `).bind(id, ownerId, problemId, taskId, attemptedOn, status, notes, ownerId, problemId, now, now),
  ];
  let revision: string | null = null;
  if (taskId) {
    revision = crypto.randomUUID();
    statements.push(
      db.prepare(`
        UPDATE tasks SET done = 1, updated_at = ?
        WHERE owner_id = ? AND id = ?
      `).bind(now, ownerId, taskId),
      db.prepare(`
        UPDATE day_entries SET revision = ?, updated_at = ?
        WHERE owner_id = ? AND date = ?
      `).bind(revision, now, ownerId, attemptedOn),
    );
  }
  await db.batch(statements);
  return Response.json({ ok: true, id, revision }, { status: 201 });
}

function upsertDayEntry(db: D1Database, ownerId: string, date: string, revision: string, now: number) {
  return db.prepare(`
    INSERT INTO day_entries (owner_id, date, activity, reflection, revision, updated_at)
    VALUES (?, ?, '', '', ?, ?)
    ON CONFLICT(owner_id, date) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at
  `).bind(ownerId, date, revision, now);
}

function insertScheduledTask(
  db: D1Database,
  ownerId: string,
  taskId: string,
  problemId: string,
  date: string,
  title: string,
  now: number,
) {
  return db.prepare(`
    INSERT INTO tasks
      (id, owner_id, date, text, done, cycle_id, phase_id, section_id,
       recurrence_id, deadline, habit_cue, tiny_start, identity, leetcode_problem_id,
       position, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?,
      (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE owner_id = ? AND date = ?),
      ?, ?)
  `).bind(taskId, ownerId, date, `LeetCode · ${title}`, problemId, ownerId, date, now, now);
}

function parseProblem(candidate: Record<string, unknown>) {
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  const difficulty = typeof candidate.difficulty === 'string' && DIFFICULTIES.has(candidate.difficulty)
    ? candidate.difficulty
    : null;
  const plannedDate = candidate.plannedDate === '' || candidate.plannedDate === null || candidate.plannedDate === undefined
    ? null
    : typeof candidate.plannedDate === 'string' && isValidDate(candidate.plannedDate)
      ? candidate.plannedDate
      : undefined;
  let url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  if (url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
      url = parsedUrl.toString();
    } catch {
      return null;
    }
  }
  if (!title || title.length > 200 || !difficulty || plannedDate === undefined || url.length > 500) return null;
  return { title, difficulty, plannedDate, url };
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !value || value.length > 100) return undefined;
  return value;
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

async function readJson(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: Response }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: invalid('JSON 格式不正確。') };
  }
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}

function invalid(message: string) {
  return Response.json({ error: message }, { status: 400 });
}
