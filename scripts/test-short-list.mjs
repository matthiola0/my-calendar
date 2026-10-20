import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

// Real routes and CLI; only Worker bindings and identities are synthetic.
// No .env files, real calendars, or production network access.
const sqlite = new DatabaseSync(':memory:');
const db = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
    };
    return statement;
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT'); return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
globalThis.__shortListEnv = { DB: db };
const bundle = await build({
  stdin: { contents: `import * as short from './app/api/short-tasks/route'; import * as entries from './app/api/entries/route'; import * as recurring from './app/api/recurring-tasks/route'; export { short, entries, recurring };`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'synthetic-short-list-bindings', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    builder.onResolve({ filter: /(?:^|\/)calendar-auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env'
      ? 'export const env = globalThis.__shortListEnv;'
      : `export async function getAuthorizedOwnerId(request) {
          return request.headers.get('authorization') === 'Bearer test-alice' ? 'test:alice'
            : request.headers.get('authorization') === 'Bearer test-bob' ? 'test:bob' : null;
        }` }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const requests = [];
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
    const url = new URL(incoming.url, 'http://localhost');
    requests.push({ method: incoming.method, path: url.pathname });
    const route = url.pathname === '/api/short-tasks' ? api.short : url.pathname === '/api/recurring-tasks' ? api.recurring : api.entries;
    const response = await route[incoming.method](new Request(url, { method: incoming.method, headers: incoming.headers, ...(body ? { body } : {}) }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
  } catch (error) { outgoing.writeHead(500); outgoing.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const execute = promisify(execFile);
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CALENDAR_API_URL: url, CALENDAR_AGENT_TOKEN: 'test-alice', CALENDAR_TIMEZONE: 'Asia/Taipei' };
async function cli(args, overrides = {}) {
  return (await execute(process.execPath, ['scripts/calendar-agent.mjs', ...args], { env: { ...env, ...overrides }, timeout: 15_000 })).stdout;
}
const json = async (...args) => JSON.parse(await cli(args));
const state = () => JSON.stringify({ tasks: sqlite.prepare('SELECT * FROM tasks ORDER BY owner_id, date, id').all(), days: sqlite.prepare('SELECT * FROM day_entries ORDER BY owner_id,date').all() });
const read = (date, token = 'test-alice') => api.short.GET(new Request(`https://test/api/short-tasks${date === null ? '' : '?date=' + date}`, { headers: { authorization: `Bearer ${token}` } }));
try {
  await cli(['short', '2026-07-30', 'Old overdue work', '2026-07-31']);
  await cli(['short', '2026-10-11', 'Eight days overdue', '2026-10-12']);
  await cli(['short', '2026-10-12', 'Seven days overdue', '2026-10-13']);
  await cli(['short', '2026-10-13', 'Six days overdue', '2026-10-14']);
  await cli(['short', '2026-10-19', 'Report', '2026-10-22']);
  await cli(['short', '2026-10-21', 'Report', '2026-10-23']);
  await cli(['short', '2027-01-01', 'Future work', '2027-01-02']);
  await cli(['short', '2026-10-01', 'All completed', '2026-10-02']);
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-19']) {
    const day = await json('get', date);
    for (const task of day.tasks) await cli(['done', date, task.id, 'true']);
  }
  const day = await json('get', '2026-10-20');
  await cli(['rename', '2026-10-20', day.tasks[0].id, 'Report updated']);
  await cli(['add', '2026-10-20', 'Ordinary task']);
  await cli(['repeat', '2026-10-20', 'Routine', 'day', '1', 'count', '2']);
  const before = state();
  const beforeRequests = requests.length;
  const result = await json('short-list', '2026-10-20');
  assert.equal(result.asOfDate, '2026-10-20');
  assert.deepEqual(result.counts, { total: 5, overdue: 2, active: 1, upcoming: 2 });
  assert.deepEqual(result.tasks.map(task => task.deadline), ['2026-10-13', '2026-10-14', '2026-10-22', '2026-10-23', '2027-01-02']);
  assert.equal(result.tasks[0].text, 'Seven days overdue', 'exactly seven days overdue is retained');
  const report = result.tasks[2];
  assert.equal(report.text, 'Report updated');
  assert.equal(report.totalOccurrences, 4);
  assert.equal(report.completedOccurrences, 1);
  assert.equal(report.pendingOccurrences, 3);
  assert.equal(report.elapsedPendingOccurrences, 1);
  assert.equal(report.futurePendingOccurrences, 2);
  assert.notEqual(report.recurrenceId, result.tasks[3].recurrenceId, 'same title in separate series stays separate');
  assert.equal(result.tasks[4].status, 'upcoming', 'distant future work is included');
  const earlier = await json('short-list', '2026-10-19');
  assert.ok(earlier.tasks.some(task => task.text === 'Eight days overdue'), 'cutoff follows the requested as-of date');
  const monthBoundary = await json('short-list', '2026-08-07');
  assert.ok(monthBoundary.tasks.some(task => task.text === 'Old overdue work'), 'seven days across a month boundary is retained');
  const expired = await json('short-list', '2026-08-08');
  assert.ok(!expired.tasks.some(task => task.text === 'Old overdue work'), 'eight days overdue is hidden');
  assert.equal(requests.slice(beforeRequests).filter(r => r.method !== 'GET').length, 0, 'listing is read-only');
  const response = await read('2026-10-20');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await read('2026-10-20', 'invalid')).status, 401);
  assert.deepEqual((await (await read('2026-10-20', 'test-bob')).json()).tasks, [], 'accounts are isolated');
  for (const date of [null, '2026-02-30', '2026-2-1']) assert.equal((await read(date)).status, 400);
  assert.equal(state(), before, 'all tasks, notes, and revisions stay unchanged');
  const count = requests.length;
  await assert.rejects(cli(['short-list', '2026-02-30']));
  await assert.rejects(cli(['short-list', '2026-10-20', 'extra']));
  assert.equal(requests.length, count, 'bad CLI input rejected before network');
  const timezone = 'Pacific/Kiritimati';
  const defaultResult = JSON.parse(await cli(['short-list'], { CALENDAR_TIMEZONE: timezone }));
  assert.equal(defaultResult.asOfDate, new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date()));
  console.log('PASS: grouped short-term tasks, inclusive seven-day overdue cutoff, as-of dates, future coverage, checked/remaining occurrences, ownership, timezone, validation, and read-only CLI.');
} finally {
  await new Promise(resolve => server.close(resolve));
  sqlite.close(); delete globalThis.__shortListEnv;
}
