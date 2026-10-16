import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Use an isolated API and temporary Hermes homes. Never load .env files or a real profile.
const execute = promisify(execFile);
const script = fileURLToPath(new URL('./calendar-agent.mjs', import.meta.url));
const profiles = [];
const token = 'mock-leetcode-policy-secret';
const otherToken = 'mock-different-account-secret';
const requests = [];
const entries = new Map();
const problems = new Map();
let revision = 0;
let problemNumber = 0;
let taskNumber = 0;
let failSchedule = () => false;
let loseScheduleResponse = () => false;
let failScheduleAfterCommit = () => false;

const task = (id, text, extra = {}) => ({
  id, text, done: false, cycleId: null, phaseId: null, sectionId: null,
  recurrenceId: null, deadline: null, habitCue: null, tinyStart: null,
  identity: null, leetcodeProblemId: null, ...extra,
});
const emptyEntry = () => ({ tasks: [], activity: '', reflection: '', revision: null });
const entryFor = (date) => entries.get(date) ?? emptyEntry();
const slugFor = (url) => new URL(url).pathname.split('/').filter(Boolean).at(-1);
const writes = () => requests.filter((request) => request.method !== 'GET').length;
function addProblem(slug, extra = {}) {
  const problem = {
    id: `problem-${++problemNumber}`, title: slug, url: `https://leetcode.com/problems/${slug}/`,
    difficulty: 'easy', plannedDate: null, listId: null, listPosition: problemNumber,
    createdAt: 1, updatedAt: 1, attempts: [], ...extra,
  };
  problems.set(problem.id, problem);
  return problem;
}
function apiProblems() {
  return [...problems.values()].map((problem) => ({
    ...problem,
    scheduledTasks: [...entries].flatMap(([date, entry]) => entry.tasks
      .filter((item) => item.leetcodeProblemId === problem.id)
      .map((item) => ({ id: item.id, problemId: problem.id, date, done: item.done }))),
  }));
}
function resetApi() {
  requests.length = 0;
  entries.clear();
  problems.clear();
  failSchedule = () => false;
  loseScheduleResponse = () => false;
  failScheduleAfterCommit = () => false;
}
function makePolicy(reviewSlugs = ['problem-7', 'review-2', 'review-3']) {
  const item = (slug, index) => ({ number: slug.startsWith('problem-') ? Number(slug.slice(8)) : 101 + index, slug, title: `Fixture ${slug}`, difficulty: 'easy' });
  return {
    version: 1, onDemandOnly: true,
    main: {
      sourceUrl: 'https://leetcode.com/problem-list/main-fixture/', title: 'Main',
      dailyCount: 2, completedCount: 6,
      problems: Array.from({ length: 10 }, (_, index) => item(`problem-${index + 1}`, index)),
    },
    review: {
      sourceUrl: 'https://leetcode.com/problem-list/review-fixture/', title: 'Review',
      dailyCount: 1, completedCount: 0, problems: reviewSlugs.map(item),
    },
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
  requests.push({ method: request.method, path: url.pathname, date: url.searchParams.get('date'), body });
  const json = (value, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  if (request.headers.authorization !== `Bearer ${token}`) {
    json({ error: `${token} private authentication detail` }, 401);
    return;
  }
  if (url.pathname === '/api/entries' && request.method === 'GET') {
    json(entryFor(url.searchParams.get('date')));
    return;
  }
  if (url.pathname === '/api/entries' && request.method === 'PUT') {
    const current = entryFor(body.date);
    if (body.revision !== current.revision) { json({ error: `${token} private conflict` }, 409); return; }
    const { date, ...next } = body;
    next.revision = `revision-${++revision}`;
    entries.set(date, next);
    json({ ok: true, revision: next.revision });
    return;
  }
  if (url.pathname === '/api/leetcode' && request.method === 'GET') {
    json({ lists: [], problems: apiProblems() });
    return;
  }
  if (url.pathname === '/api/leetcode' && request.method === 'POST') {
    if (body.action === 'schedule') {
      const problem = problems.get(body.problemId);
      if (!problem) { json({ error: 'Unknown mock problem' }, 404); return; }
      if (failSchedule(body)) { json({ error: `${token} private schedule rejection` }, 400); return; }
      const entry = entryFor(body.date);
      const existing = entry.tasks.find((item) => item.leetcodeProblemId === problem.id);
      if (existing) { json({ ok: true, taskId: existing.id, created: false }); return; }
      const scheduled = task(`scheduled-${++taskNumber}`, `LeetCode: ${problem.title}`, { leetcodeProblemId: problem.id });
      entries.set(body.date, { ...entry, tasks: [...entry.tasks, scheduled], revision: `revision-${++revision}` });
      problem.plannedDate = body.date;
      if (loseScheduleResponse(body)) { request.socket.destroy(); return; }
      if (failScheduleAfterCommit(body)) { json({ error: `${token} private server failure after commit` }, 503); return; }
      json({ ok: true, taskId: scheduled.id, created: true }, 201);
      return;
    }
    assert.equal(body.action, undefined, 'the policy planner only creates problems and schedules them');
    assert.equal(body.plannedDate, null, 'create a shared problem without implicitly scheduling a task');
    const problem = addProblem(slugFor(body.url), { title: body.title, url: body.url, difficulty: body.difficulty });
    json({ ok: true, id: problem.id, taskId: null }, 201);
    return;
  }
  json({ error: 'Unexpected mock route' }, 404);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const apiUrl = `http://127.0.0.1:${server.address().port}`;

async function profile(policy = makePolicy()) {
  const home = await mkdtemp(join(tmpdir(), 'daybook-leetcode-policy-'));
  profiles.push(home);
  const input = join(home, 'policy-input.json');
  await writeFile(input, JSON.stringify(policy));
  return { home, input, policy, policyPath: join(home, 'data/daybook/leetcode-policy.json'), ledgerPath: join(home, 'data/daybook/leetcode-plans.json') };
}
async function run(profile, args, overrides = {}, expectedCode = 0) {
  const environment = {
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    HERMES_HOME: profile.home, CALENDAR_API_URL: apiUrl,
    CALENDAR_AGENT_TOKEN: token, CALENDAR_TIMEZONE: 'Asia/Taipei', TZ: 'UTC',
    ...overrides,
  };
  let result;
  try { result = { ...(await execute(process.execPath, [script, ...args], { env: environment, cwd: tmpdir(), timeout: 15_000 })), code: 0 }; }
  catch (error) { result = error; }
  assert.equal(result.code, expectedCode, `${args.join(' ')}: ${result.stderr}`);
  for (const secret of [token, otherToken]) {
    assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret), 'credentials never appear in CLI output');
  }
  return result;
}
async function json(profile, args, overrides) {
  const result = JSON.parse((await run(profile, args, overrides)).stdout);
  assert.equal(result.command, args[0]);
  assert.equal(result.timezone, 'Asia/Taipei');
  assert.match(result.asOfDate, /^\d{4}-\d{2}-\d{2}$/);
  return result;
}
const mainSlugs = (result) => result.slots.filter((slot) => slot.role === 'main').map((slot) => slot.slug);
const reviewSlot = (result) => result.slots.find((slot) => slot.role === 'review');
async function snapshotFiles(profile) {
  const snapshot = {};
  for (const path of [profile.policyPath, profile.ledgerPath]) {
    try { snapshot[path] = await readFile(path, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return snapshot;
}
function attempt(slot, date, status, overrides = {}) {
  const problem = problems.get(slot.problemId);
  assert.ok(problem, 'a scheduled slot has an existing shared problem');
  problem.attempts.push({
    id: `attempt-${problem.id}-${problem.attempts.length + 1}`, problemId: problem.id,
    taskId: slot.taskId, attemptedOn: date, status, notes: 'Mock attempt notes',
    attemptNumber: problem.attempts.length + 1, createdAt: Date.now() + 1_000, ...overrides,
  });
}

try {
  const helpProfile = await profile();
  const help = await run(helpProfile, ['help'], { CALENDAR_API_URL: '', CALENDAR_AGENT_TOKEN: '' });
  assert.match(help.stdout, /leetcode-policy/);
  assert.match(help.stdout, /leetcode-next/);
  assert.match(help.stdout, /leetcode-plan/);
  assert.equal(requests.length, 0, 'help needs no profile, credentials, or API calls');

  // Configuration is private and explicit. Merely asking for candidates never writes a plan.
  const first = await profile();
  const missing = await json(first, ['leetcode-policy']);
  assert.equal(missing.configured, false);
  assert.equal(writes(), 0);
  await json(first, ['leetcode-policy', 'set', first.input]);
  const configured = await json(first, ['leetcode-policy']);
  assert.equal(configured.configured, true);
  assert.deepEqual(configured.policy, first.policy, 'public policy output excludes the private account binding');
  assert.deepEqual(Object.keys(configured).sort(), ['asOfDate', 'command', 'configured', 'policy', 'timezone']);
  assert.equal(requests.length, 0, 'policy reads and imports do not access calendar data');
  const validFiles = await snapshotFiles(first);
  for (const invalidate of [
    (value) => { value.main.sourceUrl = 'https://example.com/problem-list/private/'; },
    (value) => { value.review.sourceUrl = 'http://leetcode.com/problem-list/private/'; },
    (value) => { value.main.problems[1].slug = value.main.problems[0].slug; },
    (value) => { value.main.dailyCount = 3; },
    (value) => { value.review.completedCount = 4; },
  ]) {
    const invalid = structuredClone(first.policy);
    invalidate(invalid);
    const invalidPath = join(first.home, 'invalid-policy.json');
    await writeFile(invalidPath, JSON.stringify(invalid));
    await run(first, ['leetcode-policy', 'set', invalidPath], {}, 1);
    assert.deepEqual(await snapshotFiles(first), validFiles, 'invalid policy input preserves the configured policy');
  }
  for (const command of ['leetcode-next', 'leetcode-plan']) await run(first, [command, '2026-02-30'], {}, 1);
  assert.equal(requests.length, 0, 'invalid policy fields and CLI dates never access the API');
  addProblem('problem-7', { attempts: [{ id: 'old-solved', taskId: null, attemptedOn: '2000-01-01', status: 'solved', createdAt: 1 }] });
  const beforeNext = await snapshotFiles(first);
  const next = await json(first, ['leetcode-next', '2026-10-16']);
  assert.deepEqual(mainSlugs(next), ['problem-7', 'problem-8'], 'old solved history does not move the explicitly supplied baseline');
  assert.equal(next.date, '2026-10-16');
  assert.equal(next.existingPlan, false);
  assert.equal(next.progress.mainCompleted, 6);
  assert.equal(next.progress.mainTotal, 10);
  assert.equal(next.slots.length, 3);
  assert.ok(!mainSlugs(next).includes(reviewSlot(next).slug), 'a review collision never counts as a third distinct task');
  for (const slot of next.slots) {
    assert.equal(slot.status, 'selected');
    assert.equal(slot.taskId, null);
    assert.ok(slot.problemId === null || problems.has(slot.problemId));
    assert.ok(Number.isFinite(slot.plannedAt));
  }
  assert.equal(writes(), 0, 'candidate preview is read-only');
  assert.deepEqual(await snapshotFiles(first), beforeNext, 'candidate preview does not persist a local plan');

  // Planning preserves pre-existing notes/tasks; repeated runs use exactly the original daily slate.
  const date = '2026-10-16';
  const original = {
    tasks: [task('existing-meeting', '14:00 meeting', { done: true, sectionId: 'afternoon', cycleId: 'research-cycle', phaseId: 'phase-1', habitCue: 'After lunch' })],
    activity: 'Existing private activity', reflection: 'Existing reflection.\nKeep this paragraph.', revision: 'existing-revision',
  };
  entries.set(date, structuredClone(original));
  const planned = await json(first, ['leetcode-plan', date]);
  assert.deepEqual(mainSlugs(planned), ['problem-7', 'problem-8']);
  assert.equal(planned.slots.length, 3);
  for (const slot of planned.slots) { assert.equal(slot.status, 'scheduled'); assert.ok(slot.taskId); assert.ok(slot.problemId); }
  assert.deepEqual(entries.get(date).tasks[0], original.tasks[0]);
  assert.equal(entries.get(date).activity, original.activity);
  assert.equal(entries.get(date).reflection, original.reflection);
  assert.equal(entries.get(date).tasks.length, 4);
  assert.equal([...problems.values()].filter((problem) => slugFor(problem.url) === 'problem-7').length, 1, 'an existing slug shares its original problem and attempt history');
  const writesBeforeRerun = writes();
  const same = await json(first, ['leetcode-plan', date]);
  assert.equal(same.existingPlan, true);
  assert.deepEqual(same.slots.map((slot) => [slot.role, slot.slug, slot.taskId, slot.plannedAt]), planned.slots.map((slot) => [slot.role, slot.slug, slot.taskId, slot.plannedAt]));
  assert.equal(writes(), writesBeforeRerun, 'same-date rerun does not replace the slate or schedule duplicates');
  addProblem('problem-7');
  const pinned = await json(first, ['leetcode-plan', date]);
  assert.deepEqual(pinned.slots.map((slot) => [slot.problemId, slot.taskId]), planned.slots.map((slot) => [slot.problemId, slot.taskId]), 'a bound plan retains its exact problem IDs when another record later shares its URL');
  assert.equal(writes(), writesBeforeRerun, 'a later duplicate URL does not replace an already bound problem');
  const filesBeforeSamePolicy = await snapshotFiles(first);
  await json(first, ['leetcode-policy', 'set', first.input]);
  assert.deepEqual(await snapshotFiles(first), filesBeforeSamePolicy, 'reimporting an identical policy preserves its timestamps and ledger');

  const main = planned.slots.filter((slot) => slot.role === 'main');
  for (const slot of main) {
    entries.get(date).tasks.find((item) => item.id === slot.taskId).done = true;
    attempt(slot, date, 'stuck');
  }
  entries.get(date).tasks.find((item) => item.id === reviewSlot(planned).taskId).done = true;
  attempt(reviewSlot(planned), date, 'hinted');
  const stuckNext = await json(first, ['leetcode-next', '2026-10-17']);
  assert.deepEqual(mainSlugs(stuckNext), ['problem-7', 'problem-8'], 'a stuck attempt and a checked task do not advance main progress');
  assert.equal(stuckNext.progress.mainCompleted, 6);
  assert.equal(stuckNext.progress.reviewCompleted, 0, 'scheduling, checking, or receiving a hint does not advance review rotation');
  assert.equal(reviewSlot(stuckNext).slug, reviewSlot(planned).slug);
  attempt(main[0], date, 'solved', { taskId: null });
  attempt(main[1], date, 'reviewed');
  const advanced = await json(first, ['leetcode-next', '2026-10-17']);
  assert.deepEqual(mainSlugs(advanced), ['problem-9', 'problem-10']);
  assert.equal(advanced.progress.mainCompleted, 8, 'only new solved/reviewed main-role attempts advance the supplied baseline');
  const fixedAfterCompletion = await json(first, ['leetcode-plan', date]);
  assert.deepEqual(mainSlugs(fixedAfterCompletion), ['problem-7', 'problem-8'], 'completion does not refill the same date with a new batch');
  assert.equal(writes(), writesBeforeRerun);

  const deleted = reviewSlot(planned);
  entries.get(date).tasks = entries.get(date).tasks.filter((item) => item.id !== deleted.taskId);
  const cancelled = await json(first, ['leetcode-plan', date]);
  assert.equal(cancelled.slots.find((slot) => slot.slug === deleted.slug).status, 'cancelled');
  assert.equal(entries.get(date).tasks.length, 3);
  assert.equal(writes(), writesBeforeRerun, 'a deleted known task is cancelled and never silently rebuilt');
  const cancelledAgain = await json(first, ['leetcode-plan', date]);
  assert.equal(cancelledAgain.slots.find((slot) => slot.slug === deleted.slug).status, 'cancelled');
  assert.equal(writes(), writesBeforeRerun);
  entries.get(date).tasks = entries.get(date).tasks.filter((item) => item.id !== main[0].taskId);
  const removedSolved = await json(first, ['leetcode-plan', date]);
  assert.equal(removedSolved.slots.find((slot) => slot.taskId === main[0].taskId).status, 'cancelled', 'a deleted task remains cancelled even when its problem was solved');
  assert.equal(removedSolved.progress.mainCompleted, 8, 'removing a task does not erase a genuine solved attempt');
  assert.equal(writes(), writesBeforeRerun);

  // A review completion can share a problem without advancing that problem's main role.
  resetApi();
  const roles = await profile(makePolicy(['problem-9', 'review-2', 'review-3']));
  await json(roles, ['leetcode-policy', 'set', roles.input]);
  const rolePlan = await json(roles, ['leetcode-plan', '2026-10-18']);
  assert.equal(reviewSlot(rolePlan).slug, 'problem-9');
  for (const slot of rolePlan.slots) attempt(slot, '2026-10-18', 'solved');
  const roleNext = await json(roles, ['leetcode-next', '2026-10-19']);
  assert.deepEqual(mainSlugs(roleNext), ['problem-9', 'problem-10'], 'review-role success is not main-role completion');
  assert.equal(roleNext.progress.mainCompleted, 8);
  assert.equal(roleNext.progress.reviewCompleted, 1);
  assert.ok(roleNext.progress.reviewCycle >= 1);

  resetApi();
  const roundsPolicy = makePolicy(['review-1', 'review-2', 'review-3']);
  roundsPolicy.main.completedCount = 10;
  const rounds = await profile(roundsPolicy);
  await json(rounds, ['leetcode-policy', 'set', rounds.input]);
  for (const date of ['2026-10-21', '2026-10-22', '2026-10-23']) {
    const roundPlan = await json(rounds, ['leetcode-plan', date]);
    attempt(reviewSlot(roundPlan), date, 'reviewed');
  }
  const roundTwo = await json(rounds, ['leetcode-next', '2026-10-24']);
  assert.equal(roundTwo.progress.reviewCycle, 2);
  assert.equal(roundTwo.progress.reviewCompleted, 0);
  assert.equal(reviewSlot(roundTwo).slug, 'review-1');
  const secondRoundPlan = await json(rounds, ['leetcode-plan', '2026-10-24']);
  assert.equal(reviewSlot(secondRoundPlan).status, 'scheduled', 'an old round attempt cannot complete the next round task');
  assert.equal((await json(rounds, ['leetcode-next', '2026-10-25'])).progress.reviewCompleted, 0);

  // Persist all selected slots before remote writes, then resume only that selection after failure.
  resetApi();
  const partial = await profile();
  await json(partial, ['leetcode-policy', 'set', partial.input]);
  let scheduleCalls = 0;
  failSchedule = () => ++scheduleCalls === 3;
  await run(partial, ['leetcode-plan', '2026-10-20'], {}, 1);
  assert.equal(entryFor('2026-10-20').tasks.length, 2, 'the fixture interrupts after two successful schedules');
  const interruptedLedger = await readFile(partial.ledgerPath, 'utf8');
  assert.match(interruptedLedger, /problem-7/);
  assert.match(interruptedLedger, /problem-8/);
  const interrupted = await json(partial, ['leetcode-next', '2026-10-20']);
  const selectedBeforeResume = interrupted.slots.map((slot) => [slot.role, slot.slug, slot.plannedAt]);
  assert.equal(interrupted.existingPlan, true);
  failSchedule = () => false;
  const resumed = await json(partial, ['leetcode-plan', '2026-10-20']);
  assert.deepEqual(resumed.slots.map((slot) => [slot.role, slot.slug, slot.plannedAt]), selectedBeforeResume);
  assert.equal(entryFor('2026-10-20').tasks.length, 3);
  assert.equal(new Set(entryFor('2026-10-20').tasks.map((item) => item.leetcodeProblemId)).size, 3);
  assert.equal(problems.size, 3, 'resuming a partial plan reuses created problem records');
  assert.ok(resumed.slots.every((slot) => slot.status === 'scheduled'));

  // A committed schedule with a lost response can be adopted, but its deletion is not recreated.
  resetApi();
  const unknown = await profile();
  await json(unknown, ['leetcode-policy', 'set', unknown.input]);
  loseScheduleResponse = () => true;
  await run(unknown, ['leetcode-plan', '2026-10-21'], {}, 1);
  assert.equal(entryFor('2026-10-21').tasks.length, 1);
  const uncertain = await json(unknown, ['leetcode-next', '2026-10-21']);
  assert.equal(uncertain.slots[0].status, 'unverified');
  assert.equal(uncertain.slots[0].taskId, null);
  entries.get('2026-10-21').tasks = [];
  loseScheduleResponse = () => false;
  const beforeUnknownRetry = writes();
  const unknownRetry = await run(unknown, ['leetcode-plan', '2026-10-21'], {}, 1);
  assert.match(unknownRetry.stderr, /previous schedule result is unknown/);
  assert.equal(writes(), beforeUnknownRetry, 'an absent task after an unknown schedule result is never blindly recreated');

  // A received server/gateway error can also follow a commit; deletion must stay ambiguous.
  resetApi();
  const serverFailure = await profile();
  await json(serverFailure, ['leetcode-policy', 'set', serverFailure.input]);
  failScheduleAfterCommit = () => true;
  const serverFailureResult = await run(serverFailure, ['leetcode-plan', '2026-10-24'], {}, 1);
  assert.match(serverFailureResult.stderr, /HTTP 503/);
  assert.equal(entryFor('2026-10-24').tasks.length, 1, 'a server error can arrive after the task was committed');
  const afterServerFailure = await json(serverFailure, ['leetcode-next', '2026-10-24']);
  assert.equal(afterServerFailure.slots[0].status, 'unverified');
  assert.equal(afterServerFailure.slots[0].schedulePending, true, 'a 5xx response preserves unknown schedule outcome');
  entries.get('2026-10-24').tasks = [];
  failScheduleAfterCommit = () => false;
  const beforeServerFailureRetry = writes();
  const serverFailureRetry = await run(serverFailure, ['leetcode-plan', '2026-10-24'], {}, 1);
  assert.match(serverFailureRetry.stderr, /previous schedule result is unknown/);
  assert.equal(writes(), beforeServerFailureRetry, 'an absent task after a committed 5xx response is never blindly recreated');

  resetApi();
  const lost = await profile();
  await json(lost, ['leetcode-policy', 'set', lost.input]);
  loseScheduleResponse = () => true;
  await run(lost, ['leetcode-plan', '2026-10-22'], {}, 1);
  const committedId = entryFor('2026-10-22').tasks[0].id;
  loseScheduleResponse = () => false;
  const recovered = await json(lost, ['leetcode-plan', '2026-10-22']);
  assert.equal(recovered.slots[0].taskId, committedId, 'read back and adopt a committed task when its response was lost');
  assert.equal(entryFor('2026-10-22').tasks.length, 3);

  resetApi();
  const existing = await profile();
  await json(existing, ['leetcode-policy', 'set', existing.input]);
  const duplicatedProblem = addProblem('problem-7');
  const duplicate = task('first-duplicate', 'Existing problem', { leetcodeProblemId: duplicatedProblem.id });
  entries.set('2026-10-23', { ...emptyEntry(), tasks: [duplicate, { ...duplicate, id: 'second-duplicate' }] });
  const beforeInvalidAdoption = writes();
  assert.match((await run(existing, ['leetcode-plan', '2026-10-23'], {}, 1)).stderr, /multiple tasks/);
  entries.get('2026-10-23').tasks = [{ ...duplicate, recurrenceId: 'routine' }];
  assert.match((await run(existing, ['leetcode-plan', '2026-10-23'], {}, 1)).stderr, /only adopts ordinary tasks/);
  entries.get('2026-10-23').tasks = [{ ...duplicate, deadline: '2026-10-24' }];
  assert.match((await run(existing, ['leetcode-plan', '2026-10-23'], {}, 1)).stderr, /only adopts ordinary tasks/);
  assert.equal(writes(), beforeInvalidAdoption, 'duplicate and recurring/deadline tasks are not silently adopted or replaced');

  resetApi();
  const ambiguous = await profile();
  await json(ambiguous, ['leetcode-policy', 'set', ambiguous.input]);
  addProblem('problem-7');
  const otherRecord = addProblem('problem-7');
  const existingSameUrl = { ...emptyEntry(), tasks: [task('existing-same-url', 'Existing problem task', { leetcodeProblemId: otherRecord.id })] };
  entries.set('2026-10-25', structuredClone(existingSameUrl));
  const beforeAmbiguousPlan = writes();
  const ambiguousResult = await run(ambiguous, ['leetcode-plan', '2026-10-25'], {}, 1);
  assert.match(ambiguousResult.stderr, /multiple records for a selected LeetCode URL/);
  assert.equal(writes(), beforeAmbiguousPlan, 'duplicate library URLs are rejected before any problem or schedule write');
  assert.deepEqual(entryFor('2026-10-25'), existingSameUrl, 'the existing task linked to the other library record is preserved');
  assert.equal((await json(ambiguous, ['leetcode-next', '2026-10-25'])).slots[0].status, 'selected', 'a saved unbound selection remains readable for reconciliation');

  // Local account binding fails before a different account can read or change the private plan.
  const beforeBindingFiles = await snapshotFiles(partial);
  const beforeBindingRequests = requests.length;
  const lockPath = join(partial.home, 'data/daybook/leetcode-policy.lock');
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
  try { await run(partial, ['leetcode-plan', '2026-10-20'], {}, 1); }
  finally { await rm(lockPath); }
  assert.equal(requests.length, beforeBindingRequests, 'an existing profile lock blocks remote writes before any API access');
  assert.deepEqual(await snapshotFiles(partial), beforeBindingFiles, 'a lock conflict preserves the existing policy and ledger');
  await run(partial, ['leetcode-policy'], { CALENDAR_AGENT_TOKEN: otherToken }, 1);
  await run(partial, ['leetcode-next', '2026-10-20'], { CALENDAR_AGENT_TOKEN: otherToken }, 1);
  await run(partial, ['leetcode-plan', '2026-10-20'], { CALENDAR_AGENT_TOKEN: otherToken }, 1);
  assert.equal(requests.length, beforeBindingRequests, 'a mismatched account is rejected before contacting the API');
  assert.deepEqual(await snapshotFiles(partial), beforeBindingFiles);
  const different = structuredClone(partial.policy);
  different.main.completedCount = 5;
  const differentFile = join(partial.home, 'different-policy.json');
  await writeFile(differentFile, JSON.stringify(different));
  await run(partial, ['leetcode-policy', 'set', differentFile], {}, 1);
  assert.deepEqual(await snapshotFiles(partial), beforeBindingFiles, 'a changed policy cannot discard existing progress or daily selections');
  const privateDirectory = await readdir(join(partial.home, 'data/daybook'));
  assert.ok(privateDirectory.includes('leetcode-policy.json') && privateDirectory.includes('leetcode-plans.json'));

  console.log('LeetCode policy: explicit baseline, role-aware progress, fixed daily plans, cancellation, private binding, and partial-write recovery passed.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  for (const home of profiles) {
    assert.equal(dirname(resolve(home)), resolve(tmpdir()), 'cleanup remains within the test temporary directory');
    assert.ok(basename(home).startsWith('daybook-leetcode-policy-'));
    await rm(home, { recursive: true, force: true });
  }
}
