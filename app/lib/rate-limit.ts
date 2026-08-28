import { ensureSchema } from '../../db/ensure-schema';
import { getDatabaseBinding } from '../../db';

type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

export async function consumeRateLimit(
  request: Request,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
  includeClientAddress = true,
): Promise<RateLimitResult> {
  await ensureSchema();
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const clientAddress =
    request.headers.get('cf-connecting-ip') ?? 'local';
  const key = await sha256(
    `${scope}:${includeClientAddress ? clientAddress : 'all'}:${subject}`,
  );
  const db = getDatabaseBinding();

  const row = await db
    .prepare(`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET
        window_start = excluded.window_start,
        count = CASE
          WHEN rate_limits.window_start = excluded.window_start
          THEN rate_limits.count + 1
          ELSE 1
        END
      RETURNING count
    `)
    .bind(key, windowStart)
    .first<{ count: number }>();

  await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(now - 24 * 60 * 60 * 1000)
    .run();

  return {
    allowed: Boolean(row && row.count <= limit),
    retryAfter: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
  };
}

export function rateLimited(retryAfter: number) {
  return Response.json(
    { error: '嘗試次數過多，請稍後再試。' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
