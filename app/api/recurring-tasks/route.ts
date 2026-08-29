import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OCCURRENCES = 365;

type RepeatRule =
  | null
  | { unit: 'day' | 'week' | 'month'; interval: number; endMode: 'count'; count: number }
  | { unit: 'day' | 'week' | 'month'; interval: number; endMode: 'date'; until: string };

type TaskRequest = {
  startDate: string;
  text: string;
  cycleId: string | null;
  phaseId: string | null;
  sectionId: string | null;
  habitCue: string | null;
  tinyStart: string | null;
  recurrence: RepeatRule;
};

export async function POST(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return Response.json({ error: '重複任務設定不正確。' }, { status: 400 });
  }
  const dates = buildOccurrenceDates(parsed.startDate, parsed.recurrence);
  if (!dates) {
    return Response.json({ error: `一次最多建立 ${MAX_OCCURRENCES} 個任務。` }, { status: 400 });
  }

  await ensureSchema();
  const db = getDatabaseBinding();
  if (!(await referencesAreValid(db, ownerId, parsed))) {
    return Response.json({ error: '綁定的大週期、階段或每日分段不存在。' }, { status: 400 });
  }

  const now = Date.now();
  const recurrenceId = parsed.recurrence ? crypto.randomUUID() : null;
  const statements: D1PreparedStatement[] = [];
  for (const date of dates) {
    const revision = crypto.randomUUID();
    statements.push(
      db
        .prepare(`
          INSERT INTO day_entries
            (owner_id, date, activity, reflection, revision, updated_at)
          VALUES (?, ?, '', '', ?, ?)
          ON CONFLICT(owner_id, date) DO UPDATE SET
            revision = excluded.revision,
            updated_at = excluded.updated_at
        `)
        .bind(ownerId, date, revision, now),
      db
        .prepare(`
          INSERT INTO tasks
            (id, owner_id, date, text, done, cycle_id, phase_id, section_id,
             recurrence_id, habit_cue, tiny_start, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?,
            (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE owner_id = ? AND date = ?),
            ?, ?)
        `)
        .bind(
          crypto.randomUUID(),
          ownerId,
          date,
          parsed.text,
          parsed.cycleId,
          parsed.phaseId,
          parsed.sectionId,
          recurrenceId,
          parsed.habitCue,
          parsed.tinyStart,
          ownerId,
          date,
          now,
          now,
        ),
    );
  }

  for (let index = 0; index < statements.length; index += 60) {
    await db.batch(statements.slice(index, index + 60));
  }

  return Response.json({ ok: true, count: dates.length, recurrenceId });
}

function parseRequest(body: unknown): TaskRequest | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  const cycleId = optionalId(candidate.cycleId);
  const phaseId = optionalId(candidate.phaseId);
  const sectionId = optionalId(candidate.sectionId);
  const habitCue = optionalText(candidate.habitCue, 300);
  const tinyStart = optionalText(candidate.tinyStart, 300);
  if (
    typeof candidate.startDate !== 'string' ||
    !isValidDate(candidate.startDate) ||
    typeof candidate.text !== 'string' ||
    !candidate.text.trim() ||
    candidate.text.length > 500 ||
    cycleId === undefined ||
    phaseId === undefined ||
    sectionId === undefined ||
    habitCue === undefined ||
    tinyStart === undefined ||
    (phaseId !== null && cycleId === null)
  ) return null;

  const recurrence = parseRecurrence(candidate.recurrence, candidate.startDate);
  if (recurrence === undefined) return null;
  return {
    startDate: candidate.startDate,
    text: candidate.text.trim(),
    cycleId,
    phaseId,
    sectionId,
    habitCue,
    tinyStart,
    recurrence,
  };
}

function parseRecurrence(value: unknown, startDate: string): RepeatRule | undefined {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object') return undefined;
  const rule = value as Record<string, unknown>;
  if (
    (rule.unit !== 'day' && rule.unit !== 'week' && rule.unit !== 'month') ||
    typeof rule.interval !== 'number' ||
    !Number.isInteger(rule.interval) ||
    rule.interval < 1 ||
    rule.interval > 365
  ) return undefined;
  if (
    rule.endMode === 'count' &&
    typeof rule.count === 'number' &&
    Number.isInteger(rule.count) &&
    rule.count >= 2 &&
    rule.count <= MAX_OCCURRENCES
  ) {
    return { unit: rule.unit, interval: rule.interval, endMode: 'count', count: rule.count };
  }
  if (
    rule.endMode === 'date' &&
    typeof rule.until === 'string' &&
    isValidDate(rule.until) &&
    rule.until > startDate
  ) {
    return { unit: rule.unit, interval: rule.interval, endMode: 'date', until: rule.until };
  }
  return undefined;
}

function buildOccurrenceDates(startDate: string, recurrence: RepeatRule) {
  if (!recurrence) return [startDate];
  const dates: string[] = [];
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    if (recurrence.endMode === 'count' && index >= recurrence.count) break;
    const date = repeatDate(startDate, recurrence.unit, recurrence.interval * index);
    if (recurrence.endMode === 'date' && date > recurrence.until) break;
    dates.push(date);
  }
  if (recurrence.endMode === 'date') {
    const next = repeatDate(startDate, recurrence.unit, recurrence.interval * dates.length);
    if (next <= recurrence.until) return null;
  }
  return dates;
}

function repeatDate(startDate: string, unit: 'day' | 'week' | 'month', amount: number) {
  const [year, month, day] = startDate.split('-').map(Number);
  if (unit === 'month') {
    const rawMonth = month - 1 + amount;
    const targetYear = year + Math.floor(rawMonth / 12);
    const targetMonth = ((rawMonth % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return formatDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount * (unit === 'week' ? 7 : 1));
  return formatDate(date);
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function referencesAreValid(db: D1Database, ownerId: string, task: TaskRequest) {
  const [cycle, phase, section] = await Promise.all([
    task.cycleId
      ? db.prepare('SELECT id FROM cycles WHERE owner_id = ? AND id = ?').bind(ownerId, task.cycleId).first()
      : null,
    task.phaseId
      ? db.prepare('SELECT cycle_id AS cycleId FROM cycle_phases WHERE owner_id = ? AND id = ?').bind(ownerId, task.phaseId).first<{ cycleId: string }>()
      : null,
    task.sectionId
      ? db.prepare('SELECT id FROM day_sections WHERE owner_id = ? AND id = ?').bind(ownerId, task.sectionId).first()
      : null,
  ]);
  return (
    (!task.cycleId || Boolean(cycle)) &&
    (!task.phaseId || phase?.cycleId === task.cycleId) &&
    (!task.sectionId || Boolean(section))
  );
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 100) return undefined;
  return value;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  return value.trim() || null;
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}
