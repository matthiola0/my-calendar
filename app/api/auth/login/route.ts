import {
  createPasswordSession,
  isPasswordAuthConfigured,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  verifyPasswordUser,
} from '../../../lib/auth';
import { consumeRateLimit, rateLimited } from '../../../lib/rate-limit';

export async function POST(request: Request) {
  if (!isPasswordAuthConfigured()) return unavailable();
  const ipLimit = await consumeRateLimit(
    request,
    'login-ip',
    '',
    30,
    15 * 60 * 1000,
  );
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidLogin();
  }
  if (!body || typeof body !== 'object') return invalidLogin();

  const { username, password } = body as Record<string, unknown>;
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !isValidUsername(normalizeUsername(username)) ||
    !isValidPassword(password)
  ) {
    return invalidLogin();
  }

  const accountLimit = await consumeRateLimit(
    request,
    'login-account',
    normalizeUsername(username),
    8,
    15 * 60 * 1000,
    false,
  );
  if (!accountLimit.allowed) return rateLimited(accountLimit.retryAfter);

  const user = await verifyPasswordUser(username, password);
  if (!user) return invalidLogin();

  const cookie = await createPasswordSession(
    user.id,
    new URL(request.url).protocol === 'https:',
  );
  return Response.json(
    { ok: true, displayName: user.displayName },
    { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } },
  );
}

function invalidLogin() {
  return Response.json({ error: '帳號或密碼不正確。' }, { status: 401 });
}

function unavailable() {
  return Response.json({ error: '帳號登入尚未完成設定。' }, { status: 503 });
}
