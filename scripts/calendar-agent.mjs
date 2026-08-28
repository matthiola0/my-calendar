import { randomUUID } from 'node:crypto';

const apiUrl = process.env.CALENDAR_API_URL?.replace(/\/$/, '');
const agentToken = process.env.CALENDAR_AGENT_TOKEN;
const sitesBypassToken = process.env.CALENDAR_SITES_BYPASS_TOKEN;

if (!apiUrl || !agentToken || !sitesBypassToken) {
  fail('Missing CALENDAR_API_URL, CALENDAR_AGENT_TOKEN, or CALENDAR_SITES_BYPASS_TOKEN in .env.local.');
}

const [command, date, ...values] = process.argv.slice(2);
if (!command || !date) printHelp();

const entry = await getEntry(date);

switch (command) {
  case 'get':
    console.log(JSON.stringify({ date, ...entry }, null, 2));
    break;
  case 'add': {
    const text = values.join(' ').trim();
    if (!text) fail('Usage: npm run calendar -- add YYYY-MM-DD "task"');
    entry.tasks.push({ id: randomUUID(), text, done: false });
    await saveEntry(date, entry);
    console.log(`Added task to ${date}: ${text}`);
    break;
  }
  case 'toggle': {
    const task = entry.tasks.find((item) => item.id === values[0]);
    if (!task) fail(`Task not found: ${values[0] ?? '(missing id)'}`);
    task.done = !task.done;
    await saveEntry(date, entry);
    console.log(`${task.done ? 'Completed' : 'Reopened'}: ${task.text}`);
    break;
  }
  case 'remove': {
    const taskIndex = entry.tasks.findIndex((item) => item.id === values[0]);
    if (taskIndex < 0) fail(`Task not found: ${values[0] ?? '(missing id)'}`);
    const [task] = entry.tasks.splice(taskIndex, 1);
    await saveEntry(date, entry);
    console.log(`Removed: ${task.text}`);
    break;
  }
  case 'activity': {
    entry.activity = values.join(' ');
    await saveEntry(date, entry);
    console.log(`Updated activity for ${date}.`);
    break;
  }
  case 'reflection': {
    entry.reflection = values.join(' ');
    await saveEntry(date, entry);
    console.log(`Updated reflection for ${date}.`);
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
  activity   YYYY-MM-DD "what happened"
  reflection YYYY-MM-DD "reflection"`);
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
