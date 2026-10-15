import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillNames = ['daybook', 'daybook-today', 'daybook-plan', 'daybook-review', 'daybook-status'];

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run hermes:install -- [--home HERMES_HOME] [--force]\nInstalls Daybook skills and a standalone CLI; never reads or copies environment files.');
  } else {
    let hermesHome = process.env.HERMES_HOME || join(homedir(), '.hermes');
    let force = false;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--force') force = true;
      else if (args[index] === '--home' && args[index + 1] && !args[index + 1].startsWith('--')) hermesHome = args[++index];
      else throw new Error('Usage: npm run hermes:install -- [--home HERMES_HOME] [--force]');
    }
    await install(resolve(hermesHome), force);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Hermes installation failed.');
  process.exitCode = 1;
}

async function install(hermesHome, force) {
  const skillsRoot = join(hermesHome, 'skills');
  const manifestPath = join(skillsRoot, '.daybook-install.json');
  await rejectSymlink(skillsRoot);
  await rejectSymlink(manifestPath);
  const manifestBytes = await readOptional(manifestPath);
  const previous = manifestBytes ? JSON.parse(manifestBytes.toString('utf8')) : {};
  const files = new Map();
  for (const name of skillNames) {
    const path = `${name}/SKILL.md`;
    files.set(path, await readFile(join(projectRoot, 'integrations/hermes', path)));
  }
  files.set('daybook/references/workflows.md', await readFile(join(projectRoot, 'integrations/hermes/daybook/references/workflows.md')));
  for (const name of await readdir(join(projectRoot, 'scripts'))) {
    if (name === 'calendar-agent.mjs' || /^calendar-agent-.+\.mjs$/.test(name)) {
      files.set(`daybook/scripts/${name}`, await readFile(join(projectRoot, 'scripts', name)));
    }
  }

  // Preflight the entire bundle before changing any skill. Keep user edits unless
  // --force is explicit; update files managed by a previous installation safely.
  for (const [relativePath, content] of files) {
    let target = skillsRoot;
    for (const segment of relativePath.split('/')) {
      target = join(target, segment);
      await rejectSymlink(target);
    }
    const current = await readOptional(target);
    if (current && digest(current) !== digest(content) && previous[relativePath] !== digest(current) && !force) {
      throw new Error(`Existing file has local changes: ${relativePath}. Preserve it or rerun with --force to replace bundled files.`);
    }
  }
  const manifest = {};
  for (const [relativePath, content] of files) {
    const target = join(skillsRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    manifest[relativePath] = digest(content);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Installed ${skillNames.length} Daybook skills in ${skillsRoot}.`);
  console.log('Configure CALENDAR_API_URL and CALENDAR_AGENT_TOKEN securely in the Hermes environment, then restart/reload Hermes.');
  console.log('Commands: /daybook, /daybook-today, /daybook-plan, /daybook-review, /daybook-status day|week|month');
}

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function readOptional(path) {
  try { return await readFile(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function rejectSymlink(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Refusing to overwrite a symbolic link: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
