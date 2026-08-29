import { getAuthorizedOwnerId } from '../../../lib/calendar-auth';
import { choosePlanningRange, createPlannerReply, PlannerAiError } from '../../../lib/planner-ai';
import { loadPlanningContext } from '../../../lib/planner-calendar';
import type { PlannerChatMessage } from '../../../lib/planner-types';
import { consumeRateLimit, rateLimited } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return Response.json({ error: '請先登入。' }, { status: 401 });

  const minuteLimit = await consumeRateLimit(request, 'assistant-minute', ownerId, 8, 60_000, false);
  if (!minuteLimit.allowed) return rateLimited(minuteLimit.retryAfter);
  const dailyLimit = await consumeRateLimit(request, 'assistant-day', ownerId, 40, 24 * 60 * 60 * 1000, false);
  if (!dailyLimit.allowed) return rateLimited(dailyLimit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }
  const parsed = parseRequest(body);
  if (!parsed) return Response.json({ error: '對話內容格式不正確或過長。' }, { status: 400 });

  try {
    const range = await choosePlanningRange(parsed.messages, parsed.currentDate);
    const context = await loadPlanningContext(ownerId, range.startDate, range.endDate);
    const reply = await createPlannerReply(
      parsed.messages,
      parsed.currentDate,
      parsed.timezone,
      context,
    );
    return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PlannerAiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'AI 暫時無法回應，請稍後再試。' }, { status: 502 });
  }
}

function parseRequest(body: unknown): {
  messages: PlannerChatMessage[];
  currentDate: string;
  timezone: string;
} | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  if (
    !Array.isArray(candidate.messages) ||
    candidate.messages.length < 1 ||
    candidate.messages.length > 12 ||
    typeof candidate.currentDate !== 'string' ||
    !isValidDate(candidate.currentDate) ||
    typeof candidate.timezone !== 'string' ||
    candidate.timezone.length < 1 ||
    candidate.timezone.length > 100
  ) return null;

  let totalLength = 0;
  const messages: PlannerChatMessage[] = [];
  for (const rawMessage of candidate.messages) {
    if (!rawMessage || typeof rawMessage !== 'object') return null;
    const message = rawMessage as Record<string, unknown>;
    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      !message.content.trim() ||
      message.content.length > 4_000
    ) return null;
    totalLength += message.content.length;
    messages.push({ role: message.role, content: message.content.trim() });
  }
  if (totalLength > 20_000 || messages.at(-1)?.role !== 'user') return null;
  return {
    messages,
    currentDate: candidate.currentDate,
    timezone: candidate.timezone,
  };
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

