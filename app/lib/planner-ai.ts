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
): Promise<PlannerReply> {
  const result = await requestJson([
    {
      role: 'system',
      content: buildPlannerPrompt(currentDate, timezone, context),
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

function buildPlannerPrompt(currentDate: string, timezone: string, context: PlanningContext) {
  return `你是「日常」行事曆的繁體中文規劃助理。
今天是 ${currentDate}，使用者時區是 ${timezone}。

資料模型：
- 大週期包含名稱、目標、日期、獎勵與階段。
- 小週期是每天可完成的任務，可綁定既有或本次提案的大週期／階段，也可放進每日分段。

工作規則：
1. 只能根據下方已讀資料規劃，不可假裝看過其他日期。
2. 保留所有既有事項，不可提出刪除、覆蓋、移動或改寫既有任務。
3. 每天最多新增 3 個重要任務及 2 個可選任務，保留緩衝與休息。
4. 任務要具體、可開始、可在一天內完成；目標過大時拆小。
5. 新任務應在日期落於週期／階段範圍時才綁定。
6. 資訊不足時最多問 3 個真正影響計畫的問題，此時 proposal 必須是 null。
7. 只有使用者已提供足夠目標、期限與可投入時間時才建立提案。
8. 不提供醫療或心理健康診斷；明顯超載時建議縮小範圍。
9. 一次最多提出 ${MAX_PROPOSAL_TASKS} 個新任務；較長計畫先安排最接近的部分。

cycleLink 格式：
- 不綁定：null
- 綁既有：{"source":"existing","cycleId":"資料中的 id","phaseId":"資料中的 id 或 null"}
- 綁本次新週期：{"source":"proposed","phaseIndex":0 起算的階段索引或 null}

只能輸出一個 JSON 物件，不能使用 Markdown。格式：
{
  "message": "給使用者的回覆",
  "questions": ["必要問題"],
  "proposal": null 或 {
    "summary": "提案摘要",
    "cycle": null 或 {
      "title": "名稱",
      "goal": "可驗證成果",
      "reward": "獎勵或空字串",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "phases": [{"title":"階段","description":"完成條件","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]
    },
    "tasks": [{
      "date":"YYYY-MM-DD",
      "text":"任務",
      "sectionId":"既有分段 id 或 null",
      "cycleLink": null,
      "habitCue": null,
      "tinyStart": null,
      "identity": null
    }]
  }
}

已讀行事曆資料：
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
