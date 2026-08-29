import { ensureSchema } from '../../../db/ensure-schema';
import { getDatabaseBinding } from '../../../db';
import { getAuthorizedOwnerId } from '../../lib/calendar-auth';

export const dynamic = 'force-dynamic';

type DaySection = {
  id: string;
  title: string;
};

export async function GET(request: Request) {
  const ownerId = await getAuthorizedOwnerId(request);
  if (!ownerId) return unauthorized();

  await ensureSchema();
  const rows = await getDatabaseBinding()
    .prepare(`
      SELECT id, title FROM day_sections
      WHERE owner_id = ? ORDER BY position ASC
    `)
    .bind(ownerId)
    .all<DaySection>();

  return Response.json(
    { sections: rows.results },
    { headers: { 'Cache-Control': 'no-store' } },
  );
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

  const sections = parseSections(body);
  if (!sections) {
    return Response.json({ error: '每日分段格式不正確。' }, { status: 400 });
  }

  await ensureSchema();
  const db = getDatabaseBinding();
  const now = Date.now();
  const statements = [
    db.prepare('DELETE FROM day_sections WHERE owner_id = ?').bind(ownerId),
    ...sections.map((section, position) =>
      db
        .prepare(`
          INSERT INTO day_sections
            (id, owner_id, title, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(section.id, ownerId, section.title, position, now, now),
    ),
    sections.length
      ? db
        .prepare(`
          UPDATE tasks SET section_id = NULL, updated_at = ?
          WHERE owner_id = ? AND section_id IS NOT NULL
            AND section_id NOT IN (${sections.map(() => '?').join(', ')})
        `)
        .bind(now, ownerId, ...sections.map((section) => section.id))
      : db
        .prepare(`
          UPDATE tasks SET section_id = NULL, updated_at = ?
          WHERE owner_id = ? AND section_id IS NOT NULL
        `)
        .bind(now, ownerId),
  ];
  await db.batch(statements);

  return Response.json({ ok: true, sections });
}

function parseSections(body: unknown): DaySection[] | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.sections) || candidate.sections.length > 6) return null;

  const sections: DaySection[] = [];
  const ids = new Set<string>();
  for (const raw of candidate.sections) {
    if (!raw || typeof raw !== 'object') return null;
    const section = raw as Record<string, unknown>;
    if (
      typeof section.id !== 'string' ||
      section.id.length < 1 ||
      section.id.length > 100 ||
      ids.has(section.id) ||
      typeof section.title !== 'string' ||
      section.title.trim().length < 1 ||
      section.title.length > 50
    ) return null;
    ids.add(section.id);
    sections.push({ id: section.id, title: section.title.trim() });
  }
  return sections;
}

function unauthorized() {
  return Response.json({ error: '需要登入或有效的 agent 金鑰。' }, { status: 401 });
}
