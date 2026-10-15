import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

// Exercise actual token queries against a synthetic in-memory D1 adapter.
// Session identities are mocked; no real credentials, account data, or network.
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
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sqlite.exec('COMMIT');
      return result;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
globalThis.__agentAuthTestEnv = { DB: db, AGENT_API_TOKEN: 'synthetic-legacy-token' };
globalThis.__agentAuthTestCalls = 0;
const bundle = await build({
  stdin: { contents: `export * from './app/lib/agent-access'; export * from './app/lib/calendar-auth'; export { GET, POST, DELETE } from './app/api/agent-tokens/route';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'test-worker-and-session', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    builder.onResolve({ filter: /(?:^|\/)auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'env'
      ? 'export const env = globalThis.__agentAuthTestEnv;'
      : `export async function getCurrentUser(request) {
          globalThis.__agentAuthTestCalls++;
          const cookie = request?.headers.get('cookie');
          return cookie === 'test=password' ? { ownerId: 'password:alice' }
            : cookie === 'test=google' ? { ownerId: 'google:bob' } : null;
        }` }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function request(method, body, options = {}) {
  const headers = { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...options };
  return new Request('https://calendar.test/api/agent-tokens', { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}
const password = { cookie: 'test=password' };
const google = { cookie: 'test=google' };
for (const handler of [api.GET, api.POST, api.DELETE]) {
  const method = handler === api.GET ? 'GET' : handler === api.POST ? 'POST' : 'DELETE';
  const response = await handler(request(method, method === 'GET' ? undefined : {}, { authorization: 'Bearer synthetic-legacy-token' }));
  assert.equal(response.status, 401, 'bearer alone cannot manage credentials');
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
assert.equal((await api.POST(request('POST', { name: 'Hermes' }, { ...password, origin: 'https://evil.test' }))).status, 403);
assert.equal((await api.DELETE(request('DELETE', { id: 'anything' }, { ...password, 'sec-fetch-site': 'cross-site' }))).status, 403);
assert.equal((await api.POST(request('POST', { name: 'Hermes' }, { ...password, 'content-type': 'text/plain' }))).status, 400);
assert.equal((await api.POST(request('POST', { name: 'x'.repeat(81) }, password))).status, 400);
const malformed = new Request('https://calendar.test/api/agent-tokens', { method: 'POST', headers: { ...password, 'content-type': 'application/json' }, body: '{' });
assert.equal((await api.POST(malformed)).status, 400);

const createdResponse = await api.POST(request('POST', { name: ' Hermes ' }, { ...password, origin: 'https://calendar.test', 'sec-fetch-site': 'same-origin' }));
assert.equal(createdResponse.status, 201);
assert.equal(createdResponse.headers.get('cache-control'), 'no-store');
const created = await createdResponse.json();
assert.match(created.token, /^daybook_[a-f0-9]{64}$/);
assert.equal(created.name, 'Hermes');
assert.equal(created.expiresAt - created.createdAt, 90 * 24 * 60 * 60 * 1000);
const stored = sqlite.prepare('SELECT * FROM agent_tokens WHERE id = ?').get(created.id);
assert.equal(stored.owner_id, 'password:alice');
assert.equal(stored.token_hash, createHash('sha256').update(created.token).digest('hex'));
assert.ok(!JSON.stringify(stored).includes(created.token), 'database contains only hash');
assert.equal(await api.getAgentTokenOwnerId(created.token), 'password:alice');
const aliceListResponse = await api.GET(request('GET', undefined, password));
const aliceList = await aliceListResponse.json();
assert.deepEqual(Object.keys(aliceList.tokens[0]).sort(), ['createdAt', 'expiresAt', 'id', 'name']);
assert.ok(!JSON.stringify(aliceList).includes(created.token));
assert.deepEqual(await (await api.GET(request('GET', undefined, google))).json(), { tokens: [] });
assert.equal((await api.DELETE(request('DELETE', { id: created.id }, google))).status, 404);
assert.equal(await api.getAgentTokenOwnerId(created.token), 'password:alice');

const authRequest = (authorization) => new Request('https://calendar.test/api/entries', { headers: { ...password, ...(authorization === undefined ? {} : { authorization }) } });
assert.equal(await api.getAuthorizedOwnerId(authRequest()), 'password:alice');
const beforeCalls = globalThis.__agentAuthTestCalls;
for (const authorization of ['Bearer wrong', 'Bearer', 'Basic wrong', 'Bearer daybook_' + '0'.repeat(64)]) {
  assert.equal(await api.getAuthorizedOwnerId(authRequest(authorization)), null, 'invalid authorization cannot fall back to cookie');
}
assert.equal(globalThis.__agentAuthTestCalls, beforeCalls);
assert.equal(await api.getAuthorizedOwnerId(authRequest('Bearer synthetic-legacy-token')), 'owner');
assert.equal(await api.getAuthorizedOwnerId(authRequest(`Bearer ${created.token}`)), 'password:alice');
const googleCreated = await (await api.POST(request('POST', { name: 'Google Hermes' }, google))).json();
assert.equal(await api.getAuthorizedOwnerId(authRequest(`Bearer ${googleCreated.token}`)), 'google:bob');

sqlite.prepare('UPDATE agent_tokens SET expires_at = ? WHERE id = ?').run(Date.now() - 1, created.id);
assert.equal(await api.getAgentTokenOwnerId(created.token), null);
assert.deepEqual(await api.listAgentTokens('password:alice'), []);
const tokens = await Promise.all(Array.from({ length: 11 }, (_, index) => api.createAgentToken('password:alice', `Agent ${index}`)));
assert.equal(tokens.filter(Boolean).length, 10, 'concurrent creation respects active limit');
assert.equal((await api.POST(request('POST', { name: 'One more' }, password))).status, 409);
const revoke = tokens.find(Boolean);
assert.equal((await api.DELETE(request('DELETE', { id: revoke.id }, password))).status, 200);
assert.equal(await api.getAuthorizedOwnerId(authRequest(`Bearer ${revoke.token}`)), null);
assert.equal((await api.DELETE(request('DELETE', { id: revoke.id }, password))).status, 404);
assert.ok(await api.createAgentToken('password:alice', 'Replacement'));

sqlite.close();
delete globalThis.__agentAuthTestEnv;
delete globalThis.__agentAuthTestCalls;
console.log('PASS: session-only management, CSRF checks, validation, hash-only storage, account isolation, expiry, revocation, concurrent limit, legacy auth, and invalid bearer fail-closed.');
