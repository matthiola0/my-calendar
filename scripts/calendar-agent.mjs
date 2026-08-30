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
    entry.tasks.push({
      id: randomUUID(),
      text,
      done: false,
      cycleId: null,
      phaseId: null,
      sectionId: null,
      recurrenceId: null,
      deadline: null,
      habitCue: null,
      tinyStart: null,
      identity: null,
    });
    await saveEntry(date, entry);
    console.log(`Added task to ${date}: ${text}`);
    break;
  }
  case 'repeat': {
    const [date, text, unit, intervalValue, endMode, endValue] = args;
    const interval = Number(intervalValue);
    if (
      !date || !text ||
      !['day', 'week', 'month'].includes(unit) ||
      !Number.isInteger(interval) || interval < 1 ||
      !['count', 'date'].includes(endMode) || !endValue
    ) {
      fail('Usage: npm run calendar -- repeat YYYY-MM-DD "task" day|week|month INTERVAL count|date COUNT|END_DATE');
    }
    const recurrence = endMode === 'count'
      ? { unit, interval, endMode, count: Number(endValue) }
      : { unit, interval, endMode, until: endValue };
    const result = await request('/api/recurring-tasks', {
      method: 'POST',
      body: JSON.stringify({
        startDate: date,
        text,
        cycleId: null,
        phaseId: null,
        sectionId: null,
        habitCue: null,
        tinyStart: null,
        identity: null,
        recurrence,
      }),
    });
    console.log(`Created ${result.count} recurring tasks starting ${date}.`);
    break;
  }
  case 'short': {
    const [date, text, deadline] = args;
    if (!date || !text || !deadline) {
      fail('Usage: npm run calendar -- short YYYY-MM-DD "task" END_DATE');
    }
    const result = await request('/api/recurring-tasks', {
      method: 'POST',
      body: JSON.stringify({
        startDate: date,
        text,
        cycleId: null,
        phaseId: null,
        sectionId: null,
        deadline,
        habitCue: null,
        tinyStart: null,
        identity: null,
        recurrence: { unit: 'day', interval: 1, endMode: 'date', until: deadline },
      }),
    });
    console.log(`Created ${result.count} daily tasks through ${deadline}.`);
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
  case 'move': {
    const [date, taskId, sectionId] = args;
    if (!date || !taskId || !sectionId) fail('Usage: npm run calendar -- move YYYY-MM-DD TASK_ID SECTION_ID|none');
    const entry = await getEntry(date);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    if (sectionId !== 'none') {
      const sections = await getSections();
      if (!sections.some((section) => section.id === sectionId)) fail(`Section not found: ${sectionId}`);
    }
    task.sectionId = sectionId === 'none' ? null : sectionId;
    await saveEntry(date, entry);
    console.log(`Moved: ${task.text}`);
    break;
  }
  case 'habit': {
    const [date, taskId, cue = '', tinyStart = '', identity = ''] = args;
    if (!date || !taskId) fail('Usage: npm run calendar -- habit YYYY-MM-DD TASK_ID "cue" "two-minute start" "identity"');
    const entry = await getEntry(date);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    task.habitCue = cue.trim() || null;
    task.tinyStart = tinyStart.trim() || null;
    task.identity = identity.trim() || null;
    await saveEntry(date, entry);
    console.log(`Updated habit design for: ${task.text}`);
    break;
  }
  case 'series-update': {
    const [date, taskId, text, cue = '', tinyStart = '', identity = ''] = args;
    if (!date || !taskId || !text) {
      fail('Usage: npm run calendar -- series-update YYYY-MM-DD TASK_ID "task" "cue" "two-minute start" "identity"');
    }
    const entry = await getEntry(date);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    if (!task.recurrenceId) fail(`Task is not recurring: ${taskId}`);
    const result = await request('/api/recurring-tasks', {
      method: 'PATCH',
      body: JSON.stringify({
        recurrenceId: task.recurrenceId,
        text,
        cycleId: task.cycleId,
        phaseId: task.phaseId,
        sectionId: task.sectionId,
        habitCue: cue.trim() || null,
        tinyStart: tinyStart.trim() || null,
        identity: identity.trim() || null,
      }),
    });
    console.log(`Updated ${result.count} tasks in the recurring series.`);
    break;
  }
  case 'series-remove': {
    const [date, taskId] = args;
    if (!date || !taskId) fail('Usage: npm run calendar -- series-remove YYYY-MM-DD TASK_ID');
    const entry = await getEntry(date);
    const task = entry.tasks.find((item) => item.id === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    if (!task.recurrenceId) fail(`Task is not recurring: ${taskId}`);
    const result = await request('/api/recurring-tasks', {
      method: 'DELETE',
      body: JSON.stringify({ recurrenceId: task.recurrenceId }),
    });
    console.log(`Removed ${result.count} tasks from the recurring series.`);
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
  case 'sections': {
    console.log(JSON.stringify(await getSections(), null, 2));
    break;
  }
  case 'sections-set': {
    const titles = args.map((value) => value.trim()).filter(Boolean);
    if (titles.length > 6) fail('Daily sections are limited to 6.');
    const current = await getSections();
    const sections = titles.map((title, index) => ({ id: current[index]?.id ?? randomUUID(), title }));
    await request('/api/day-sections', {
      method: 'PUT',
      body: JSON.stringify({ sections }),
    });
    console.log(`Saved ${sections.length} daily sections.`);
    break;
  }
  case 'fields': {
    const [date] = args;
    if (!date) fail('Usage: npm run calendar -- fields YYYY-MM-DD');
    const result = await request(`/api/custom-fields?date=${encodeURIComponent(date)}`);
    console.log(JSON.stringify(result.fields, null, 2));
    break;
  }
  case 'field-add': {
    const title = args.join(' ').trim();
    if (!title) fail('Usage: npm run calendar -- field-add "title"');
    const result = await request('/api/custom-fields', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    console.log(`Created field ${result.field.id}: ${result.field.title}`);
    break;
  }
  case 'field-write': {
    const [date, fieldId, ...values] = args;
    if (!date || !fieldId) fail('Usage: npm run calendar -- field-write YYYY-MM-DD FIELD_ID "content"');
    await request('/api/custom-fields', {
      method: 'PUT',
      body: JSON.stringify({ id: fieldId, date, content: values.join(' ') }),
    });
    console.log(`Updated custom field for ${date}.`);
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

async function getSections() {
  const result = await request('/api/day-sections');
  return result.sections;
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
  short      YYYY-MM-DD "task" END_DATE
  repeat     YYYY-MM-DD "task" day|week|month INTERVAL count|date COUNT|END_DATE
  toggle     YYYY-MM-DD TASK_ID
  remove     YYYY-MM-DD TASK_ID
  link       YYYY-MM-DD TASK_ID CYCLE_ID [PHASE_ID]
  unlink     YYYY-MM-DD TASK_ID
  move       YYYY-MM-DD TASK_ID SECTION_ID|none
  habit      YYYY-MM-DD TASK_ID "cue" "two-minute start" "identity"
  series-update YYYY-MM-DD TASK_ID "task" "cue" "two-minute start" "identity"
  series-remove YYYY-MM-DD TASK_ID
  activity   YYYY-MM-DD "what happened"
  reflection YYYY-MM-DD "reflection"`);
  console.log(`
Macro-cycle commands:
  cycles
  cycle-get   CYCLE_ID
  cycle-create START_DATE END_DATE "title" "goal"
  phase-add   CYCLE_ID START_DATE END_DATE "title" "description"
  cycle-reward CYCLE_ID "reward"`);
  console.log(`
Daily layout and custom records:
  sections
  sections-set "morning" "afternoon" "evening"
  fields       YYYY-MM-DD
  field-add    "title"
  field-write  YYYY-MM-DD FIELD_ID "content"`);
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
