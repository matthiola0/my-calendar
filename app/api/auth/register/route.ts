import {
  createPasswordSession,
  createPasswordUser,
  isPasswordAuthConfigured,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
} from '../../../lib/auth';
import { consumeRateLimit, rateLimited } from '../../../lib/rate-limit';

export async function POST(request: Request) {
  if (!isPasswordAuthConfigured()) return unavailable();
  const limit = await consumeRateLimit(
    request,
    'register-ip',
    '',
    10,
    60 * 60 * 1000,
  );
  if (!limit.allowed) return rateLimited(limit.retryAfter);

  const credentials = await parseCredentials(request);
  if (!credentials) return invalidCredentials();

  const user = await createPasswordUser(credentials.username, credentials.password);
  if (!user) {
    return Response.json({ error: '這個帳號已被使用。' }, { status: 409 });
  }

  const cookie = await createPasswordSession(
    user.id,
    new URL(request.url).protocol === 'https:',
  );
  return Response.json(
    { ok: true, displayName: user.displayName },
    { status: 201, headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } },
  );
}

async function parseCredentials(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized) || !isValidPassword(password)) return null;
  return { username: username.trim(), password };
}

function invalidCredentials() {
  return Response.json(
    { error: '帳號需為 3–30 個英數字、_ 或 -；密碼至少 10 個字元。' },
    { status: 400 },
  );
}

function unavailable() {
  return Response.json({ error: '帳號註冊尚未完成設定。' }, { status: 503 });
}
