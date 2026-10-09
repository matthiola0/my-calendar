import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

// Run the actual queries and apply transaction against an isolated in-memory DB.
// No application credentials, account content, or network calls are used.
const sqlite = new DatabaseSync(':memory:');
const db = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async run() { return sqlite.prepare(sql).run(...values); },
    };
    return statement;
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sqlite.exec('COMMIT');
      return result;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
globalThis.__plannerTestEnv = { DB: db, GROQ_API_KEY: 'test-only' };
const bundle = await build({
  stdin: { contents: `export * from './app/lib/planner-calendar'; export * from './app/lib/planner-ai'; export * from './db/ensure-schema';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'test-worker-env', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const env = globalThis.__plannerTestEnv;' }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
await api.ensureSchema();
for (const owner of ['alice', 'bob']) {
  sqlite.prepare('INSERT INTO leetcode_problems (id, owner_id, title, difficulty, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)')
    .run('two-sum', owner, owner === 'alice' ? '1. Two Sum' : 'PRIVATE BOB PROBLEM', 'easy');
}
sqlite.prepare('INSERT INTO leetcode_problems (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
  .run('bob-only', 'bob', 'Private problem');
const addAttempt = sqlite.prepare('INSERT INTO leetcode_attempts (id, owner_id, problem_id, attempted_on, status, notes, attempt_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)');
addAttempt.run('a1', 'alice', 'two-sum', '2026-10-08', 'hinted', 'Need to explain the hash map invariant.', 1, 1);
addAttempt.run('b1', 'bob', 'two-sum', '2026-10-08', 'stuck', 'PRIVATE BOB NOTES', 1, 1);
addAttempt.run('a-old', 'alice', 'two-sum', '2026-09-09', 'stuck', 'OUTSIDE WINDOW', 2, 2);
addAttempt.run('a-future', 'alice', 'two-sum', '2026-10-10', 'solved', 'FUTURE RECORD', 3, 3);
const addTask = sqlite.prepare('INSERT INTO tasks (id, owner_id, date, text, done, leetcode_problem_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)');
addTask.run('missed', 'alice', '2026-10-07', 'LeetCode · Two Sum', 0, 'two-sum');
addTask.run('done', 'alice', '2026-10-08', 'LeetCode · Two Sum', 1, 'two-sum');
addTask.run('b-task', 'bob', '2026-10-08', 'PRIVATE BOB TASK', 0, 'two-sum');

const ordinary = await api.loadPlanningContext('alice', '2026-10-10', '2026-10-16');
assert.equal(ordinary.practice, undefined, 'ordinary planning does not load practice');
const context = await api.loadPlanningContext('alice', '2026-10-10', '2026-10-16', '2026-10-09');
assert.equal(context.practice.since, '2026-09-10');
assert.equal(context.practice.attempts.length, 1);
assert.equal(context.practice.attempts[0].status, 'hinted');
assert.deepEqual(context.practice.sessions.map(s => s.done), [true, false]);
assert.ok(!JSON.stringify(context).includes('PRIVATE'));
assert.ok(!JSON.stringify(context).includes('FUTURE RECORD'));

const raw = { summary: 'Review the hash map invariant before new material.', cycle: null, tasks: [{ date: '2026-10-10', text: 'Review Two Sum — 30 minutes', leetcodeProblemId: 'two-sum', sectionId: null, cycleLink: null }] };
const validation = { startDate: '2026-10-10', endDate: '2026-10-16', cycles: [], sections: [], practice: context.practice };
const proposal = api.parseProposal(raw, validation);
assert.throws(() => api.parseProposal({ ...raw, tasks: [{ ...raw.tasks[0], leetcodeProblemId: 'bob-only' }] }, validation));
assert.throws(() => api.parseProposal(raw, { ...validation, practice: undefined }));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.ok(request.messages[0].content.includes('Need to explain the hash map invariant.'));
  assert.ok(request.messages[0].content.includes('untrusted user data'));
  assert.ok(!request.messages[0].content.includes('PRIVATE BOB'));
  return Response.json({ choices: [{ message: { content: JSON.stringify({ message: 'Based on the October 8 hinted attempt, review Two Sum.', questions: [], proposal: raw }) } }] });
};
try {
  const reply = await api.createPlannerReply([{ role: 'user', content: 'Prepare for interviews in four weeks, 4 hours weekly.' }], '2026-10-09', 'Asia/Taipei', context, 'en');
  assert.equal(reply.proposal.tasks[0].leetcodeProblemId, 'two-sum');
} finally { globalThis.fetch = originalFetch; }

const before = sqlite.prepare('SELECT * FROM tasks WHERE id IN (?, ?) ORDER BY id').all('missed', 'done');
assert.equal((await api.applyPlannerProposal('alice', proposal)).tasksCreated, 1);
assert.equal(sqlite.prepare('SELECT leetcode_problem_id FROM tasks WHERE owner_id = ? AND date = ?').get('alice', '2026-10-10').leetcode_problem_id, 'two-sum');
assert.equal((await api.applyPlannerProposal('alice', proposal)).tasksSkipped, 1);
assert.deepEqual(sqlite.prepare('SELECT * FROM tasks WHERE id IN (?, ?) ORDER BY id').all('missed', 'done'), before);
await assert.rejects(() => api.applyPlannerProposal('alice', { ...proposal, tasks: [{ ...proposal.tasks[0], leetcodeProblemId: 'bob-only' }] }), error => error.status === 409);
await assert.rejects(() => api.applyPlannerProposal('alice', { ...proposal, tasks: [{ ...proposal.tasks[0], leetcodeProblemId: 'deleted' }] }), error => error.status === 409);

for (let i = 0; i < 65; i++) addAttempt.run(`more-${i}`, 'alice', 'two-sum', '2026-10-09', 'reviewed', 'x'.repeat(800), i + 10, i + 10);
for (let i = 0; i < 105; i++) addTask.run(`task-${i}`, 'alice', '2026-10-09', 'Review', 0, 'two-sum');
const bounded = await api.loadPlanningContext('alice', '2026-10-10', '2026-10-16', '2026-10-09');
assert.equal(bounded.practice.attempts.length, 60);
assert.equal(bounded.practice.sessions.length, 100);
assert.equal(bounded.practice.attempts[0].notes.length, 500);
assert.equal((await api.loadPlanningContext('nobody', '2026-10-10', '2026-10-16', '2026-10-09')).practice.attempts.length, 0);
sqlite.close();
delete globalThis.__plannerTestEnv;
console.log('PASS: opt-in context, date bounds, account isolation, note/row limits, model context, proposal validation, linked apply, duplicate apply, and preservation of existing tasks.');
