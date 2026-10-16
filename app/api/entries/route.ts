import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';
import { isValidDate } from '../../lib/calendar-dates';
import { parseEntry, readDayEntry, saveDayEntry } from '../../lib/calendar-entries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  const date = new URL(request.url).searchParams.get('date');
  if (!date || !isValidDate(date)) return invalidDate();

  await ensureSchema();
  const entry = await readDayEntry(getDatabaseBinding(), ownerId, date);
  return Response.json(entry, { headers: { 'Cache-Control': 'no-store' } });
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

  const parsed = parseEntry(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  await ensureSchema();
  const result = await saveDayEntry(getDatabaseBinding(), ownerId, parsed.date, parsed.entry);
  if (!result.ok) {
    if (result.reason === 'conflict') return conflict();
    return Response.json({ error: '綁定的大週期、階段或每日分段不存在。' }, { status: 400 });
  }
  return Response.json(result);
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}

function invalidDate() {
  return Response.json({ error: '日期格式不正確。' }, { status: 400 });
}

function conflict() {
  return Response.json(
    { error: '這一天已在其他裝置更新，請重新讀取後再試。' },
    { status: 409 },
  );
}
