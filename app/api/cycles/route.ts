import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CyclePhase = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
};

type MacroCycle = {
  id: string;
  title: string;
  goal: string;
  reward: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed';
  revision: string | null;
  phases: CyclePhase[];
};

type CycleProgress = {
  completed: number;
  total: number;
  percentage: number;
};

type CycleRow = Omit<MacroCycle, 'phases' | 'revision'> & { revision: string };
type PhaseRow = CyclePhase & { cycleId: string };
type ProgressRow = { cycleId: string; completed: number; total: number };

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  await ensureSchema();
  const db = getDatabaseBinding();
  const [cycleRows, phaseRows, progressRows] = await Promise.all([
    db
      .prepare(`
        SELECT id, title, goal, reward, start_date AS startDate, end_date AS endDate,
          status, revision
        FROM cycles
        WHERE owner_id = ?
        ORDER BY start_date DESC, created_at DESC
      `)
      .bind(ownerId)
      .all<CycleRow>(),
    db
      .prepare(`
        SELECT id, cycle_id AS cycleId, title, description,
          start_date AS startDate, end_date AS endDate
        FROM cycle_phases
        WHERE owner_id = ?
        ORDER BY cycle_id, position ASC
      `)
      .bind(ownerId)
      .all<PhaseRow>(),
    db
      .prepare(`
        SELECT cycle_id AS cycleId, COUNT(*) AS total,
          COALESCE(SUM(done), 0) AS completed
        FROM tasks
        WHERE owner_id = ? AND cycle_id IS NOT NULL
        GROUP BY cycle_id
      `)
      .bind(ownerId)
      .all<ProgressRow>(),
  ]);

  const phasesByCycle = new Map<string, CyclePhase[]>();
  for (const phase of phaseRows.results) {
    const phases = phasesByCycle.get(phase.cycleId) ?? [];
    phases.push({
      id: phase.id,
      title: phase.title,
      description: phase.description,
      startDate: phase.startDate,
      endDate: phase.endDate,
    });
    phasesByCycle.set(phase.cycleId, phases);
  }

  const progressByCycle = new Map<string, CycleProgress>();
  for (const progress of progressRows.results) {
    progressByCycle.set(progress.cycleId, {
      completed: progress.completed,
      total: progress.total,
      percentage: progress.total
        ? Math.round((progress.completed / progress.total) * 100)
        : 0,
    });
  }

  return Response.json(
    {
      cycles: cycleRows.results.map((cycle) => ({
        ...cycle,
        phases: phasesByCycle.get(cycle.id) ?? [],
        progress: progressByCycle.get(cycle.id) ?? {
          completed: 0,
          total: 0,
          percentage: 0,
        },
      })),
    },
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

  const parsed = parseCycle(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  await ensureSchema();
  const cycle = parsed.cycle;
  const db = getDatabaseBinding();
  const now = Date.now();
  const nextRevision = crypto.randomUUID();
  const cycleMutation = cycle.revision === null
    ? db
      .prepare(`
        INSERT INTO cycles
          (id, owner_id, title, goal, reward, start_date, end_date, status, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, id) DO NOTHING
      `)
      .bind(
        cycle.id,
        ownerId,
        cycle.title,
        cycle.goal,
        cycle.reward,
        cycle.startDate,
        cycle.endDate,
        cycle.status,
        nextRevision,
        now,
        now,
      )
    : db
      .prepare(`
        UPDATE cycles SET
          title = ?, goal = ?, reward = ?, start_date = ?, end_date = ?, status = ?,
          revision = ?, updated_at = ?
        WHERE owner_id = ? AND id = ? AND revision = ?
      `)
      .bind(
        cycle.title,
        cycle.goal,
        cycle.reward,
        cycle.startDate,
        cycle.endDate,
        cycle.status,
        nextRevision,
        now,
        ownerId,
        cycle.id,
        cycle.revision,
      );

  const statements = [
    cycleMutation,
    db
      .prepare(`
        DELETE FROM cycle_phases
        WHERE owner_id = ? AND cycle_id = ?
          AND EXISTS (
            SELECT 1 FROM cycles
            WHERE owner_id = ? AND id = ? AND revision = ?
          )
      `)
      .bind(ownerId, cycle.id, ownerId, cycle.id, nextRevision),
    ...cycle.phases.map((phase, position) =>
      db
        .prepare(`
          INSERT INTO cycle_phases
            (id, cycle_id, owner_id, title, description, start_date, end_date,
             position, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM cycles
            WHERE owner_id = ? AND id = ? AND revision = ?
          )
        `)
        .bind(
          phase.id,
          cycle.id,
          ownerId,
          phase.title,
          phase.description,
          phase.startDate,
          phase.endDate,
          position,
          now,
          now,
          ownerId,
          cycle.id,
          nextRevision,
        ),
    ),
    db
      .prepare(`
        UPDATE tasks SET phase_id = NULL, updated_at = ?
        WHERE owner_id = ? AND cycle_id = ? AND phase_id IS NOT NULL
          AND phase_id NOT IN (
            SELECT id FROM cycle_phases WHERE owner_id = ? AND cycle_id = ?
          )
          AND EXISTS (
            SELECT 1 FROM cycles
            WHERE owner_id = ? AND id = ? AND revision = ?
          )
      `)
      .bind(
        now,
        ownerId,
        cycle.id,
        ownerId,
        cycle.id,
        ownerId,
        cycle.id,
        nextRevision,
      ),
  ];

  const results = await db.batch(statements);
  if (!results[0].meta.changes) {
    return Response.json(
      { error: '這個大週期已在其他裝置更新，請重新讀取後再試。' },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, revision: nextRevision, updatedAt: now });
}

function parseCycle(body: unknown):
  | { ok: true; cycle: MacroCycle }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '缺少大週期內容。' };
  }

  const candidate = body as Record<string, unknown>;
  const reward = candidate.reward === undefined ? '' : candidate.reward;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length < 1 ||
    candidate.id.length > 100 ||
    typeof candidate.title !== 'string' ||
    candidate.title.trim().length < 1 ||
    candidate.title.length > 200 ||
    typeof candidate.goal !== 'string' ||
    candidate.goal.trim().length < 1 ||
    candidate.goal.length > 5_000 ||
    typeof reward !== 'string' ||
    reward.length > 1_000 ||
    typeof candidate.startDate !== 'string' ||
    typeof candidate.endDate !== 'string' ||
    !isValidDate(candidate.startDate) ||
    !isValidDate(candidate.endDate) ||
    candidate.startDate > candidate.endDate ||
    (candidate.status !== 'active' && candidate.status !== 'completed') ||
    (candidate.revision !== null && typeof candidate.revision !== 'string') ||
    (typeof candidate.revision === 'string' && candidate.revision.length > 100) ||
    !Array.isArray(candidate.phases) ||
    candidate.phases.length > 20
  ) {
    return { ok: false, error: '大週期內容格式不正確或過長。' };
  }

  const phases: CyclePhase[] = [];
  const phaseIds = new Set<string>();
  for (const rawPhase of candidate.phases) {
    if (!rawPhase || typeof rawPhase !== 'object') {
      return { ok: false, error: '階段內容格式不正確。' };
    }
    const phase = rawPhase as Record<string, unknown>;
    if (
      typeof phase.id !== 'string' ||
      phase.id.length < 1 ||
      phase.id.length > 100 ||
      phaseIds.has(phase.id) ||
      typeof phase.title !== 'string' ||
      phase.title.trim().length < 1 ||
      phase.title.length > 200 ||
      typeof phase.description !== 'string' ||
      phase.description.length > 2_000 ||
      typeof phase.startDate !== 'string' ||
      typeof phase.endDate !== 'string' ||
      !isValidDate(phase.startDate) ||
      !isValidDate(phase.endDate) ||
      phase.startDate > phase.endDate ||
      phase.startDate < candidate.startDate ||
      phase.endDate > candidate.endDate
    ) {
      return { ok: false, error: '階段內容格式不正確或超出大週期日期。' };
    }
    phaseIds.add(phase.id);
    phases.push({
      id: phase.id,
      title: phase.title.trim(),
      description: phase.description.trim(),
      startDate: phase.startDate,
      endDate: phase.endDate,
    });
  }

  return {
    ok: true,
    cycle: {
      id: candidate.id,
      title: candidate.title.trim(),
      goal: candidate.goal.trim(),
      reward: reward.trim(),
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      status: candidate.status,
      revision: candidate.revision,
      phases,
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

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}
