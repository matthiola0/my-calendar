import { getAuthorizedOwnerId } from '../../../lib/calendar-auth';
import { parseProposal, PlannerAiError } from '../../../lib/planner-ai';
import { applyPlannerProposal, PlannerApplyError } from '../../../lib/planner-calendar';
import { consumeRateLimit, rateLimited } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return Response.json({ error: '請先登入。' }, { status: 401 });

  const limit = await consumeRateLimit(request, 'assistant-apply', ownerId, 12, 60_000, false);
  if (!limit.allowed) return rateLimited(limit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '缺少 AI 提案。' }, { status: 400 });
  }

  try {
    const proposal = parseProposal((body as Record<string, unknown>).proposal);
    const result = await applyPlannerProposal(ownerId, proposal);
    return Response.json(result);
  } catch (error) {
    if (error instanceof PlannerApplyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PlannerAiError) {
      return Response.json({ error: 'AI 提案格式不正確。' }, { status: 400 });
    }
    return Response.json({ error: '無法套用這份提案，請重新產生後再試。' }, { status: 500 });
  }
}
