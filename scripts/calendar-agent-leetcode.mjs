import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, open, unlink, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { CalendarAgentError, localDate, validDate } from './calendar-agent-workflows.mjs';

export const leetcodeWorkflowCommands = new Set(['leetcode-policy', 'leetcode-next', 'leetcode-plan']);

function pathsForProfile() {
  const scripts = dirname(fileURLToPath(import.meta.url));
  const skill = dirname(scripts);
  const skills = dirname(skill);
  const inferredHome = basename(scripts) === 'scripts' && basename(skill) === 'daybook' && basename(skills) === 'skills' ? dirname(skills) : null;
  const home = process.env.HERMES_HOME ? resolve(process.env.HERMES_HOME) : inferredHome;
  if (!home) throw new CalendarAgentError('Set HERMES_HOME to the Hermes profile that owns this LeetCode policy.');
  const directory = join(home, 'data', 'daybook');
  return { directory, policy: join(directory, 'leetcode-policy.json'), ledger: join(directory, 'leetcode-plans.json'), lock: join(directory, 'leetcode-policy.lock') };
}

async function readJson(path, optional = false) {
  try {
    if ((await stat(path)).size > 4_000_000) throw new Error('oversized');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw new CalendarAgentError('Unable to read a valid LeetCode policy JSON file.');
  }
}

async function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function withLock(paths, action) {
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  let handle;
  try { handle = await open(paths.lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new CalendarAgentError('Another LeetCode policy operation holds the profile lock. Wait for it to finish; inspect a stale lock before removing it.');
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    await handle.close();
    handle = null;
    return await action();
  } finally {
    if (handle) await handle.close();
    await unlink(paths.lock).catch(() => {});
  }
}

function validatePolicy(value) {
  const invalid = () => { throw new CalendarAgentError('Invalid LeetCode policy. Use version 1, onDemandOnly true, ordered main/review lists, and valid counts and problem metadata.'); };
  if (!value || value.version !== 1 || value.onDemandOnly !== true) invalid();
  const list = (candidate, dailyCount) => {
    if (!candidate || typeof candidate.title !== 'string' || !candidate.title.trim() || candidate.title.length > 200 || candidate.dailyCount !== dailyCount ||
      !Array.isArray(candidate.problems) || !candidate.problems.length || candidate.problems.length > 10_000 ||
      !Number.isSafeInteger(candidate.completedCount) || candidate.completedCount < 0 || candidate.completedCount > candidate.problems.length) invalid();
    let source;
    try { source = new URL(candidate.sourceUrl); } catch { invalid(); }
    if (source.protocol !== 'https:' || !['leetcode.com', 'www.leetcode.com'].includes(source.hostname) || source.username || source.password || source.port || source.search || source.hash ||
      !/^\/problem-list\/[a-zA-Z0-9_-]+\/$/.test(`${source.pathname.replace(/\/+$/, '')}/`)) invalid();
    const slugs = new Set();
    const problems = candidate.problems.map((problem) => {
      if (!problem || !Number.isSafeInteger(problem.number) || problem.number < 1 || typeof problem.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(problem.slug) || problem.slug.length > 200 ||
        slugs.has(problem.slug) || typeof problem.title !== 'string' || !problem.title.trim() || problem.title.length > 200 || !['easy', 'medium', 'hard'].includes(problem.difficulty)) invalid();
      slugs.add(problem.slug);
      return { number: problem.number, slug: problem.slug, title: problem.title.trim(), difficulty: problem.difficulty };
    });
    return { sourceUrl: `https://leetcode.com${source.pathname.replace(/\/+$/, '')}/`, title: candidate.title.trim(), dailyCount, completedCount: candidate.completedCount, problems };
  };
  return { version: 1, onDemandOnly: true, main: list(value.main, 2), review: list(value.review, 1) };
}

function checkBinding(value, binding) {
  if (value.binding !== binding) throw new CalendarAgentError('This LeetCode policy belongs to a different calendar connection. Use its original account and Hermes profile.');
}

async function loadState(paths, binding) {
  const saved = await readJson(paths.policy, true);
  if (!saved) throw new CalendarAgentError('No LeetCode policy is configured for this Hermes profile. Set it from a private JSON file first.');
  checkBinding(saved, binding);
  const policy = validatePolicy(saved.policy);
  const ledger = await readJson(paths.ledger, true) ?? { version: 1, binding, plans: [] };
  checkBinding(ledger, binding);
  if (ledger.version !== 1 || !Array.isArray(ledger.plans) || ledger.plans.some((plan) => !validDate(plan.date) || !Array.isArray(plan.slots) || plan.slots.some((slot) =>
    !['main', 'review'].includes(slot.role) || !policy[slot.role].problems.some((problem) => problem.slug === slot.slug) || !Number.isFinite(slot.plannedAt) ||
    (slot.problemId != null && (typeof slot.problemId !== 'string' || !slot.problemId)) || (slot.taskId != null && (typeof slot.taskId !== 'string' || !slot.taskId))))) {
    throw new CalendarAgentError('The LeetCode plan ledger is invalid. Inspect it before planning again.');
  }
  return { policy, ledger };
}

function problemSlug(problem) {
  try {
    const url = new URL(problem.url);
    return ['leetcode.com', 'www.leetcode.com'].includes(url.hostname) ? url.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/|$)/)?.[1] ?? null : null;
  } catch { return null; }
}

function problemForSlot(slot, problems) {
  if (slot.problemId) return problems.find((problem) => problem.id === slot.problemId && problemSlug(problem) === slot.slug);
  const matches = problems.filter((problem) => problemSlug(problem) === slot.slug);
  if (matches.length > 1) throw new CalendarAgentError('The library has multiple records for a selected LeetCode URL. Inspect and reconcile them before planning again.');
  return matches[0];
}

function isCompleted(slot, date, problems) {
  if (!slot.taskId) return false;
  const problem = problemForSlot(slot, problems);
  if (!problem) return false;
  return (problem.attempts ?? []).some((attempt) => ['solved', 'reviewed'].includes(attempt.status) && Number(attempt.createdAt) >= slot.plannedAt &&
    (attempt.taskId === slot.taskId || (!attempt.taskId && attempt.attemptedOn === date)));
}

function progressFor(policy, ledger, problems) {
  const mainCompleted = new Set(policy.main.problems.slice(0, policy.main.completedCount).map((problem) => problem.slug));
  const reviewRounds = new Map([[1, new Set(policy.review.problems.slice(0, policy.review.completedCount).map((problem) => problem.slug))]]);
  for (const plan of ledger.plans) {
    for (const slot of plan.slots) {
      if (!isCompleted(slot, plan.date, problems)) continue;
      if (slot.role === 'main') mainCompleted.add(slot.slug);
      else {
        const round = slot.reviewCycle ?? 1;
        const completed = reviewRounds.get(round) ?? new Set();
        completed.add(slot.slug);
        reviewRounds.set(round, completed);
      }
    }
  }
  let reviewCycle = 1;
  while ((reviewRounds.get(reviewCycle)?.size ?? 0) >= policy.review.problems.length) reviewCycle++;
  const reviewCompleted = reviewRounds.get(reviewCycle) ?? new Set();
  return { mainCompleted, reviewCompleted, reviewCycle };
}

function chooseSlots(policy, progress) {
  const plannedAt = Date.now();
  const slots = [];
  const selected = new Set();
  for (const role of ['main', 'review']) {
    const completed = role === 'main' ? progress.mainCompleted : progress.reviewCompleted;
    let remaining = policy[role].dailyCount;
    for (const [index, problem] of policy[role].problems.entries()) {
      if (!remaining) break;
      if (completed.has(problem.slug) || selected.has(problem.slug)) continue;
      slots.push({ role, position: index + 1, ...problem, plannedAt, problemId: null, taskId: null, ...(role === 'review' ? { reviewCycle: progress.reviewCycle } : {}) });
      selected.add(problem.slug);
      remaining--;
    }
  }
  return slots;
}

function viewPlan(date, plan, existingPlan, policy, ledger, problems, entry) {
  const progress = progressFor(policy, ledger, problems);
  return {
    date, existingPlan,
    slots: plan.slots.map((slot) => {
      let status = 'selected';
      if (slot.cancelled || (slot.taskId && !entry.tasks.some((task) => task.id === slot.taskId && task.leetcodeProblemId === slot.problemId))) status = 'cancelled';
      else if (isCompleted(slot, date, problems)) status = 'completed';
      else if (slot.taskId) status = 'scheduled';
      else if (slot.schedulePending) status = 'unverified';
      return { ...slot, status };
    }),
    progress: { mainCompleted: progress.mainCompleted.size, mainTotal: policy.main.problems.length, reviewCycle: progress.reviewCycle, reviewCompleted: progress.reviewCompleted.size, reviewTotal: policy.review.problems.length },
  };
}

function persistentTask(task) {
  const result = { ...task };
  delete result.streak;
  delete result.recoveryDue;
  return result;
}

function verifyAddition(before, after) {
  if (before.activity !== after.activity || before.reflection !== after.reflection || before.tasks.some((task) =>
    !isDeepStrictEqual(persistentTask(task), persistentTask(after.tasks.find((item) => item.id === task.id) ?? {})))) {
    throw new CalendarAgentError('The calendar changed while adding a LeetCode task. Read the date and saved plan before continuing.');
  }
}

function ordinaryTask(entry, problemId) {
  const matches = entry.tasks.filter((task) => task.leetcodeProblemId === problemId);
  if (matches.length > 1) throw new CalendarAgentError('This date has multiple tasks for the same LeetCode problem. Inspect and reconcile them before planning again.');
  if (matches[0]?.recurrenceId || matches[0]?.deadline) throw new CalendarAgentError('An existing LeetCode task is recurring or has a deadline. The on-demand policy only adopts ordinary tasks.');
  return matches[0];
}

export async function runLeetcodeWorkflow(command, args, api) {
  const paths = pathsForProfile();
  const binding = createHash('sha256').update(`${api.apiUrl}\0${api.agentToken}`).digest('hex');
  const output = (value) => console.log(JSON.stringify({ command, timezone: api.timezone, asOfDate: localDate(api.timezone), ...value }, null, 2));
  if (command === 'leetcode-policy') {
    if (!args.length) {
      const saved = await readJson(paths.policy, true);
      if (!saved) { output({ configured: false }); return; }
      checkBinding(saved, binding);
      output({ configured: true, policy: validatePolicy(saved.policy) });
      return;
    }
    if (extname(args[1]).toLowerCase() !== '.json') throw new CalendarAgentError('Import the policy from a private .json file.');
    const policy = validatePolicy(await readJson(resolve(args[1])));
    await withLock(paths, async () => {
      const saved = await readJson(paths.policy, true);
      if (saved) {
        checkBinding(saved, binding);
        if (!isDeepStrictEqual(validatePolicy(saved.policy), policy)) throw new CalendarAgentError('A different LeetCode policy already exists. It was kept unchanged; automatic replacement or progress reset is not supported.');
      } else {
        if (await readJson(paths.ledger, true)) throw new CalendarAgentError('An existing LeetCode plan ledger must be inspected before setting a new policy.');
        await writeJson(paths.policy, { version: 1, binding, createdAt: Date.now(), policy });
      }
      output({ configured: true, changed: !saved, policy });
    });
    return;
  }
  const date = args[0] ?? localDate(api.timezone);
  const run = async (write) => {
    const { policy, ledger } = await loadState(paths, binding);
    let { problems } = await api.request('/api/leetcode');
    let entry = await api.getEntry(date);
    let plan = ledger.plans.find((item) => item.date === date);
    const existingPlan = Boolean(plan);
    if (!plan) {
      plan = { date, createdAt: Date.now(), slots: chooseSlots(policy, progressFor(policy, ledger, problems)) };
      if (write) {
        ledger.plans.push(plan);
        await writeJson(paths.ledger, ledger);
      }
    }
    let createdCount = 0;
    if (write) {
      for (const slot of plan.slots) {
        if (slot.cancelled) continue;
        if (slot.taskId) {
          if (ordinaryTask(entry, slot.problemId)?.id !== slot.taskId) {
            slot.cancelled = true;
            await writeJson(paths.ledger, ledger);
          }
          continue;
        }
        let problem = problemForSlot(slot, problems);
        if (slot.problemId && !problem) throw new CalendarAgentError('A saved LeetCode problem no longer matches its policy slot. Inspect the library and ledger before continuing.');
        if (!problem) {
          const result = await api.request('/api/leetcode', { method: 'POST', body: JSON.stringify({ title: slot.title, difficulty: slot.difficulty, url: `https://leetcode.com/problems/${slot.slug}/`, plannedDate: null }) });
          if (typeof result.id !== 'string' || !result.id) throw new CalendarAgentError('The new LeetCode problem ID could not be verified. Read the library before retrying.');
          slot.problemId = result.id;
          await writeJson(paths.ledger, ledger);
          ({ problems } = await api.request('/api/leetcode'));
          problem = problemForSlot(slot, problems);
          if (!problem) throw new CalendarAgentError('The created LeetCode problem could not be read back. Read the library before retrying.');
        }
        slot.problemId = problem.id;
        await writeJson(paths.ledger, ledger);
        entry = await api.getEntry(date);
        const existing = ordinaryTask(entry, problem.id);
        if (existing) {
          slot.taskId = existing.id;
          delete slot.schedulePending;
          await writeJson(paths.ledger, ledger);
          continue;
        }
        if (slot.schedulePending) throw new CalendarAgentError('A previous schedule result is unknown and its task is absent. Inspect the saved selection and calendar; this task will not be blindly recreated.');
        if (entry.tasks.length >= 100) throw new CalendarAgentError('This date already has 100 tasks.');
        slot.schedulePending = true;
        await writeJson(paths.ledger, ledger);
        let result;
        try {
          result = await api.request('/api/leetcode', { method: 'POST', body: JSON.stringify({ action: 'schedule', problemId: problem.id, date }) });
        } catch (error) {
          // Only explicit pre-write API rejections prove that no task was committed.
          // A server/gateway failure can arrive after commit, so preserve its pending state.
          if (error instanceof CalendarAgentError && [400, 401, 403, 404].includes(error.status)) {
            delete slot.schedulePending;
            await writeJson(paths.ledger, ledger);
          }
          throw error;
        }
        if (typeof result.taskId !== 'string' || !result.taskId) throw new CalendarAgentError('The scheduled task ID is unknown. Read the date before retrying this saved plan.');
        slot.taskId = result.taskId;
        delete slot.schedulePending;
        await writeJson(paths.ledger, ledger);
        const verified = await api.getEntry(date);
        if (ordinaryTask(verified, problem.id)?.id !== slot.taskId) {
          throw new CalendarAgentError('The scheduled LeetCode task could not be verified. Its saved task ID will not be blindly recreated.');
        }
        verifyAddition(entry, verified);
        entry = verified;
        if (result.created) createdCount++;
      }
      entry = await api.getEntry(date);
      for (const slot of plan.slots) {
        if (slot.taskId && !slot.cancelled && ordinaryTask(entry, slot.problemId)?.id !== slot.taskId) slot.cancelled = true;
      }
      await writeJson(paths.ledger, ledger);
      ({ problems } = await api.request('/api/leetcode'));
    }
    output({ ...viewPlan(date, plan, existingPlan, policy, ledger, problems, entry), ...(write ? { createdCount } : {}) });
  };
  if (command === 'leetcode-plan') await withLock(paths, () => run(true));
  else await run(false);
}
