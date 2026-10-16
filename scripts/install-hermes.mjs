import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillNames = ['daybook', 'daybook-today', 'daybook-plan', 'daybook-review', 'daybook-status'];
const usage = 'Usage: npm run hermes:install -- [--home HERMES_HOME] [--discord] [--force]';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`${usage}\nInstalls Daybook skills and a standalone CLI; --discord also installs native Discord shortcuts. Never reads or copies environment files.`);
  } else {
    let hermesHome = process.env.HERMES_HOME || join(homedir(), '.hermes');
    let force = false;
    let discord = false;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--force') force = true;
      else if (args[index] === '--discord') discord = true;
      else if (args[index] === '--home' && args[index + 1] && !args[index + 1].startsWith('--')) hermesHome = args[++index];
      else throw new Error(usage);
    }
    await install(resolve(hermesHome), force, discord);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Hermes installation failed.');
  process.exitCode = 1;
}

async function install(hermesHome, force, discord) {
  const skillsRoot = join(hermesHome, 'skills');
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

  const bundles = [await prepareBundle(skillsRoot, files, force)];
  if (discord) {
    const pluginsRoot = join(hermesHome, 'plugins');
    await rejectSymlink(pluginsRoot);
    const pluginFiles = new Map();
    for (const name of ['__init__.py', 'plugin.yaml']) {
      pluginFiles.set(name, await readFile(join(projectRoot, 'integrations/hermes/daybook-shortcuts', name)));
    }
    bundles.push(await prepareBundle(join(pluginsRoot, 'daybook-shortcuts'), pluginFiles, force));
  }

  // Preflight every bundle before writing; preserve local edits without --force.
  for (const bundle of bundles) {
    const manifest = {};
    for (const [relativePath, content] of bundle.files) {
      const target = join(bundle.root, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      manifest[relativePath] = digest(content);
    }
    await writeFile(bundle.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`Installed ${skillNames.length} Daybook skills in ${skillsRoot}.`);
  console.log('Configure CALENDAR_API_URL and CALENDAR_AGENT_TOKEN securely in the Hermes environment, then restart/reload Hermes.');
  console.log('Terminal commands: /daybook, /daybook-today, /daybook-plan, /daybook-review, /daybook-status day|week|month');
  if (discord) {
    console.log('Installed daybook-shortcuts for direct Discord /daybook-* commands.');
    console.log('Enable: hermes config set plugins.entries.daybook-shortcuts.allow_gateway_injection true');
    console.log('Then: hermes plugins enable daybook-shortcuts && hermes gateway restart');
    console.log('The installer does not change Hermes configuration or restart the gateway.');
  } else {
    console.log('Discord: use /skill and search daybook, or reinstall with --discord for direct shortcuts.');
    console.log('After installing, /reload-skills refreshes the Discord skill choices.');
  }
}

async function prepareBundle(root, files, force) {
  const manifestPath = join(root, '.daybook-install.json');
  await rejectSymlink(root);
  await rejectSymlink(manifestPath);
  const manifestBytes = await readOptional(manifestPath);
  const previous = manifestBytes ? JSON.parse(manifestBytes.toString('utf8')) : {};
  for (const [relativePath, content] of files) {
    let target = root;
    for (const segment of relativePath.split('/')) {
      target = join(target, segment);
      await rejectSymlink(target);
    }
    const current = await readOptional(target);
    if (current && digest(current) !== digest(content) && previous[relativePath] !== digest(current) && !force) {
      throw new Error(`Existing file has local changes: ${relativePath}. Preserve it or rerun with --force to replace bundled files.`);
    }
  }
  return { root, files, manifestPath };
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
