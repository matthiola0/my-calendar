import { getCurrentUser } from '../../lib/auth';
import { createAgentToken, listAgentTokens, revokeAgentToken } from '../../lib/agent-access';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return reply({ error: '請先登入帳號。' }, 401);
  return reply({ tokens: await listAgentTokens(user.ownerId) });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return reply({ error: '不允許跨網站操作。' }, 403);
  const user = await getCurrentUser(request);
  if (!user) return reply({ error: '請先登入帳號。' }, 401);
  const body = await readBody(request);
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.trim().length > 80) {
    return reply({ error: '請填寫 1 到 80 字的授權名稱。' }, 400);
  }
  const created = await createAgentToken(user.ownerId, body.name.trim());
  if (!created) return reply({ error: '最多可保留 10 組有效授權，請先撤銷不再使用的授權。' }, 409);
  return reply(created, 201);
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return reply({ error: '不允許跨網站操作。' }, 403);
  const user = await getCurrentUser(request);
  if (!user) return reply({ error: '請先登入帳號。' }, 401);
  const body = await readBody(request);
  if (typeof body?.id !== 'string' || !body.id || body.id.length > 100) {
    return reply({ error: '請提供授權 ID。' }, 400);
  }
  const revoked = await revokeAgentToken(user.ownerId, body.id);
  if (!revoked) return reply({ error: '找不到這組授權。' }, 404);
  return reply({ ok: true });
}

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  // Non-browser session clients may omit Origin; browsers must remain same-origin.
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
