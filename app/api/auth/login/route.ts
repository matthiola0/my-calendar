import {
  createPasswordSession,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  verifyPasswordUser,
} from '../../../auth';

export async function POST(request: Request) {
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
