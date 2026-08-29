import { randomUUID } from 'node:crypto';

const apiUrl = process.env.CALENDAR_API_URL?.replace(/\/$/, '');
const agentToken = process.env.CALENDAR_AGENT_TOKEN;
const sitesBypassToken = process.env.CALENDAR_SITES_BYPASS_TOKEN;

if (!apiUrl || !agentToken || !sitesBypassToken) {
  fail('Missing CALENDAR_API_URL, CALENDAR_AGENT_TOKEN, or CALENDAR_SITES_BYPASS_TOKEN in .env.local.');
}

const [command, ...args] = process.argv.slice(2);
if (!command) printHelp();

switch (command) {
  case 'get': {
    const [date] = args;
    if (!date) printHelp();
    const entry = await getEntry(date);
    console.log(JSON.stringify({ date, ...entry }, null, 2));
    break;
  }
  case 'add': {
    const [date, ...values] = args;
    if (!date) printHelp();
    const entry = await getEntry(date);
    const text = values.join(' ').trim();
    if (!text) fail('Usage: npm run calendar -- add YYYY-MM-DD "task"');
    entry.tasks.push({ id: randomUUID(), text, done: false, cycleId: null, phaseId: null });
    await saveEntry(date, entry);
    console.log(`Added task to ${date}: ${text}`);
    break;
  }
  case 'toggle': {
    const [date, taskId] = args;
    if (!date) printHelp();
    const entry = await getEntry(date);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId ?? '(missing id)'}`);
    task.done = !task.done;
    await saveEntry(date, entry);
    console.log(`${task.done ? 'Completed' : 'Reopened'}: ${task.text}`);
    break;
  }
  case 'remove': {
    const [date, taskId] = args;
    if (!date) printHelp();
    const entry = await getEntry(date);
    const taskIndex = entry.tasks.findIndex((item) => item.id === taskId);
    if (taskIndex < 0) fail(`Task not found: ${taskId ?? '(missing id)'}`);
    const [task] = entry.tasks.splice(taskIndex, 1);
    await saveEntry(date, entry);
    console.log(`Removed: ${task.text}`);
    break;
  }
  case 'link': {
    const [date, taskId, cycleId, phaseId = null] = args;
    if (!date || !taskId || !cycleId) {
      fail('Usage: npm run calendar -- link YYYY-MM-DD TASK_ID CYCLE_ID [PHASE_ID]');
    }
    const [entry, cycles] = await Promise.all([getEntry(date), getCycles()]);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    const cycle = cycles.find((item) => item.id === cycleId);
    if (!cycle) fail(`Cycle not found: ${cycleId}`);
    if (phaseId && !cycle.phases.some((phase) => phase.id === phaseId)) {
      fail(`Phase not found in cycle ${cycleId}: ${phaseId}`);
    }
    task.cycleId = cycle.id;
    task.phaseId = phaseId;
    await saveEntry(date, entry);
    console.log(`Linked "${task.text}" to ${cycle.title}${phaseId ? ' phase' : ''}.`);
    break;
  }
  case 'unlink': {
    const [date, taskId] = args;
    if (!date || !taskId) fail('Usage: npm run calendar -- unlink YYYY-MM-DD TASK_ID');
    const entry = await getEntry(date);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    task.cycleId = null;
    task.phaseId = null;
    await saveEntry(date, entry);
    console.log(`Unlinked: ${task.text}`);
    break;
  }
  case 'activity': {
    const [date, ...values] = args;
    if (!date) printHelp();
    const entry = await getEntry(date);
    entry.activity = values.join(' ');
    await saveEntry(date, entry);
    console.log(`Updated activity for ${date}.`);
    break;
  }
  case 'reflection': {
    const [date, ...values] = args;
    if (!date) printHelp();
    const entry = await getEntry(date);
    entry.reflection = values.join(' ');
    await saveEntry(date, entry);
    console.log(`Updated reflection for ${date}.`);
    break;
  }
  case 'cycles': {
    const cycles = await getCycles();
    console.log(JSON.stringify(cycles, null, 2));
    break;
  }
  case 'cycle-get': {
    const [cycleId] = args;
    if (!cycleId) fail('Usage: npm run calendar -- cycle-get CYCLE_ID');
    const cycle = (await getCycles()).find((item) => item.id === cycleId);
    if (!cycle) fail(`Cycle not found: ${cycleId}`);
    console.log(JSON.stringify(cycle, null, 2));
    break;
  }
  case 'cycle-create': {
    const [startDate, endDate, title, goal] = args;
    if (!startDate || !endDate || !title || !goal) {
      fail('Usage: npm run calendar -- cycle-create START_DATE END_DATE "title" "goal"');
    }
    const cycle = {
      id: randomUUID(),
      title,
      goal,
      reward: '',
      startDate,
      endDate,
      status: 'active',
      revision: null,
      phases: [],
    };
    await saveCycle(cycle);
    console.log(`Created cycle ${cycle.id}: ${cycle.title}`);
    break;
  }
  case 'phase-add': {
    const [cycleId, startDate, endDate, title, description = ''] = args;
    if (!cycleId || !startDate || !endDate || !title) {
      fail('Usage: npm run calendar -- phase-add CYCLE_ID START_DATE END_DATE "title" "description"');
    }
    const cycle = (await getCycles()).find((item) => item.id === cycleId);
    if (!cycle) fail(`Cycle not found: ${cycleId}`);
    cycle.phases.push({
      id: randomUUID(),
      title,
      description,
      startDate,
      endDate,
    });
    await saveCycle(cycle);
    console.log(`Added phase to ${cycle.title}: ${title}`);
    break;
  }
  case 'cycle-reward': {
    const [cycleId, ...values] = args;
    const reward = values.join(' ').trim();
    if (!cycleId || !reward) fail('Usage: npm run calendar -- cycle-reward CYCLE_ID "reward"');
    const cycle = (await getCycles()).find((item) => item.id === cycleId);
    if (!cycle) fail(`Cycle not found: ${cycleId}`);
    cycle.reward = reward;
    await saveCycle(cycle);
    console.log(`Updated reward for ${cycle.title}.`);
    break;
  }
  default:
    printHelp();
}

async function getEntry(targetDate) {
  return request(`/api/entries?date=${encodeURIComponent(targetDate)}`);
}

async function saveEntry(targetDate, entryValue) {
  await request('/api/entries', {
    method: 'PUT',
    body: JSON.stringify({ date: targetDate, ...entryValue }),
  });
}

async function getCycles() {
  const result = await request('/api/cycles');
  return result.cycles;
}

async function saveCycle(cycle) {
  const result = await request('/api/cycles', {
    method: 'PUT',
    body: JSON.stringify(cycle),
  });
  cycle.revision = result.revision;
}

async function request(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${agentToken}`,
      'OAI-Sites-Authorization': `Bearer ${sitesBypassToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const message = await response.text();
    fail(`Calendar API returned ${response.status}: ${message}`);
  }
  return response.json();
}

function printHelp() {
  console.log(`Calendar agent commands:
  get        YYYY-MM-DD
  add        YYYY-MM-DD "task"
  toggle     YYYY-MM-DD TASK_ID
  remove     YYYY-MM-DD TASK_ID
  link       YYYY-MM-DD TASK_ID CYCLE_ID [PHASE_ID]
  unlink     YYYY-MM-DD TASK_ID
  activity   YYYY-MM-DD "what happened"
  reflection YYYY-MM-DD "reflection"`);
  console.log(`
Macro-cycle commands:
  cycles
  cycle-get   CYCLE_ID
  cycle-create START_DATE END_DATE "title" "goal"
  phase-add   CYCLE_ID START_DATE END_DATE "title" "description"
  cycle-reward CYCLE_ID "reward"`);
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
