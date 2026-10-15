import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { localDate, periodRange } from './calendar-agent-workflows.mjs';

// Run only against this isolated HTTP mock. Never load .env.local or real accounts.
const execute = promisify(execFile);
const script = fileURLToPath(new URL('./calendar-agent.mjs', import.meta.url));
const token = 'mock-account-secret';
const requests = [];
const entries = new Map();
let responseMode = 'normal';
let revision = 0;
const emptyEntry = () => ({ tasks: [], activity: '', reflection: '', revision: null });
const task = (id, text, done = false, extra = {}) => ({ id, text, done, cycleId: null, phaseId: null, sectionId: null, recurrenceId: null, deadline: null, habitCue: null, tinyStart: null, identity: null, leetcodeProblemId: null, ...extra });
entries.set('2026-10-15', {
  tasks: [task('routine', 'Morning walk', true, { recurrenceId: 'daily-walk', streak: 3 }), task('meeting', '14:00 Team meeting'), task('deadline', 'Finish report', false, { recurrenceId: 'report-series', deadline: '2026-10-17' })],
  activity: 'Existing activity', reflection: 'Existing reflection.\nKeep this paragraph.', revision: 'initial',
});
entries.set('2026-10-16', { tasks: [task('read', 'Read', true)], activity: '', reflection: '', revision: 'next' });
const sections = [{ id: 'morning', title: 'Morning' }, { id: 'afternoon', title: 'Afternoon' }];
const cycles = [
  { id: 'active', title: 'Study', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', phases: [] },
  { id: 'past', title: 'Past', status: 'active', startDate: '2026-08-01', endDate: '2026-08-31', phases: [] },
  { id: 'complete', title: 'Complete', status: 'completed', startDate: '2026-10-01', endDate: '2026-10-31', phases: [] },
];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
  requests.push({ method: request.method, path: url.pathname, date: url.searchParams.get('date'), headers: request.headers, body });
  const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
  if (responseMode === 'html-error') { response.writeHead(502, { 'Content-Type': 'text/html' }); response.end(`<html>${token} private database stack</html>`); return; }
  if (responseMode === 'invalid-json') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(`<html>${token}</html>`); return; }
  if (responseMode === 'redirect') { response.writeHead(302, { Location: '/redirected-private-url' }); response.end(); return; }
  if (request.headers.authorization !== `Bearer ${token}`) { json({ error: token }, 401); return; }
  if (url.pathname === '/api/entries') {
    if (request.method === 'GET') { json(entries.get(url.searchParams.get('date')) ?? emptyEntry()); return; }
    if (request.method === 'PUT') {
      const old = entries.get(body.date) ?? emptyEntry();
      if (responseMode === 'conflict' || old.revision !== body.revision) { json({ error: `${token} private conflict` }, 409); return; }
      const { date, ...entry } = body;
      entry.revision = `revision-${++revision}`;
      entries.set(date, entry);
      json({ ok: true, revision: entry.revision });
      return;
    }
  }
  if (url.pathname === '/api/day-sections') { json({ sections }); return; }
  if (url.pathname === '/api/cycles') { json({ cycles }); return; }
  json({ error: 'Unexpected test route' }, 404);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const apiUrl = `http://127.0.0.1:${server.address().port}`;

// Deliberately avoid inheriting NODE_OPTIONS, account tokens, and env-file flags.
const environment = {
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
  CALENDAR_API_URL: apiUrl,
  CALENDAR_AGENT_TOKEN: token,
  CALENDAR_TIMEZONE: 'Asia/Taipei',
  TZ: 'UTC',
};
async function run(args, overrides = {}, expectedCode = 0) {
  let result;
  try { result = { ...(await execute(process.execPath, [script, ...args], { env: { ...environment, ...overrides }, timeout: 15_000 })), code: 0 }; }
  catch (error) { result = error; }
  assert.equal(result.code, expectedCode, `${args.join(' ')}: ${result.stderr}`);
  assert.ok(!result.stdout.includes(token) && !result.stderr.includes(token), 'never print credentials');
  return result;
}
const json = async (...args) => JSON.parse((await run(...args)).stdout);
const writes = () => requests.filter((request) => request.method !== 'GET').length;

try {
  const help = await run(['help'], { CALENDAR_API_URL: '', CALENDAR_AGENT_TOKEN: '', CALENDAR_TIMEZONE: 'invalid' });
  assert.match(help.stdout, /today.*\[YYYY-MM-DD\]/);
  assert.match(help.stdout, /Sites bypass|CALENDAR_SITES_BYPASS_TOKEN/);
  await run([], { CALENDAR_API_URL: '', CALENDAR_AGENT_TOKEN: '' });
  await run(['unknown'], {}, 1);
  await run(['today'], { CALENDAR_API_URL: '', CALENDAR_AGENT_TOKEN: '' }, 1);
  await run(['today'], { CALENDAR_API_URL: 'http://calendar.example.com' }, 1);
  await run(['today'], { CALENDAR_API_URL: 'https://name:pass@example.com' }, 1);
  await run(['today'], { CALENDAR_TIMEZONE: 'invalid' }, 1);
  assert.equal(requests.length, 0, 'configuration errors never call the API');

  assert.equal(localDate('Asia/Taipei', new Date('2026-10-14T16:01:00Z')), '2026-10-15');
  assert.equal(localDate('America/Los_Angeles', new Date('2026-10-15T01:00:00Z')), '2026-10-14');
  assert.deepEqual(periodRange('week', '2026-10-18'), ['2026-10-12', '2026-10-18']);
  assert.deepEqual(periodRange('week', '2027-01-01'), ['2026-12-28', '2027-01-03']);
  assert.deepEqual(periodRange('month', '2028-02-15'), ['2028-02-01', '2028-02-29']);
  const today = await json(['today', '2026-10-15']);
  assert.equal(today.timezone, 'Asia/Taipei');
  assert.equal(today.asOfDate, localDate('Asia/Taipei'));
  assert.equal(today.tasks.length, 3);
  assert.equal(today.tasks[0].recurrenceId, 'daily-walk');
  assert.deepEqual(today.routines.map((item) => item.id), ['routine']);
  assert.deepEqual(today.counts, { total: 3, completed: 1, pending: 2, completionRate: 1 / 3 });
  assert.equal(today.activity, 'Existing activity');
  assert.match(today.reflection, /Keep this paragraph/);
  assert.equal(requests.at(-1).headers.authorization, `Bearer ${token}`);
  assert.equal(requests.at(-1).headers['oai-sites-authorization'], undefined);
  await json(['today', '2026-10-15'], { CALENDAR_SITES_BYPASS_TOKEN: 'mock-bypass' });
  assert.equal(requests.at(-1).headers['oai-sites-authorization'], 'Bearer mock-bypass');
  const current = await json(['today'], { CALENDAR_TIMEZONE: 'Pacific/Kiritimati' });
  assert.equal(current.date, localDate('Pacific/Kiritimati'));

  const beforeInvalid = requests.length;
  for (const args of [
    ['get', '2026-02-30'], ['today', '2026-2-01'], ['agenda', '2026-10-01', '2026-11-01'],
    ['plan', '2026-10-17', '2026-10-15'], ['summary', 'year'], ['record', '2026-10-15', ' '],
    ['done', '2026-10-15', 'meeting', 'yes'], ['review', '2026-10-15', ' '],
    ['repeat', '2026-10-15', 'Task', 'day', '0', 'count', '1'],
    ['repeat', '2026-10-15', 'Task', 'day', '1', 'count', 'no'],
    ['short', '2026-10-15', 'Task', '2026-10-14'],
  ]) await run(args, {}, 1);
  assert.equal(requests.length, beforeInvalid, 'invalid input is rejected before network calls');

  const agenda = await json(['agenda', '2026-10-15', '2026-10-16']);
  assert.deepEqual(agenda.days.map((day) => day.date), ['2026-10-15', '2026-10-16']);
  assert.deepEqual(agenda.counts, { total: 4, completed: 2, pending: 2, completionRate: 0.5 });
  assert.equal((await json(['agenda', '2026-10-15'])).days.length, 7);
  const week = await json(['summary', 'week', '2026-10-15']);
  assert.equal(week.startDate, '2026-10-12');
  assert.equal(week.endDate, '2026-10-18');
  assert.equal(week.days.length, 7);
  assert.equal(week.counts.completionRate, 0.5);
  const elapsedDays = week.days.filter((day) => day.date <= week.asOfDate);
  const elapsedTasks = elapsedDays.flatMap((day) => day.tasks);
  const elapsedCompleted = elapsedTasks.filter((item) => item.done).length;
  assert.deepEqual(week.elapsedCounts, elapsedDays.length ? { total: elapsedTasks.length, completed: elapsedCompleted, pending: elapsedTasks.length - elapsedCompleted, completionRate: elapsedTasks.length ? elapsedCompleted / elapsedTasks.length : null } : null);
  const month = await json(['summary', 'month', '2026-10-15']);
  assert.equal(month.days.length, 31);
  assert.equal(month.startDate, '2026-10-01');
  assert.equal(month.endDate, '2026-10-31');
  const empty = await json(['summary', 'day', '2026-10-01']);
  assert.deepEqual(empty.counts, { total: 0, completed: 0, pending: 0, completionRate: null });
  const future = await json(['summary', 'week', '9998-10-15']);
  assert.equal(future.elapsedCounts, null);
  assert.equal(future.elapsedRoutineCounts, null);
  const plan = await json(['plan', '2026-10-15', '2026-10-16']);
  assert.deepEqual(plan.sections, sections);
  assert.deepEqual(plan.cycles.map((cycle) => cycle.id), ['active']);
  assert.equal(plan.loadBasis, 'task-count-only');
  assert.deepEqual(plan.load[0], { date: '2026-10-15', tasks: 3, pending: 2, routines: 1, otherTasks: 2 });
  assert.equal(writes(), 0, 'today/agenda/summary/plan do not mutate calendar content');

  const beforeRecord = structuredClone(entries.get('2026-10-15'));
  const recorded = await json(['record', '2026-10-15', '  １４：００   Dentist appointment  ']);
  assert.equal(recorded.created, true);
  assert.equal(recorded.task.text, '14:00 Dentist appointment');
  assert.equal(requests.at(-2).method, 'PUT');
  assert.equal(requests.at(-2).body.revision, 'initial');
  assert.equal(requests.at(-1).method, 'GET', 'read back after writing');
  const afterRecord = entries.get('2026-10-15');
  assert.deepEqual(afterRecord.tasks.slice(0, 3), beforeRecord.tasks);
  assert.equal(afterRecord.activity, beforeRecord.activity);
  assert.equal(afterRecord.reflection, beforeRecord.reflection);
  const beforeDuplicate = writes();
  const duplicate = await json(['record', '2026-10-15', '14:00 Dentist appointment']);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.task.id, recorded.task.id);
  assert.equal(writes(), beforeDuplicate, 'normalized duplicate makes no write');

  const done = await json(['done', '2026-10-15', 'meeting']);
  assert.equal(done.changed, true);
  assert.equal(done.task.done, true);
  const beforeDone = writes();
  assert.equal((await json(['done', '2026-10-15', 'meeting'])).changed, false);
  assert.equal(writes(), beforeDone, 'done is idempotent');
  const reopened = await json(['done', '2026-10-15', 'meeting', 'false']);
  assert.equal(reopened.task.done, false);
  const beforeMissing = writes();
  await run(['done', '2026-10-15', 'missing'], {}, 1);
  assert.equal(writes(), beforeMissing);

  const reviewContext = await json(['review', '2026-10-15']);
  assert.equal(reviewContext.appended, false);
  assert.equal(writes(), beforeMissing);
  const reviewed = await json(['review', '2026-10-15', 'The meeting went well.']);
  assert.equal(reviewed.appended, true);
  assert.equal(reviewed.reflection, `${beforeRecord.reflection}\n\nThe meeting went well.`);
  assert.equal(reviewed.activity, beforeRecord.activity);
  assert.equal(requests.at(-1).method, 'GET');

  const beforeConflict = structuredClone(entries.get('2026-10-15'));
  responseMode = 'conflict';
  const conflict = await run(['record', '2026-10-15', 'Must not overwrite'], {}, 1);
  assert.match(conflict.stderr, /HTTP 409/);
  assert.match(conflict.stderr, /Read the latest data/);
  assert.deepEqual(entries.get('2026-10-15'), beforeConflict);
  responseMode = 'html-error';
  const failed = await run(['today', '2026-10-15'], {}, 1);
  assert.match(failed.stderr, /HTTP 502/);
  assert.ok(!failed.stderr.includes('<html>') && !failed.stderr.includes('stack'));
  responseMode = 'invalid-json';
  assert.match((await run(['today', '2026-10-15'], {}, 1)).stderr, /invalid JSON/);
  responseMode = 'redirect';
  const beforeRedirect = requests.length;
  assert.match((await run(['today', '2026-10-15'], {}, 1)).stderr, /Unable to reach/);
  assert.equal(requests.length, beforeRedirect + 1, 'do not follow redirects with account credentials');
  responseMode = 'normal';
  // Legacy commands retain their behavior, including deliberate overwrite notes.
  await run(['reflection', '2026-10-15', 'Replacement reflection']);
  assert.equal(entries.get('2026-10-15').reflection, 'Replacement reflection');
  await run(['add', '2026-10-15', 'Legacy task']);
  assert.equal(entries.get('2026-10-15').tasks.at(-1).text, 'Legacy task');
  console.log('Calendar agent mock integration checks passed (no live calendar or .env.local).');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
