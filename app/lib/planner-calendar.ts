import { ensureSchema } from '../../db/ensure-schema';
import { getDatabaseBinding } from '../../db';
import type { PlanningContext } from './planner-ai';
import type { PlannerProposal, ProposedTask } from './planner-types';

type CycleRow = {
  id: string;
  title: string;
  goal: string;
  reward: string;
  startDate: string;
  endDate: string;
  status: string;
};

type PhaseRow = {
  id: string;
  cycleId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
};

type TaskRow = {
  date: string;
  text: string;
  done: number;
  cycleId: string | null;
  phaseId: string | null;
  sectionId: string | null;
  position: number;
};

type SectionRow = { id: string; title: string };
type ProgressRow = { cycleId: string; completed: number; total: number };

export async function loadPlanningContext(
  ownerId: string,
  startDate: string,
  endDate: string,
): Promise<PlanningContext> {
  await ensureSchema();
  const db = getDatabaseBinding();
  const [cycleRows, phaseRows, progressRows, sectionRows, taskRows] = await Promise.all([
    db
      .prepare(`
        SELECT id, title, goal, reward, start_date AS startDate, end_date AS endDate, status
        FROM cycles WHERE owner_id = ?
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, start_date DESC
        LIMIT 30
      `)
      .bind(ownerId)
      .all<CycleRow>(),
    db
      .prepare(`
        SELECT id, cycle_id AS cycleId, title, description,
          start_date AS startDate, end_date AS endDate
        FROM cycle_phases WHERE owner_id = ?
        ORDER BY cycle_id, position
      `)
      .bind(ownerId)
      .all<PhaseRow>(),
    db
      .prepare(`
        SELECT cycle_id AS cycleId, COUNT(*) AS total, COALESCE(SUM(done), 0) AS completed
        FROM tasks WHERE owner_id = ? AND cycle_id IS NOT NULL GROUP BY cycle_id
      `)
      .bind(ownerId)
      .all<ProgressRow>(),
    db
      .prepare('SELECT id, title FROM day_sections WHERE owner_id = ? ORDER BY position')
      .bind(ownerId)
      .all<SectionRow>(),
    db
      .prepare(`
        SELECT date, text, done, cycle_id AS cycleId, phase_id AS phaseId,
          section_id AS sectionId, position
        FROM tasks
        WHERE owner_id = ? AND date BETWEEN ? AND ?
        ORDER BY date, position
      `)
      .bind(ownerId, startDate, endDate)
      .all<TaskRow>(),
  ]);

  const phasesByCycle = new Map<string, PlanningContext['cycles'][number]['phases']>();
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
  const progressByCycle = new Map(
    progressRows.results.map((progress) => [
      progress.cycleId,
      { completed: progress.completed, total: progress.total },
    ]),
  );
  const tasksByDate = new Map<string, PlanningContext['days'][number]['tasks']>();
  for (const task of taskRows.results) {
    const tasks = tasksByDate.get(task.date) ?? [];
    tasks.push({
      text: task.text,
      done: Boolean(task.done),
      cycleId: task.cycleId,
      phaseId: task.phaseId,
      sectionId: task.sectionId,
    });
    tasksByDate.set(task.date, tasks);
  }

  const days: PlanningContext['days'] = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    days.push({ date, tasks: tasksByDate.get(date) ?? [] });
  }

  return {
    range: { startDate, endDate },
    days,
    cycles: cycleRows.results.map((cycle) => ({
      ...cycle,
      progress: progressByCycle.get(cycle.id) ?? { completed: 0, total: 0 },
      phases: phasesByCycle.get(cycle.id) ?? [],
    })),
    sections: sectionRows.results,
  };
}

export async function applyPlannerProposal(ownerId: string, proposal: PlannerProposal) {
  await ensureSchema();
  const db = getDatabaseBinding();
  const targetDates = [...new Set(proposal.tasks.map((task) => task.date))].sort();
  const startDate = targetDates[0] ?? proposal.cycle?.startDate ?? '';
  const endDate = targetDates.at(-1) ?? startDate;

  const [context, existingTasks] = await Promise.all([
    loadPlanningContext(ownerId, startDate, endDate),
    targetDates.length
      ? db
        .prepare(`
          SELECT date, text, done, cycle_id AS cycleId, phase_id AS phaseId,
            section_id AS sectionId, position
          FROM tasks WHERE owner_id = ? AND date BETWEEN ? AND ?
          ORDER BY date, position
        `)
        .bind(ownerId, startDate, endDate)
        .all<TaskRow>()
      : Promise.resolve({ results: [] as TaskRow[] }),
  ]);

  const sections = new Set(context.sections.map((section) => section.id));
  const cycles = new Map(context.cycles.map((cycle) => [cycle.id, cycle]));
  const existingByDate = new Map<string, TaskRow[]>();
  for (const task of existingTasks.results) {
    if (!targetDates.includes(task.date)) continue;
    const tasks = existingByDate.get(task.date) ?? [];
    tasks.push(task);
    existingByDate.set(task.date, tasks);
  }

  const taskCountByDate = new Map<string, number>();
  for (const task of proposal.tasks) {
    taskCountByDate.set(task.date, (taskCountByDate.get(task.date) ?? 0) + 1);
  }
  for (const [date, count] of taskCountByDate) {
    if (count > 5) throw new PlannerApplyError(`${date} 一次最多新增 5 個任務。`, 400);
    if ((existingByDate.get(date)?.length ?? 0) + count > 100) {
      throw new PlannerApplyError(`${date} 的待辦數量已達上限。`, 400);
    }
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  let cycleId: string | null = null;
  let phaseIds: string[] = [];
  let cycleCreated = false;

  if (proposal.cycle) {
    const reusable = context.cycles.find((cycle) =>
      cycle.title === proposal.cycle?.title &&
      cycle.startDate === proposal.cycle.startDate &&
      cycle.endDate === proposal.cycle.endDate &&
      proposal.cycle.phases.every((phase) => cycle.phases.some((existing) =>
        existing.title === phase.title &&
        existing.startDate === phase.startDate &&
        existing.endDate === phase.endDate,
      )),
    );
    if (reusable) {
      cycleId = reusable.id;
      phaseIds = proposal.cycle.phases.map((phase) =>
        reusable.phases.find((existing) =>
          existing.title === phase.title &&
          existing.startDate === phase.startDate &&
          existing.endDate === phase.endDate
        )?.id ?? '',
      );
    } else {
      cycleCreated = true;
      cycleId = crypto.randomUUID();
      phaseIds = proposal.cycle.phases.map(() => crypto.randomUUID());
      const revision = crypto.randomUUID();
      statements.push(
        db
          .prepare(`
            INSERT INTO cycles
              (id, owner_id, title, goal, reward, start_date, end_date, status,
               revision, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
          `)
          .bind(
            cycleId,
            ownerId,
            proposal.cycle.title,
            proposal.cycle.goal,
            proposal.cycle.reward,
            proposal.cycle.startDate,
            proposal.cycle.endDate,
            revision,
            now,
            now,
          ),
        ...proposal.cycle.phases.map((phase, position) =>
          db
            .prepare(`
              INSERT INTO cycle_phases
                (id, cycle_id, owner_id, title, description, start_date, end_date,
                 position, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
              phaseIds[position],
              cycleId,
              ownerId,
              phase.title,
              phase.description,
              phase.startDate,
              phase.endDate,
              position,
              now,
              now,
            ),
        ),
      );
    }
  }

  const resolvedTasks: Array<ProposedTask & { cycleId: string | null; phaseId: string | null }> = [];
  for (const task of proposal.tasks) {
    if (task.sectionId && !sections.has(task.sectionId)) {
      throw new PlannerApplyError('提案中的每日分段已不存在，請重新產生計畫。', 409);
    }
    let resolvedCycleId: string | null = null;
    let resolvedPhaseId: string | null = null;
    if (task.cycleLink?.source === 'proposed') {
      if (!proposal.cycle || !cycleId) throw invalidLink();
      resolvedCycleId = cycleId;
      resolvedPhaseId = task.cycleLink.phaseIndex === null
        ? null
        : phaseIds[task.cycleLink.phaseIndex] || null;
      if (task.cycleLink.phaseIndex !== null && !resolvedPhaseId) throw invalidLink();
    } else if (task.cycleLink?.source === 'existing') {
      const cycle = cycles.get(task.cycleLink.cycleId);
      if (!cycle || task.date < cycle.startDate || task.date > cycle.endDate) throw invalidLink();
      resolvedCycleId = cycle.id;
      if (task.cycleLink.phaseId) {
        const phase = cycle.phases.find((item) => item.id === task.cycleLink?.phaseId);
        if (!phase || task.date < phase.startDate || task.date > phase.endDate) throw invalidLink();
        resolvedPhaseId = phase.id;
      }
    }
    resolvedTasks.push({ ...task, cycleId: resolvedCycleId, phaseId: resolvedPhaseId });
  }

  const duplicateKeys = new Set<string>();
  for (const task of existingTasks.results) {
    duplicateKeys.add(taskKey(task.date, task.text));
  }
  const tasksToCreate = resolvedTasks.filter((task) => {
    const key = taskKey(task.date, task.text);
    if (duplicateKeys.has(key)) return false;
    duplicateKeys.add(key);
    return true;
  });

  const positions = new Map<string, number>();
  for (const date of targetDates) {
    positions.set(
      date,
      Math.max(-1, ...(existingByDate.get(date) ?? []).map((task) => task.position)) + 1,
    );
  }
  const datesToUpdate = [...new Set(tasksToCreate.map((task) => task.date))];
  for (const date of datesToUpdate) {
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
        .bind(ownerId, date, crypto.randomUUID(), now),
    );
  }
  for (const task of tasksToCreate) {
    const position = positions.get(task.date) ?? 0;
    positions.set(task.date, position + 1);
    statements.push(
      db
        .prepare(`
          INSERT INTO tasks
            (id, owner_id, date, text, done, cycle_id, phase_id, section_id,
             recurrence_id, habit_cue, tiny_start, identity, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          crypto.randomUUID(),
          ownerId,
          task.date,
          task.text,
          task.cycleId,
          task.phaseId,
          task.sectionId,
          task.habitCue,
          task.tinyStart,
          task.identity,
          position,
          now,
          now,
        ),
    );
  }

  if (statements.length) await db.batch(statements);
  return {
    ok: true,
    cycleCreated,
    tasksCreated: tasksToCreate.length,
    tasksSkipped: proposal.tasks.length - tasksToCreate.length,
    firstDate: targetDates[0] ?? proposal.cycle?.startDate ?? null,
  };
}

function taskKey(date: string, text: string) {
  return `${date}:${text.trim().toLocaleLowerCase('zh-TW')}`;
}

function shiftDate(date: string, amount: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function invalidLink() {
  return new PlannerApplyError('提案中的大週期或階段已變更，請重新產生計畫。', 409);
}

export class PlannerApplyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
