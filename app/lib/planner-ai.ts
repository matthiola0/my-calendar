import { env } from 'cloudflare:workers';
import type {
  PlannerChatMessage,
  PlannerProposal,
  PlannerReply,
  ProposedCycle,
  ProposedTask,
  ProposedTaskLink,
} from './planner-types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PROPOSAL_TASKS = 30;
const MAX_CONTEXT_DAYS = 120;

type PlanningContext = {
  range: { startDate: string; endDate: string };
  days: Array<{
    date: string;
    tasks: Array<{
      text: string;
      done: boolean;
      cycleId: string | null;
      phaseId: string | null;
      sectionId: string | null;
    }>;
  }>;
  cycles: Array<{
    id: string;
    title: string;
    goal: string;
    reward: string;
    startDate: string;
    endDate: string;
    status: string;
    progress: { completed: number; total: number };
    phases: Array<{
      id: string;
      title: string;
      description: string;
      startDate: string;
      endDate: string;
    }>;
  }>;
  sections: Array<{ id: string; title: string }>;
};

type ContextRange = { startDate: string; endDate: string };

export async function choosePlanningRange(
  messages: PlannerChatMessage[],
  currentDate: string,
): Promise<ContextRange> {
  const result = await requestJson([
    {
      role: 'system',
      content: `你是行事曆資料範圍分析器。今天是 ${currentDate}。
根據對話判斷下一則回答真正需要讀取的最小日期範圍。解析「今天、明天、下週、下個月」等相對日期。
若只是一般詢問或資料不足，startDate 與 endDate 都使用 ${currentDate}。
範圍最多 ${MAX_CONTEXT_DAYS} 天，超過時只選最接近且最有用的一段。
只能輸出 JSON：{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}`,
    },
    ...messages,
  ], 220);

  const candidate = result as Record<string, unknown>;
  const startDate = typeof candidate.startDate === 'string' ? candidate.startDate : currentDate;
  const endDate = typeof candidate.endDate === 'string' ? candidate.endDate : currentDate;
  if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
    return { startDate: currentDate, endDate: currentDate };
  }
  if (daysBetween(startDate, endDate) + 1 > MAX_CONTEXT_DAYS) {
    return { startDate, endDate: shiftDate(startDate, MAX_CONTEXT_DAYS - 1) };
  }
  return { startDate, endDate };
}

export async function createPlannerReply(
  messages: PlannerChatMessage[],
  currentDate: string,
  timezone: string,
  context: PlanningContext,
  language: 'en' | 'zh' | 'ja',
): Promise<PlannerReply> {
  const result = await requestJson([
    {
      role: 'system',
      content: buildPlannerPrompt(currentDate, timezone, context, language),
    },
    ...messages,
  ], 3_200);

  return parsePlannerReply(result, context);
}

async function requestJson(messages: Array<{ role: string; content: string }>, maxTokens: number) {
  if (!env.GROQ_API_KEY) throw new PlannerAiError('AI 尚未完成設定。', 503);

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || DEFAULT_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_completion_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new PlannerAiError('今天的 AI 使用量較多，請稍後再試。', 429);
    throw new PlannerAiError('AI 暫時無法回應，請稍後再試。', 502);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new PlannerAiError('AI 沒有傳回可用內容，請再試一次。', 502);

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new PlannerAiError('AI 回覆格式不完整，請再試一次。', 502);
  }
}

function buildPlannerPrompt(
  currentDate: string,
  timezone: string,
  context: PlanningContext,
  language: 'en' | 'zh' | 'ja',
) {
  const outputLanguage = { en: 'English', zh: 'Traditional Chinese', ja: 'Japanese' }[language];
  return `You are the planning assistant inside the Daybook calendar.
Today is ${currentDate}, and the user's time zone is ${timezone}.
Write every user-facing value in ${outputLanguage}, including messages, questions, summaries, cycle titles, phases, rewards, and task text. Keep JSON property names unchanged.

Data model:
- A macro cycle contains a title, outcome, dates, reward, and phases.
- A daily cycle is a completable task. It may link to an existing or newly proposed macro cycle or phase and may be placed in a day section.

Rules:
1. Plan only from the calendar context below. Never imply that you read other dates.
2. Preserve every existing item. Never propose deleting, overwriting, moving, or rewriting existing tasks.
3. Add at most three important and two optional tasks per day. Leave room for rest and unexpected work.
4. Make tasks concrete, easy to start, and completable within one day. Break large outcomes down.
5. Link a new task only when its date falls inside the linked cycle and phase.
6. When essential information is missing, ask no more than three questions and set proposal to null.
7. Create a proposal only after the user provides a clear outcome, deadline, and available time.
8. Do not provide medical or mental-health diagnoses. Recommend reducing scope when the plan is clearly overloaded.
9. Propose no more than ${MAX_PROPOSAL_TASKS} new tasks. For longer plans, schedule the nearest useful portion first.

cycleLink formats:
- No link: null
- Existing cycle: {"source":"existing","cycleId":"id from the context","phaseId":"id from the context or null"}
- Newly proposed cycle: {"source":"proposed","phaseIndex":"zero-based phase index or null"}

Return exactly one JSON object without Markdown in this shape:
{
  "message": "user-facing reply",
  "questions": ["essential question"],
  "proposal": null or {
    "summary": "proposal summary",
    "cycle": null or {
      "title": "title",
      "goal": "verifiable outcome",
      "reward": "reward or empty string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "phases": [{"title":"phase","description":"completion condition","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]
    },
    "tasks": [{
      "date":"YYYY-MM-DD",
      "text":"task",
      "sectionId":"existing section id or null",
      "cycleLink": null,
      "habitCue": null,
      "tinyStart": null,
      "identity": null
    }]
  }
}

Calendar context already read:
${JSON.stringify(context)}`;
}

function parsePlannerReply(value: unknown, context: PlanningContext): PlannerReply {
  if (!value || typeof value !== 'object') throw invalidReply();
  const candidate = value as Record<string, unknown>;
  const message = requiredText(candidate.message, 5_000);
  const questions = Array.isArray(candidate.questions)
    ? candidate.questions.slice(0, 3).map((question) => requiredText(question, 500))
    : [];
  const proposal = candidate.proposal === null || candidate.proposal === undefined
    ? null
    : parseProposal(candidate.proposal, {
      startDate: context.range.startDate,
      endDate: context.range.endDate,
      cycles: context.cycles,
      sections: context.sections,
    });

  if (!proposal && !message) throw invalidReply();
  return { message, questions, proposal };
}

export function parseProposal(
  value: unknown,
  validation?: {
    startDate?: string;
    endDate?: string;
    cycles?: PlanningContext['cycles'];
    sections?: PlanningContext['sections'];
  },
): PlannerProposal {
  if (!value || typeof value !== 'object') throw invalidReply();
  const candidate = value as Record<string, unknown>;
  const summary = requiredText(candidate.summary, 2_000);
  const cycle = candidate.cycle === null || candidate.cycle === undefined
    ? null
    : parseCycle(candidate.cycle);
  if (!Array.isArray(candidate.tasks) || candidate.tasks.length > MAX_PROPOSAL_TASKS) {
    throw invalidReply();
  }
  const tasks = candidate.tasks.map((task) => parseTask(task, cycle, validation));
  if (!cycle && tasks.length === 0) throw invalidReply();
  const taskDates = tasks.map((task) => task.date).sort();
  if (
    taskDates.length > 0 &&
    daysBetween(taskDates[0], taskDates.at(-1)!) + 1 > MAX_CONTEXT_DAYS
  ) {
    throw invalidReply();
  }
  return { summary, cycle, tasks };
}

function parseCycle(value: unknown): ProposedCycle {
  if (!value || typeof value !== 'object') throw invalidReply();
  const candidate = value as Record<string, unknown>;
  const startDate = validDate(candidate.startDate);
  const endDate = validDate(candidate.endDate);
  if (startDate > endDate || !Array.isArray(candidate.phases) || candidate.phases.length > 20) {
    throw invalidReply();
  }
  const phases = candidate.phases.map((rawPhase) => {
    if (!rawPhase || typeof rawPhase !== 'object') throw invalidReply();
    const phase = rawPhase as Record<string, unknown>;
    const phaseStart = validDate(phase.startDate);
    const phaseEnd = validDate(phase.endDate);
    if (phaseStart < startDate || phaseEnd > endDate || phaseStart > phaseEnd) throw invalidReply();
    return {
      title: requiredText(phase.title, 200),
      description: optionalText(phase.description, 2_000) ?? '',
      startDate: phaseStart,
      endDate: phaseEnd,
    };
  });
  return {
    title: requiredText(candidate.title, 200),
    goal: requiredText(candidate.goal, 5_000),
    reward: optionalText(candidate.reward, 1_000) ?? '',
    startDate,
    endDate,
    phases,
  };
}

function parseTask(
  value: unknown,
  proposedCycle: ProposedCycle | null,
  validation?: Parameters<typeof parseProposal>[1],
): ProposedTask {
  if (!value || typeof value !== 'object') throw invalidReply();
  const candidate = value as Record<string, unknown>;
  const date = validDate(candidate.date);
  if (
    validation?.startDate && date < validation.startDate ||
    validation?.endDate && date > validation.endDate
  ) throw invalidReply();

  const sectionId = optionalId(candidate.sectionId);
  if (sectionId && validation?.sections && !validation.sections.some((section) => section.id === sectionId)) {
    throw invalidReply();
  }
  const cycleLink = parseCycleLink(candidate.cycleLink, proposedCycle, validation?.cycles, date);
  return {
    date,
    text: requiredText(candidate.text, 500),
    sectionId,
    cycleLink,
    habitCue: optionalText(candidate.habitCue, 300),
    tinyStart: optionalText(candidate.tinyStart, 300),
    identity: optionalText(candidate.identity, 300),
  };
}

function parseCycleLink(
  value: unknown,
  proposedCycle: ProposedCycle | null,
  cycles: PlanningContext['cycles'] | undefined,
  date: string,
): ProposedTaskLink {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object') throw invalidReply();
  const candidate = value as Record<string, unknown>;
  if (candidate.source === 'proposed') {
    if (!proposedCycle || date < proposedCycle.startDate || date > proposedCycle.endDate) throw invalidReply();
    const phaseIndex = candidate.phaseIndex === null || candidate.phaseIndex === undefined
      ? null
      : candidate.phaseIndex;
    if (
      phaseIndex !== null &&
      (!Number.isInteger(phaseIndex) || (phaseIndex as number) < 0 || (phaseIndex as number) >= proposedCycle.phases.length)
    ) throw invalidReply();
    if (phaseIndex !== null) {
      const phase = proposedCycle.phases[phaseIndex as number];
      if (date < phase.startDate || date > phase.endDate) throw invalidReply();
    }
    return { source: 'proposed', phaseIndex: phaseIndex as number | null };
  }
  if (candidate.source === 'existing') {
    const cycleId = requiredText(candidate.cycleId, 100);
    const phaseId = optionalId(candidate.phaseId);
    if (cycles) {
      const cycle = cycles.find((item) => item.id === cycleId);
      if (!cycle || date < cycle.startDate || date > cycle.endDate) throw invalidReply();
      if (phaseId) {
        const phase = cycle.phases.find((item) => item.id === phaseId);
        if (!phase || date < phase.startDate || date > phase.endDate) throw invalidReply();
      }
    }
    return { source: 'existing', cycleId, phaseId };
  }
  throw invalidReply();
}

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw invalidReply();
  return value.trim();
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) throw invalidReply();
  return value.trim() || null;
}

function optionalId(value: unknown): string | null {
  return optionalText(value, 100);
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !isValidDate(value)) throw invalidReply();
  return value;
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function daysBetween(startDate: string, endDate: string) {
  return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
}

function shiftDate(date: string, amount: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function invalidReply() {
  return new PlannerAiError('AI 產生的計畫格式不完整，請換個方式描述後再試。', 502);
}

export class PlannerAiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type { PlanningContext };
