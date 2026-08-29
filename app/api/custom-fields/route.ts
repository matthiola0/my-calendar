import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CustomFieldRow = {
  id: string;
  title: string;
  content: string;
};

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  const date = new URL(request.url).searchParams.get('date');
  if (!date || !isValidDate(date)) return invalidDate();

  await ensureSchema();
  const rows = await getDatabaseBinding()
    .prepare(`
      SELECT fields.id, fields.title, COALESCE(entries.content, '') AS content
      FROM custom_fields AS fields
      LEFT JOIN custom_field_entries AS entries
        ON entries.owner_id = fields.owner_id
        AND entries.field_id = fields.id
        AND entries.date = ?
      WHERE fields.owner_id = ?
      ORDER BY fields.position ASC
    `)
    .bind(date, ownerId)
    .all<CustomFieldRow>();

  return Response.json(
    { fields: rows.results },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }
  const title = readString(body, 'title', 100);
  if (!title) return Response.json({ error: '請輸入紀錄欄位名稱。' }, { status: 400 });

  await ensureSchema();
  const db = getDatabaseBinding();
  const count = await db
    .prepare('SELECT COUNT(*) AS count FROM custom_fields WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= 12) {
    return Response.json({ error: '自訂紀錄欄位最多 12 個。' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(`
      INSERT INTO custom_fields
        (id, owner_id, title, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(id, ownerId, title, count?.count ?? 0, now, now)
    .run();

  return Response.json({ field: { id, title, content: '' } });
}

export async function PUT(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '缺少紀錄內容。' }, { status: 400 });
  }
  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length < 1 ||
    candidate.id.length > 100 ||
    typeof candidate.date !== 'string' ||
    !isValidDate(candidate.date) ||
    typeof candidate.content !== 'string' ||
    candidate.content.length > 20_000
  ) {
    return Response.json({ error: '紀錄內容格式不正確或過長。' }, { status: 400 });
  }

  await ensureSchema();
  const db = getDatabaseBinding();
  const field = await db
    .prepare('SELECT id FROM custom_fields WHERE owner_id = ? AND id = ?')
    .bind(ownerId, candidate.id)
    .first<{ id: string }>();
  if (!field) return Response.json({ error: '找不到這個紀錄欄位。' }, { status: 404 });

  await db
    .prepare(`
      INSERT INTO custom_field_entries
        (owner_id, field_id, date, content, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, field_id, date) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at
    `)
    .bind(ownerId, candidate.id, candidate.date, candidate.content, Date.now())
    .run();

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON 格式不正確。' }, { status: 400 });
  }
  const id = readString(body, 'id', 100);
  if (!id) return Response.json({ error: '缺少紀錄欄位。' }, { status: 400 });

  await ensureSchema();
  const db = getDatabaseBinding();
  await db.batch([
    db
      .prepare('DELETE FROM custom_field_entries WHERE owner_id = ? AND field_id = ?')
      .bind(ownerId, id),
    db.prepare('DELETE FROM custom_fields WHERE owner_id = ? AND id = ?').bind(ownerId, id),
  ]);
  return Response.json({ ok: true });
}

function readString(body: unknown, key: string, maxLength: number) {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) return null;
  return value.trim();
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}

function invalidDate() {
  return Response.json({ error: '日期格式不正確。' }, { status: 400 });
}
