// Keep practice context bounded and scoped to the authenticated calendar owner.
export type PracticeContext = {
  since: string;
  through: string;
  limits: { attempts: number; sessions: number; noteCharacters: number };
  attempts: Array<{ problemId: string; title: string; difficulty: string; attemptedOn: string; status: string; notes: string }>;
  sessions: Array<{ problemId: string; title: string; date: string; done: boolean }>;
};

export async function loadPracticeContext(db: D1Database, ownerId: string, today: string): Promise<PracticeContext> {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const since = start.toISOString().slice(0, 10);
  const [attempts, sessions] = await Promise.all([
    db.prepare(`
      SELECT a.problem_id AS problemId, p.title, p.difficulty,
        a.attempted_on AS attemptedOn, a.status, substr(a.notes, 1, 500) AS notes
      FROM leetcode_attempts a
      JOIN leetcode_problems p ON p.id = a.problem_id AND p.owner_id = a.owner_id
      WHERE a.owner_id = ? AND a.attempted_on BETWEEN ? AND ?
      ORDER BY a.attempted_on DESC, a.created_at DESC, a.id DESC LIMIT 60
    `).bind(ownerId, since, today).all<PracticeContext['attempts'][number]>(),
    db.prepare(`
      SELECT t.leetcode_problem_id AS problemId, p.title, t.date, t.done
      FROM tasks t
      JOIN leetcode_problems p ON p.id = t.leetcode_problem_id AND p.owner_id = t.owner_id
      WHERE t.owner_id = ? AND t.date BETWEEN ? AND ?
      ORDER BY t.date DESC, t.position, t.id LIMIT 100
    `).bind(ownerId, since, today).all<{ problemId: string; title: string; date: string; done: number }>(),
  ]);
  return {
    since, through: today, limits: { attempts: 60, sessions: 100, noteCharacters: 500 },
    attempts: attempts.results,
    sessions: sessions.results.map(session => ({ ...session, done: Boolean(session.done) })),
  };
}

export async function ownsPracticeProblems(db: D1Database, ownerId: string, problemIds: string[]) {
  const ids = [...new Set(problemIds)];
  if (!ids.length) return true;
  const rows = await db.prepare(`
    SELECT id FROM leetcode_problems WHERE owner_id = ? AND id IN (${ids.map(() => '?').join(',')})
  `).bind(ownerId, ...ids).all<{ id: string }>();
  return rows.results.length === ids.length;
}
