import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hermesHome = await mkdtemp(join(tmpdir(), 'daybook-hermes-test-'));
function install(...args) {
  return spawnSync(process.execPath, [join(root, 'scripts/install-hermes.mjs'), '--home', hermesHome, ...args], {
    cwd: tmpdir(), encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
}
const initial = install();
assert.equal(initial.status, 0, initial.stderr);
const cli = join(hermesHome, 'skills/daybook/scripts/calendar-agent.mjs');
assert.equal(await readFile(cli, 'utf8'), await readFile(join(root, 'scripts/calendar-agent.mjs'), 'utf8'));
const help = spawnSync(process.execPath, [cli, 'help'], { cwd: tmpdir(), encoding: 'utf8', env: {} });
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /today/);
assert.equal(install().status, 0, 'repeated installation is safe');
assert.deepEqual((await readdir(hermesHome)).sort(), ['skills'], 'no environment/config files are copied');
const wrapper = join(hermesHome, 'skills/daybook-today/SKILL.md');
const customized = '# User customized this skill\n';
await writeFile(wrapper, customized);
const refused = install();
assert.equal(refused.status, 1);
assert.match(refused.stderr, /local changes/);
assert.equal(await readFile(wrapper, 'utf8'), customized, 'local edits survive without --force');
assert.equal(install('--force').status, 0);
assert.notEqual(await readFile(wrapper, 'utf8'), customized);
console.log('Hermes installation: standalone CLI, idempotence, credential exclusion, and local-edit protection passed.');
