import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

// Real routes/schema + standalone CLI, synthetic users and in-memory storage.
// No .env files, production connections, or real credentials are loaded.
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
      sqlite.exec('COMMIT');
      return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
globalThis.__attemptUpdateEnv = { DB: db };
const bundle = await build({
  stdin: { contents: `import * as leetcode from './app/api/leetcode/route'; import * as entries from './app/api/entries/route'; export { leetcode, entries };`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'synthetic-attempt-update-bindings', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    builder.onResolve({ filter: /(?:^|\/)calendar-auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env'
      ? 'export const env = globalThis.__attemptUpdateEnv;'
      : `export async function getAuthorizedOwnerId(request) {
          return request.headers.get('authorization') === 'Bearer test-alice' ? 'test:alice'
            : request.headers.get('authorization') === 'Bearer test-bob' ? 'test:bob' : null;
        }` }));
  } }],
});
const routes = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const requests = [];
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
    const url = new URL(incoming.url, 'http://localhost');
    requests.push({ method: incoming.method, path: url.pathname, body: body ? JSON.parse(body) : undefined });
    const route = url.pathname === '/api/leetcode' ? routes.leetcode : routes.entries;
    const response = await route[incoming.method](new Request(url, { method: incoming.method, headers: incoming.headers, ...(body ? { body } : {}) }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
  } catch (error) { outgoing.writeHead(500); outgoing.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const execute = promisify(execFile);
const date = '2026-10-17';
async function cli(...args) {
  return (await execute(process.execPath, ['scripts/calendar-agent.mjs', ...args], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CALENDAR_API_URL: url, CALENDAR_AGENT_TOKEN: 'test-alice' },
    timeout: 15_000,
  })).stdout;
}
const library = async () => JSON.parse(await cli('leetcode'));
const day = async () => JSON.parse(await cli('get', date));
const post = (body, token = 'test-alice') => routes.leetcode.POST(new Request('https://test/api/leetcode', {
  method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
}));
try {
  await cli('leetcode-add', date, 'easy', '121. Synthetic problem', 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/');
  await cli('leetcode-add', date, 'medium', '3551. Synthetic problem', 'https://leetcode.com/problems/minimum-swaps-to-sort-by-digit-sum/');
  const tasks = (await day()).tasks;
  for (const problem of await library()) {
    await cli('leetcode-attempt', problem.id, date, 'solved', 'Reported practice; actual outcome and notes were missing.', tasks.find(task => task.leetcodeProblemId === problem.id).id);
  }
  const before = await library();
  const beforeDay = await day();
  const first = before[0];
  const original = first.attempts[0];
  const notes = 'Used the minimum price so far; update the best profit each day.';
  const corrected = JSON.parse(await cli('leetcode-attempt-update', first.id, original.id, 'hinted', notes));
  assert.equal(corrected.changed, true);
  assert.deepEqual(corrected.attempt, { ...original, status: 'hinted', notes });
  assert.deepEqual((await library())[1], before[1], 'unrelated problem/history preserved');
  assert.deepEqual(await day(), beforeDay, 'correction does not alter tasks or day notes');
  const beforeRetry = requests.filter(r => r.method === 'POST').length;
  assert.equal(JSON.parse(await cli('leetcode-attempt-update', first.id, original.id, 'hinted', notes)).changed, false);
  assert.equal(requests.filter(r => r.method === 'POST').length, beforeRetry, 'same correction is read-only');
  const body = { action: 'update-attempt', problemId: first.id, attemptId: original.id, status: 'stuck', notes: 'Still working on the approach.', expectedStatus: original.status, expectedNotes: original.notes };
  assert.equal((await post(body)).status, 409, 'stale content cannot overwrite a concurrent correction');
  assert.equal((await post({ ...body, expectedStatus: 'hinted', expectedNotes: notes }, 'test-bob')).status, 404, 'account ownership enforced');
  assert.equal((await post(body, 'invalid')).status, 401);
  assert.equal((await post({ ...body, problemId: before[1].id })).status, 404, 'attempt must belong to the selected problem');
  for (const invalid of [{ notes: '' }, { notes: 'x'.repeat(10_001) }, { status: 'done' }, { expectedNotes: '' }, { expectedStatus: null }]) {
    assert.equal((await post({ ...body, ...invalid })).status, 400);
  }
  assert.deepEqual((await library())[0].attempts, [{ ...original, status: 'hinted', notes }], 'rejected updates keep original identity and history');
  const invalidBefore = requests.length;
  await assert.rejects(cli('leetcode-attempt-update', first.id, original.id, 'done', notes));
  await assert.rejects(cli('leetcode-attempt-update', first.id, original.id, 'solved', ''));
  assert.equal(requests.length, invalidBefore, 'CLI rejects bad arguments before network calls');
  const posts = requests.filter(r => r.body?.action === 'update-attempt');
  assert.equal(posts.length, 1);
  assert.ok(requests.slice(requests.indexOf(posts[0]) + 1).some(r => r.method === 'GET' && r.path === '/api/leetcode'), 'CLI verifies by reading back');
  console.log('PASS: original attempt correction, immutable history/date/task link, no duplicates, readback, ownership, validation, and concurrent edit protection.');
} finally {
  await new Promise(resolve => server.close(resolve));
  sqlite.close();
  delete globalThis.__attemptUpdateEnv;
}
