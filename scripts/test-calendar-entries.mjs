import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

// Exercise the real entries API and schema against synthetic in-memory D1.
// Only authentication and the Worker environment are mocked; no user data or network.
const sqlite = new DatabaseSync(':memory:');
const db = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
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

globalThis.__calendarEntriesTestEnv = { DB: db };
try {
  const bundle = await build({
    entryPoints: ['app/api/entries/route.ts'],
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'test-worker-and-calendar-auth', setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
      builder.onResolve({ filter: /(?:^|\/)calendar-auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env'
        ? 'export const env = globalThis.__calendarEntriesTestEnv;'
        : `export async function getAuthorizedOwnerId(request) {
            const cookie = request.headers.get('cookie');
            return cookie === 'test=alice' ? 'password:alice'
              : cookie === 'test=bob' ? 'google:bob' : null;
          }` }));
    } }],
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const date = '2026-10-16';
  const alice = 'test=alice';
  const bob = 'test=bob';
  const task = (id, overrides = {}) => ({ id, text: 'Synthetic task', done: false, ...overrides });
  const entry = (tasks, overrides = {}) => ({ date, tasks, activity: '', reflection: '', revision: null, ...overrides });
  const request = (method, body, cookie = alice, query = `?date=${date}`) => new Request(`https://calendar.test/api/entries${query}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const readResponse = (on = date, cookie = alice) => api.GET(request('GET', undefined, cookie, `?date=${on}`));
  const read = async (on = date, cookie = alice) => {
    const response = await readResponse(on, cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  };
  const write = (body, cookie = alice) => api.PUT(request('PUT', body, cookie));
  const state = () => JSON.stringify({
    days: sqlite.prepare('SELECT * FROM day_entries ORDER BY owner_id, date').all(),
    tasks: sqlite.prepare('SELECT * FROM tasks ORDER BY owner_id, date, position').all(),
  });
  const rejected = async (body, status = 400, cookie = alice) => {
    const before = state();
    const response = await write(body, cookie);
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, 'string');
    assert.equal(state(), before, 'rejected writes preserve entries, revisions, timestamps, and tasks');
  };

  assert.equal((await api.GET(request('GET', undefined, null))).status, 401);
  assert.equal((await write(entry([]), null)).status, 401);
  for (const query of ['', '?date=2026-02-30', '?date=2026-2-01', '?date=2025-02-29']) {
    assert.equal((await api.GET(request('GET', undefined, alice, query))).status, 400);
  }
  const malformed = new Request('https://calendar.test/api/entries', {
    method: 'PUT', headers: { cookie: alice, 'content-type': 'application/json' }, body: '{',
  });
  assert.equal((await api.PUT(malformed)).status, 400);
  const empty = { tasks: [], activity: '', reflection: '', revision: null };
  assert.deepEqual(await read(), empty);
  assert.deepEqual(await read('2024-02-29'), empty, 'valid leap dates are accepted');

  // Reference fixtures use the real schema initialized by GET.
  for (const [ownerId, prefix] of [['password:alice', 'alice'], ['google:bob', 'bob']]) {
    for (const suffix of ['', '-other']) {
      sqlite.prepare(`INSERT INTO cycles
        (id, owner_id, title, goal, start_date, end_date, created_at, updated_at)
        VALUES (?, ?, 'Synthetic cycle', '', '2026-10-01', '2026-10-31', 1, 1)`)
        .run(`${prefix}-cycle${suffix}`, ownerId);
    }
    sqlite.prepare(`INSERT INTO cycle_phases
      (id, cycle_id, owner_id, title, start_date, end_date, position, created_at, updated_at)
      VALUES (?, ?, ?, 'Synthetic phase', '2026-10-01', '2026-10-31', 0, 1, 1)`)
      .run(`${prefix}-phase`, `${prefix}-cycle`, ownerId);
    sqlite.prepare(`INSERT INTO day_sections (id, owner_id, title, position, created_at, updated_at)
      VALUES (?, ?, 'Synthetic section', 0, 1, 1)`).run(`${prefix}-section`, ownerId);
    sqlite.prepare(`INSERT INTO leetcode_problems (id, owner_id, title, created_at, updated_at)
      VALUES (?, ?, 'Synthetic problem', 1, 1)`).run(`${prefix}-problem`, ownerId);
  }

  const initial = entry([
    task('shared-task-id', { text: '  First task  ' }),
    task('metadata-task', {
      done: true, cycleId: 'alice-cycle', phaseId: 'alice-phase', sectionId: 'alice-section',
      leetcodeProblemId: 'alice-problem', habitCue: '  After breakfast  ', tinyStart: '  Open editor  ', identity: '  I practise  ',
      streak: 999, recoveryDue: true,
    }),
    task('blank-habit', { habitCue: ' \t ', tinyStart: '', identity: '  ' }),
  ], { activity: 'Synthetic activity', reflection: 'Synthetic reflection' });
  const createdResponse = await write(initial);
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.equal(created.ok, true);
  assert.match(created.revision, /^[a-f0-9-]{36}$/);
  assert.equal(typeof created.updatedAt, 'number');
  const saved = await read();
  assert.deepEqual(saved, {
    tasks: [
      { id: 'shared-task-id', text: 'First task', done: false, cycleId: null, phaseId: null, sectionId: null,
        recurrenceId: null, deadline: null, habitCue: null, tinyStart: null, identity: null,
        leetcodeProblemId: null, streak: 0, recoveryDue: false },
      { id: 'metadata-task', text: 'Synthetic task', done: true, cycleId: 'alice-cycle', phaseId: 'alice-phase',
        sectionId: 'alice-section', recurrenceId: null, deadline: null, habitCue: 'After breakfast',
        tinyStart: 'Open editor', identity: 'I practise', leetcodeProblemId: 'alice-problem', streak: 0, recoveryDue: false },
      { id: 'blank-habit', text: 'Synthetic task', done: false, cycleId: null, phaseId: null, sectionId: null,
        recurrenceId: null, deadline: null, habitCue: null, tinyStart: null, identity: null,
        leetcodeProblemId: null, streak: 0, recoveryDue: false },
    ],
    activity: initial.activity, reflection: initial.reflection, revision: created.revision,
  });

  await rejected(entry([task('would-replace')], { activity: 'Must not replace' }), 409);
  await rejected({ ...initial, revision: 'stale-revision' }, 409);
  for (const invalid of [
    null, [], { ...initial, date: '2026-02-30' }, { ...initial, revision: undefined },
    { ...initial, activity: 1 }, { ...initial, reflection: 'x'.repeat(20_001) },
    { ...initial, tasks: [task('duplicate'), task('duplicate')] },
    { ...initial, tasks: [task('blank', { text: ' \t ' })] },
    { ...initial, tasks: [task('wrong-state', { done: 1 })] },
    { ...initial, tasks: [task('bad-habit', { habitCue: 123 })] },
  ]) await rejected(invalid);

  const invalidReferences = [
    { cycleId: 'missing-cycle' }, { cycleId: 'bob-cycle' },
    { phaseId: 'alice-phase' },
    { cycleId: 'alice-cycle', phaseId: 'missing-phase' },
    { cycleId: 'alice-cycle', phaseId: 'bob-phase' },
    { cycleId: 'alice-cycle-other', phaseId: 'alice-phase' },
    { sectionId: 'missing-section' }, { sectionId: 'bob-section' },
    { leetcodeProblemId: 'missing-problem' }, { leetcodeProblemId: 'bob-problem' },
    { recurrenceId: 'missing-series' },
  ];
  for (const references of invalidReferences) {
    await rejected(entry([task('bad-reference', references)], { revision: saved.revision }));
  }

  const bobResponse = await write(entry([task('shared-task-id', { text: 'Bob task' })], {
    activity: 'Bob activity', reflection: 'Bob reflection',
  }), bob);
  assert.equal(bobResponse.status, 200, 'different accounts may reuse task ids');
  assert.equal((await read(date, bob)).tasks[0].text, 'Bob task');
  assert.deepEqual(await read(), saved, 'another account cannot change Alice entries');
  const bobSaved = await read(date, bob);
  await rejected(entry([], { revision: saved.revision }), 409, bob);

  const updateResponse = await write({ ...saved, date, tasks: [
    { ...saved.tasks[1], text: 'Revised task', done: false }, saved.tasks[0],
  ], activity: 'Revised activity' });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.notEqual(updated.revision, saved.revision);
  const afterUpdate = await read();
  assert.deepEqual(afterUpdate.tasks.map((item) => [item.id, item.text, item.done]), [
    ['metadata-task', 'Revised task', false], ['shared-task-id', 'First task', false],
  ], 'updates replace tasks in requested order');
  assert.equal(afterUpdate.tasks[0].habitCue, 'After breakfast');
  assert.equal(afterUpdate.activity, 'Revised activity');
  assert.equal(afterUpdate.reflection, saved.reflection);
  assert.equal(afterUpdate.revision, updated.revision);
  assert.deepEqual(await read(date, bob), bobSaved, 'updates are scoped to their owner');
  await rejected({ ...saved, date, tasks: [] }, 409);

  function seedSeries(ownerId, recurrenceId, dates, done, deadline = null) {
    for (let index = 0; index < dates.length; index += 1) {
      sqlite.prepare(`INSERT INTO tasks
        (id, owner_id, date, text, done, recurrence_id, deadline, position, created_at, updated_at)
        VALUES (?, ?, ?, 'Synthetic series task', ?, ?, ?, 0, 1, 1)`)
        .run(`${recurrenceId}-${dates[index]}`, ownerId, dates[index], Number(done[index]), recurrenceId, deadline);
    }
  }
  const seriesDates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
  seedSeries('password:alice', 'habit-series', seriesDates, [true, true, false, false, true, true]);
  seedSeries('google:bob', 'habit-series', seriesDates, [false, false, false, false, false, false]);
  for (const [on, streak, recoveryDue] of [
    ['2026-10-11', 2, false], ['2026-10-12', 2, false], ['2026-10-13', 0, true], ['2026-10-14', 1, false],
  ]) {
    const item = (await read(on)).tasks[0];
    assert.equal(item.streak, streak, `streak on ${on} excludes future and other owners`);
    assert.equal(item.recoveryDue, recoveryDue, `recovery state on ${on}`);
  }
  const seriesResponse = await write(entry([task('continued-habit', { recurrenceId: 'habit-series' })], {
    date: '2026-10-17',
  }));
  assert.equal(seriesResponse.status, 200, 'existing recurring tasks may continue with a consistent deadline');
  assert.equal((await read('2026-10-17')).tasks[0].streak, 2);

  seedSeries('password:alice', 'deadline-series', ['2026-10-20', '2026-10-21'], [false, false], '2026-10-23');
  const deadlineResponse = await write(entry([task('deadline-continuation', {
    recurrenceId: 'deadline-series', deadline: '2026-10-23',
  })], { date: '2026-10-22' }));
  assert.equal(deadlineResponse.status, 200);
  const deadlineTask = (await read('2026-10-22')).tasks[0];
  assert.equal(deadlineTask.deadline, '2026-10-23');
  assert.equal(deadlineTask.streak, 0);
  assert.equal(deadlineTask.recoveryDue, false, 'deadline tasks do not acquire habit recovery state');
  for (const invalid of [
    { recurrenceId: 'habit-series', deadline: '2026-10-23' },
    { recurrenceId: 'deadline-series', deadline: '2026-10-24' },
    { recurrenceId: 'deadline-series', deadline: null },
    { recurrenceId: 'deadline-series', deadline: '2026-10-15' },
    { recurrenceId: 'deadline-series', deadline: '2026-02-30' },
    { deadline: '2026-10-23' },
  ]) await rejected(entry([task('invalid-deadline', invalid)], { revision: afterUpdate.revision }));

  console.log('PASS: entries auth, dates, validation, normalization, reference ownership, revision conflicts, replacement, account isolation, recurrence streaks, and deadline consistency.');
} finally {
  sqlite.close();
  delete globalThis.__calendarEntriesTestEnv;
}
