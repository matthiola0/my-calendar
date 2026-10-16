import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export class CalendarAgentError extends Error {}

export const workflowCommands = new Set(['today', 'agenda', 'summary', 'plan', 'review', 'record', 'done', 'rename', 'detach', 'reschedule']);

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) >= 100 && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function requireDate(value) {
  if (!validDate(value)) throw new CalendarAgentError('Use a real date in YYYY-MM-DD format.');
  return value;
}

export function addDays(date, amount) {
  const result = new Date(`${requireDate(date)}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  const value = result.toISOString().slice(0, 10);
  return requireDate(value);
}

export function localDate(timezone, now = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  } catch {
    throw new CalendarAgentError('CALENDAR_TIMEZONE must be a valid IANA timezone, for example Asia/Taipei.');
  }
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dateRange(start, end) {
  requireDate(start);
  requireDate(end);
  const length = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  if (length < 1 || length > 31) throw new CalendarAgentError('The date range must be ordered and contain at most 31 days.');
  return Array.from({ length }, (_, index) => addDays(start, index));
}

export function periodRange(period, date) {
  requireDate(date);
  if (period === 'day') return [date, date];
  if (period === 'week') {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const start = addDays(date, -((day + 6) % 7));
    return [start, addDays(start, 6)];
  }
  if (period === 'month') {
    const start = `${date.slice(0, 7)}-01`;
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    return [start, requireDate(end.toISOString().slice(0, 10))];
  }
  throw new CalendarAgentError('Usage: summary day|week|month [YYYY-MM-DD]');
}

export function taskCounts(tasks) {
  const completed = tasks.filter((task) => task.done).length;
  return { total: tasks.length, completed, pending: tasks.length - completed, completionRate: tasks.length ? completed / tasks.length : null };
}

function dayContext(date, entry) {
  const routines = entry.tasks.filter((task) => task.recurrenceId && !task.deadline);
  return { date, ...entry, routines, counts: taskCounts(entry.tasks), routineCounts: taskCounts(routines) };
}

export function normalizeTaskText(text) {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function newTask(text) {
  return { id: randomUUID(), text, done: false, cycleId: null, phaseId: null, sectionId: null, recurrenceId: null, deadline: null, habitCue: null, tinyStart: null, identity: null, leetcodeProblemId: null };
}

function taskContent(task) {
  const value = { ...task };
  // These are computed on reads and can change when an occurrence is detached or moved.
  delete value.streak;
  delete value.recoveryDue;
  return value;
}

function sameTask(left, right) {
  return Boolean(left && right) && isDeepStrictEqual(taskContent(left), taskContent(right));
}

function sameEntry(left, right) {
  return left.activity === right.activity && left.reflection === right.reflection &&
    isDeepStrictEqual(left.tasks.map(taskContent), right.tasks.map(taskContent));
}

// These commands return data for the agent to reason about. Planning reads context;
// recording a proposed plan still uses the explicit write commands.
export async function runWorkflow(command, args, api) {
  const { timezone, getEntry, saveEntry, getCycles, getSections } = api;
  const today = localDate(timezone);
  const output = (value) => console.log(JSON.stringify({ command, timezone, asOfDate: today, ...value }, null, 2));
  if (command === 'today') {
    const date = args[0] ?? today;
    output(dayContext(date, await getEntry(date)));
    return;
  }
  if (command === 'agenda' || command === 'plan' || command === 'summary') {
    const [startDate, endDate] = command === 'summary'
      ? periodRange(args[0], args[1] ?? today)
      : [args[0] ?? today, args[1] ?? addDays(args[0] ?? today, 6)];
    const dates = dateRange(startDate, endDate);
    const days = [];
    // Bounded sequential reads avoid sending 31 simultaneous requests to the API.
    for (const date of dates) days.push(dayContext(date, await getEntry(date)));
    const allTasks = days.flatMap((day) => day.tasks);
    const result = { startDate, endDate, days, counts: taskCounts(allTasks), routineCounts: taskCounts(days.flatMap((day) => day.routines)) };
    if (command === 'summary') {
      result.period = args[0];
      const elapsedDays = days.filter((day) => day.date <= today);
      result.elapsedCounts = elapsedDays.length ? taskCounts(elapsedDays.flatMap((day) => day.tasks)) : null;
      result.elapsedRoutineCounts = elapsedDays.length ? taskCounts(elapsedDays.flatMap((day) => day.routines)) : null;
    }
    if (command === 'plan') {
      result.sections = await getSections();
      result.cycles = (await getCycles()).filter((cycle) => cycle.status === 'active' && cycle.startDate <= endDate && cycle.endDate >= startDate);
      result.loadBasis = 'task-count-only';
      result.load = days.map((day) => ({ date: day.date, tasks: day.counts.total, pending: day.counts.pending, routines: day.routineCounts.total, otherTasks: day.counts.total - day.routineCounts.total }));
    }
    output(result);
    return;
  }
  const date = args[0] ?? today;
  const entry = await getEntry(date);
  if (command === 'rename' || command === 'detach' || command === 'reschedule') {
    const task = entry.tasks.find((item) => item.id === args[1]);
    if (!task) throw new CalendarAgentError('Task not found. Read the day again and use its task ID.');
    if (command === 'reschedule') {
      if (task.deadline || task.leetcodeProblemId) {
        throw new CalendarAgentError('Reschedule does not support deadline or LeetCode-linked tasks.');
      }
      const targetDate = args[2];
      const targetEntry = await getEntry(targetDate);
      if (targetEntry.tasks.length >= 100) throw new CalendarAgentError('The target date already has 100 tasks.');
      if (task.recurrenceId && targetEntry.tasks.some((item) => item.recurrenceId === task.recurrenceId)) {
        throw new CalendarAgentError('The target date already has an occurrence of this recurring series. Detach the source task first if you intend to move a standalone occurrence.');
      }
      const copy = { ...task, id: randomUUID(), text: args[3]?.trim() ?? task.text };
      targetEntry.tasks.push(copy);
      let targetSaved = false;
      let sourceWriteAttempted = false;
      try {
        // Save and verify a separate copy before removing anything from the source date.
        await saveEntry(targetDate, targetEntry);
        targetSaved = true;
        const verifiedTarget = await getEntry(targetDate);
        if (!sameEntry(targetEntry, verifiedTarget)) throw new CalendarAgentError('The target date changed during verification.');
        const sourceEntry = await getEntry(date);
        const sourceIndex = sourceEntry.tasks.findIndex((item) => item.id === task.id);
        if (!sameTask(sourceEntry.tasks[sourceIndex], task)) {
          throw new CalendarAgentError('The source task changed after the target copy was saved.');
        }
        if (!sameEntry(targetEntry, await getEntry(targetDate))) {
          throw new CalendarAgentError('The target date changed before source removal.');
        }
        sourceEntry.tasks.splice(sourceIndex, 1);
        sourceWriteAttempted = true;
        await saveEntry(date, sourceEntry);
        const finalSource = await getEntry(date);
        const finalTarget = await getEntry(targetDate);
        if (!sameEntry(sourceEntry, finalSource) || !sameEntry(targetEntry, finalTarget)) {
          throw new CalendarAgentError('The rescheduled dates changed during final verification.');
        }
        output({ sourceDate: date, targetDate, moved: true, sourceTaskId: task.id, task: finalTarget.tasks.find((item) => item.id === copy.id) });
      } catch (error) {
        const detail = error instanceof CalendarAgentError ? error.message : 'Reschedule could not be completed.';
        const targetState = targetSaved ? 'was saved' : 'may have been saved';
        const sourceState = sourceWriteAttempted ? 'Source removal is unverified.' : 'This command did not delete the source task.';
        throw new CalendarAgentError(`${detail} A target copy ${targetState} on ${targetDate} with task ID ${copy.id}. ${sourceState} Do not retry reschedule blindly; read both dates and reconcile the copies first.`);
      }
      return;
    }
    if (command === 'detach' && task.deadline) {
      throw new CalendarAgentError('Detach does not support deadline tasks.');
    }
    const changed = command === 'rename' ? task.text !== args[2].trim() : task.recurrenceId !== null;
    if (changed) {
      if (command === 'rename') task.text = args[2].trim();
      else task.recurrenceId = null;
      await saveEntry(date, entry);
      const verified = await getEntry(date);
      if (!sameEntry(entry, verified)) throw new CalendarAgentError('The date changed during verification. Read the day again before retrying.');
      output({ date, changed, task: verified.tasks.find((item) => item.id === task.id) });
    } else output({ date, changed, task });
    return;
  }
  if (command === 'review') {
    const reflection = args[1]?.trim();
    if (reflection) {
      entry.reflection = entry.reflection ? `${entry.reflection}\n\n${reflection}` : reflection;
      if (entry.reflection.length > 20_000) throw new CalendarAgentError('The appended reflection exceeds 20,000 characters.');
      await saveEntry(date, entry);
      const verified = await getEntry(date);
      if (verified.reflection !== entry.reflection) throw new CalendarAgentError('The reflection changed during verification. Read the day again before retrying.');
      output({ appended: true, ...dayContext(date, verified) });
    } else output({ appended: false, ...dayContext(date, entry) });
    return;
  }
  if (command === 'record') {
    const text = normalizeTaskText(args[1]);
    const existing = entry.tasks.find((task) => normalizeTaskText(task.text) === text);
    if (existing) {
      output({ date, created: false, task: existing });
      return;
    }
    const task = newTask(text);
    if (entry.tasks.length >= 100) throw new CalendarAgentError('This date already has 100 tasks.');
    entry.tasks.push(task);
    await saveEntry(date, entry);
    const verified = await getEntry(date);
    const saved = verified.tasks.find((item) => item.id === task.id && item.text === text);
    if (!saved) throw new CalendarAgentError('The recorded task could not be verified. Read the day again before retrying.');
    output({ date, created: true, task: saved });
    return;
  }
  if (command === 'done') {
    const task = entry.tasks.find((item) => item.id === args[1]);
    if (!task) throw new CalendarAgentError('Task not found. Read the day again and use its task ID.');
    const done = args[2] !== 'false';
    const changed = task.done !== done;
    if (changed) {
      task.done = done;
      await saveEntry(date, entry);
      const verified = await getEntry(date);
      const saved = verified.tasks.find((item) => item.id === task.id);
      if (!saved || saved.done !== done) throw new CalendarAgentError('The completion state changed during verification. Read the day again before retrying.');
      output({ date, changed, task: saved, counts: taskCounts(verified.tasks) });
    } else output({ date, changed, task, counts: taskCounts(entry.tasks) });
  }
}

// Validate every supplied argument before any read or write request.
export function validateCommand(command, args, timezone) {
  localDate(timezone);
  const usage = (syntax) => { throw new CalendarAgentError(`Usage: npm run calendar -- ${syntax}`); };
  const count = (min, max, syntax) => { if (args.length < min || args.length > max) usage(syntax); };
  const dateAt = (index) => requireDate(args[index]);
  const textAt = (index, max = 500) => { if (typeof args[index] !== 'string' || !args[index].trim() || args[index].length > max) throw new CalendarAgentError(`Text is required and must be at most ${max} characters.`); };
  const idAt = (index) => textAt(index, 100);
  const rangeAt = (start, end, bounded = false) => {
    dateAt(start); dateAt(end);
    if (args[start] > args[end]) throw new CalendarAgentError('The end date must be on or after the start date.');
    if (bounded) dateRange(args[start], args[end]);
  };
  switch (command) {
    case 'today': case 'review':
      count(0, command === 'review' ? 2 : 1, `${command} [YYYY-MM-DD]${command === 'review' ? ' ["reflection"]' : ''}`);
      if (args[0] !== undefined) dateAt(0);
      if (args[1] !== undefined) textAt(1, 20_000);
      break;
    case 'agenda': case 'plan':
      count(0, 2, `${command} [START_DATE] [END_DATE]`);
      dateRange(args[0] ?? localDate(timezone), args[1] ?? addDays(args[0] ?? localDate(timezone), 6));
      break;
    case 'summary':
      count(1, 2, 'summary day|week|month [YYYY-MM-DD]');
      periodRange(args[0], args[1] ?? localDate(timezone));
      break;
    case 'leetcode-policy':
      if (args.length !== 0 && (args.length !== 2 || args[0] !== 'set')) usage('leetcode-policy [set FILE.json]');
      if (args.length) textAt(1, 4096);
      break;
    case 'leetcode-next':
      count(0, 1, 'leetcode-next [YYYY-MM-DD]'); if (args[0] !== undefined) dateAt(0); break;
    case 'leetcode-plan':
      count(1, 1, 'leetcode-plan YYYY-MM-DD'); dateAt(0); break;
    case 'get': case 'fields': count(1, 1, `${command} YYYY-MM-DD`); dateAt(0); break;
    case 'record':
      count(2, 2, 'record YYYY-MM-DD "task"'); dateAt(0); textAt(1);
      if (normalizeTaskText(args[1]).length > 500) throw new CalendarAgentError('Normalized task text must be at most 500 characters.');
      break;
    case 'add':
      count(2, Infinity, 'add YYYY-MM-DD "task"'); dateAt(0);
      if (!args.slice(1).join(' ').trim() || args.slice(1).join(' ').length > 500) throw new CalendarAgentError('Task text is required and must be at most 500 characters.');
      break;
    case 'done':
      count(2, 3, 'done YYYY-MM-DD TASK_ID [true|false]'); dateAt(0); idAt(1);
      if (args[2] !== undefined && !['true', 'false'].includes(args[2])) usage('done YYYY-MM-DD TASK_ID [true|false]');
      break;
    case 'rename':
      count(3, 3, 'rename YYYY-MM-DD TASK_ID "task"'); dateAt(0); idAt(1); textAt(2); break;
    case 'detach':
      count(2, 2, 'detach YYYY-MM-DD TASK_ID'); dateAt(0); idAt(1); break;
    case 'reschedule':
      count(3, 4, 'reschedule SOURCE_DATE TASK_ID TARGET_DATE ["task"]'); dateAt(0); idAt(1); dateAt(2);
      if (args[0] === args[2]) throw new CalendarAgentError('Reschedule requires different source and target dates.');
      if (args[3] !== undefined) textAt(3);
      break;
    case 'toggle': case 'remove': case 'unlink': case 'series-remove':
      count(2, 2, `${command} YYYY-MM-DD TASK_ID`); dateAt(0); idAt(1); break;
    case 'link':
      count(3, 4, 'link YYYY-MM-DD TASK_ID CYCLE_ID [PHASE_ID]'); dateAt(0); idAt(1); idAt(2); if (args[3] !== undefined) idAt(3); break;
    case 'move': count(3, 3, 'move YYYY-MM-DD TASK_ID SECTION_ID|none'); dateAt(0); idAt(1); idAt(2); break;
    case 'habit': case 'series-update': {
      const offset = command === 'habit' ? 2 : 3;
      count(offset, offset + 3, `${command} YYYY-MM-DD TASK_ID ${offset === 3 ? '"task" ' : ''}["cue" "two-minute start" "identity"]`);
      dateAt(0); idAt(1); if (offset === 3) textAt(2);
      for (const value of args.slice(offset)) if (value.length > 300) throw new CalendarAgentError('Habit fields must be at most 300 characters.');
      break;
    }
    case 'activity': case 'reflection':
      count(1, Infinity, `${command} YYYY-MM-DD "content"`); dateAt(0);
      if (args.slice(1).join(' ').length > 20_000) throw new CalendarAgentError('Notes must be at most 20,000 characters.');
      break;
    case 'short': count(3, 3, 'short YYYY-MM-DD "task" END_DATE'); textAt(1); rangeAt(0, 2); break;
    case 'repeat':
      count(6, 6, 'repeat YYYY-MM-DD "task" day|week|month INTERVAL count|date COUNT|END_DATE'); dateAt(0); textAt(1);
      if (!['day', 'week', 'month'].includes(args[2]) || !Number.isSafeInteger(Number(args[3])) || Number(args[3]) < 1 || !['count', 'date'].includes(args[4])) usage('repeat YYYY-MM-DD "task" day|week|month INTERVAL count|date COUNT|END_DATE');
      if (args[4] === 'date') rangeAt(0, 5);
      else if (!Number.isSafeInteger(Number(args[5])) || Number(args[5]) < 1) throw new CalendarAgentError('Repeat count must be a positive integer.');
      break;
    case 'cycles': case 'sections': case 'leetcode': case 'leetcode-lists': count(0, 0, command); break;
    case 'cycle-get': count(1, 1, 'cycle-get CYCLE_ID'); idAt(0); break;
    case 'cycle-create': count(4, 4, 'cycle-create START_DATE END_DATE "title" "goal"'); rangeAt(0, 1); textAt(2); textAt(3, 20_000); break;
    case 'phase-add': count(4, 5, 'phase-add CYCLE_ID START_DATE END_DATE "title" ["description"]'); idAt(0); rangeAt(1, 2); textAt(3); if (args[4] !== undefined && args[4].length > 20_000) throw new CalendarAgentError('Description is too long.'); break;
    case 'cycle-reward': count(2, Infinity, 'cycle-reward CYCLE_ID "reward"'); idAt(0); break;
    case 'sections-set': count(0, 6, 'sections-set "morning" "afternoon" "evening"'); for (const value of args) if (value.length > 100) throw new CalendarAgentError('Section titles must be at most 100 characters.'); break;
    case 'field-add': case 'leetcode-list-add': count(1, Infinity, `${command} "title"`); if (!args.join(' ').trim() || args.join(' ').length > 500) throw new CalendarAgentError('Title is required and must be at most 500 characters.'); break;
    case 'field-write': count(2, Infinity, 'field-write YYYY-MM-DD FIELD_ID "content"'); dateAt(0); idAt(1); if (args.slice(2).join(' ').length > 20_000) throw new CalendarAgentError('Content is too long.'); break;
    case 'leetcode-list-assign': count(2, 2, 'leetcode-list-assign PROBLEM_ID LIST_ID|none'); idAt(0); idAt(1); break;
    case 'leetcode-list-order': count(2, Infinity, 'leetcode-list-order LIST_ID PROBLEM_ID...'); args.forEach((_, index) => idAt(index)); break;
    case 'leetcode-add':
      count(3, 4, 'leetcode-add YYYY-MM-DD easy|medium|hard "title" [URL]'); dateAt(0); textAt(2);
      if (!['easy', 'medium', 'hard'].includes(args[1])) usage('leetcode-add YYYY-MM-DD easy|medium|hard "title" [URL]');
      if (args[3]) { try { if (!['http:', 'https:'].includes(new URL(args[3]).protocol)) throw new Error(); } catch { throw new CalendarAgentError('LeetCode URL must be an HTTP or HTTPS URL.'); } }
      break;
    case 'leetcode-schedule': count(2, 2, 'leetcode-schedule PROBLEM_ID YYYY-MM-DD'); idAt(0); dateAt(1); break;
    case 'leetcode-attempt': count(4, 5, 'leetcode-attempt PROBLEM_ID YYYY-MM-DD stuck|hinted|solved|reviewed "notes" [TASK_ID]'); idAt(0); dateAt(1); textAt(3, 20_000); if (!['stuck', 'hinted', 'solved', 'reviewed'].includes(args[2])) usage('leetcode-attempt PROBLEM_ID YYYY-MM-DD stuck|hinted|solved|reviewed "notes" [TASK_ID]'); if (args[4] !== undefined) idAt(4); break;
    default: throw new CalendarAgentError('Unknown calendar command. Run calendar -- help for the command list.');
  }
}
