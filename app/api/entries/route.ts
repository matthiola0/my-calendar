import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';

export const dynamic = 'force-dynamic';

const OWNER_ID = 'owner';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Task = {
  id: string;
  text: string;
  done: boolean;
};

type DayEntry = {
  tasks: Task[];
  activity: string;
  reflection: string;
};

type TaskRow = {
  id: string;
  text: string;
  done: number;
};

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) return unauthorized();

  const date = new URL(request.url).searchParams.get('date');
  if (!date || !isValidDate(date)) return invalidDate();

  await ensureSchema();
  const db = getDatabaseBinding();
  const day = await db
    .prepare(
      'SELECT activity, reflection FROM day_entries WHERE owner_id = ? AND date = ?',
    )
    .bind(OWNER_ID, date)
    .first<{ activity: string; reflection: string }>();
  const taskRows = await db
    .prepare(
      'SELECT id, text, done FROM tasks WHERE owner_id = ? AND date = ? ORDER BY position ASC',
    )
    .bind(OWNER_ID, date)
    .all<TaskRow>();

  return Response.json(
    {
      tasks: taskRows.results.map((task) => ({
        id: task.id,
        text: task.text,
        done: Boolean(task.done),
      })),
      activity: day?.activity ?? '',
      reflection: day?.reflection ?? '',
    } satisfies DayEntry,
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  if (!(await isAuthorized(request))) return unauthorized();

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
  const now = Date.now();
  const statements = [
    db
      .prepare(`
        INSERT INTO day_entries (owner_id, date, activity, reflection, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, date) DO UPDATE SET
          activity = excluded.activity,
          reflection = excluded.reflection,
          updated_at = excluded.updated_at
      `)
      .bind(OWNER_ID, date, entry.activity, entry.reflection, now),
    db.prepare('DELETE FROM tasks WHERE owner_id = ? AND date = ?').bind(OWNER_ID, date),
    ...entry.tasks.map((task, position) =>
      db
        .prepare(`
          INSERT INTO tasks (id, owner_id, date, text, done, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(task.id, OWNER_ID, date, task.text, task.done ? 1 : 0, position, now, now),
    ),
  ];

  await db.batch(statements);
  return Response.json({ ok: true, updatedAt: now });
}

async function isAuthorized(request: Request) {
  const authorization = request.headers.get('authorization');
  const suppliedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (
    suppliedToken &&
    env.AGENT_API_TOKEN &&
    constantTimeEqual(suppliedToken, env.AGENT_API_TOKEN)
  ) {
    return true;
  }

  return Boolean(await getChatGPTUser());
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
    if (
      typeof task.id !== 'string' ||
      task.id.length < 1 ||
      task.id.length > 100 ||
      seenIds.has(task.id) ||
      typeof task.text !== 'string' ||
      task.text.trim().length < 1 ||
      task.text.length > 500 ||
      typeof task.done !== 'boolean'
    ) {
      return { ok: false, error: '待辦項目內容不正確。' };
    }
    seenIds.add(task.id);
    tasks.push({ id: task.id, text: task.text.trim(), done: task.done });
  }

  return {
    ok: true,
    date: candidate.date,
    entry: {
      tasks,
      activity: candidate.activity,
      reflection: candidate.reflection,
    },
  };
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

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}

function invalidDate() {
  return Response.json({ error: '日期格式不正確。' }, { status: 400 });
}
