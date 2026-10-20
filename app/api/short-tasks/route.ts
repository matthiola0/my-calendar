import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';
import { isValidDate } from '../../lib/calendar-dates';

export const dynamic = 'force-dynamic';

type Occurrence = { id: string; date: string; text: string; done: number; recurrenceId: string | null; deadline: string };

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
  const date = new URL(request.url).searchParams.get('date');
  if (!date || !isValidDate(date)) return Response.json({ error: '日期格式不正確。' }, { status: 400 });
  await ensureSchema();
  const rows = await getDatabaseBinding().prepare(`
    SELECT id, date, text, done, recurrence_id AS recurrenceId, deadline
    FROM tasks WHERE owner_id = ? AND deadline IS NOT NULL
    ORDER BY date, id
  `).bind(ownerId).all<Occurrence>();
  const groups = new Map<string, Occurrence[]>();
  for (const occurrence of rows.results) {
    const key = occurrence.recurrenceId ? `series:${occurrence.recurrenceId}` : `task:${occurrence.id}`;
    const group = groups.get(key) ?? [];
    group.push(occurrence);
    groups.set(key, group);
  }
  const tasks = [...groups.entries()].flatMap(([id, occurrences]) => {
    const pending = occurrences.filter(item => !item.done);
    if (!pending.length) return [];
    const representative = occurrences.filter(item => item.date <= date).at(-1) ?? occurrences[0];
    const elapsedPendingOccurrences = pending.filter(item => item.date <= date).length;
    return [{
      id, recurrenceId: representative.recurrenceId, text: representative.text, deadline: representative.deadline,
      startDate: occurrences[0].date, endDate: occurrences.at(-1)!.date,
      status: representative.deadline < date ? 'overdue' : occurrences[0].date > date ? 'upcoming' : 'active',
      totalOccurrences: occurrences.length, completedOccurrences: occurrences.length - pending.length,
      pendingOccurrences: pending.length, elapsedPendingOccurrences, futurePendingOccurrences: pending.length - elapsedPendingOccurrences,
      occurrences: occurrences.map(item => ({ id: item.id, date: item.date, text: item.text, done: Boolean(item.done) })),
    }];
  }).sort((left, right) => left.deadline.localeCompare(right.deadline) || left.text.localeCompare(right.text) || left.id.localeCompare(right.id));
  return Response.json({ asOfDate: date, tasks, counts: {
    total: tasks.length,
    overdue: tasks.filter(task => task.status === 'overdue').length,
    active: tasks.filter(task => task.status === 'active').length,
    upcoming: tasks.filter(task => task.status === 'upcoming').length,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
