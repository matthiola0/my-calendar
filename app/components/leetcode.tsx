'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Language, useI18n } from '../lib/i18n';

type AttemptStatus = 'stuck' | 'hinted' | 'solved' | 'reviewed';
type Attempt = {
  id: string;
  taskId: string | null;
  attemptedOn: string;
  status: AttemptStatus;
  notes: string;
  attemptNumber: number;
  createdAt: number;
};
type ScheduledTask = { id: string; date: string; done: boolean };
type Problem = {
  id: string;
  title: string;
  url: string;
  difficulty: 'easy' | 'medium' | 'hard';
  plannedDate: string | null;
  attempts: Attempt[];
  scheduledTasks: ScheduledTask[];
};

const copy = {
  en: {
    eyebrow: 'LEETCODE · PRACTICE DATABASE', title: 'See every attempt, not just the final answer.',
    description: 'Plan problems into Daily, then keep the date, outcome, and notes from every attempt in one place.',
    addTitle: 'Add a planned problem', problem: 'Problem', problemPlaceholder: 'e.g. 1. Two Sum',
    url: 'Problem URL (optional)', difficulty: 'Difficulty', plannedDate: 'Plan into Daily',
    add: 'Add problem', adding: 'Adding…', easy: 'Easy', medium: 'Medium', hard: 'Hard',
    planned: 'Open plans', attempted: 'Attempts', solved: 'Problems solved', search: 'Search problems…',
    all: 'All', open: 'Needs work', solvedFilter: 'Solved', tableProblem: 'Problem', tablePlan: 'Plan',
    tableAttempts: 'Attempt history', tableActions: 'Next step', noAttempts: 'No attempts yet',
    scheduled: 'Scheduled', done: 'done', schedule: 'Plan into Daily', record: 'Record attempt',
    empty: 'No matching problems yet.', loadError: 'Could not load your LeetCode database.',
    saveError: 'Could not save. Please try again.', alreadyScheduled: 'Already planned for that date.',
    attemptTitle: 'Complete this attempt', attemptHelp: 'Choose the outcome and leave one useful note for next time.',
    attemptDate: 'Date', outcome: 'Outcome', notes: 'Notes', notesPlaceholder: 'What approach did you use? Where did you get stuck? What should you remember?',
    cancel: 'Cancel', saveAttempt: 'Save attempt', saving: 'Saving…',
    stuck: 'Stuck', hinted: 'Solved with hints', solvedStatus: 'Solved independently', reviewed: 'Review passed',
    attemptNumber: 'Attempt {count}', expand: 'View full history', collapse: 'Hide history',
  },
  zh: {
    eyebrow: 'LEETCODE · 練習資料庫', title: '看見每一次作答，不只最後的答案。',
    description: '把規劃題目排進每日，並在同一處保留每次日期、狀況與筆記。',
    addTitle: '加入規劃題目', problem: '題目', problemPlaceholder: '例如：1. Two Sum',
    url: '題目網址（選填）', difficulty: '難度', plannedDate: '排入每日',
    add: '加入題庫', adding: '加入中…', easy: '簡單', medium: '中等', hard: '困難',
    planned: '待練習', attempted: '累積作答', solved: '已掌握題目', search: '搜尋題目…',
    all: '全部', open: '待加強', solvedFilter: '已掌握', tableProblem: '題目', tablePlan: '規劃',
    tableAttempts: '作答紀錄', tableActions: '下一步', noAttempts: '尚未作答',
    scheduled: '已排入', done: '完成', schedule: '排入每日', record: '直接記錄',
    empty: '目前沒有符合條件的題目。', loadError: '無法讀取 LeetCode 題庫。',
    saveError: '儲存失敗，請再試一次。', alreadyScheduled: '這天已經排過這道題目。',
    attemptTitle: '完成這次作答', attemptHelp: '選擇作答狀況，留一點下次看得懂的筆記。',
    attemptDate: '作答日期', outcome: '作答狀況', notes: '筆記', notesPlaceholder: '用了什麼解法？卡在哪裡？下次要記得什麼？',
    cancel: '取消', saveAttempt: '儲存作答', saving: '儲存中…',
    stuck: '卡住', hinted: '提示後完成', solvedStatus: '獨立完成', reviewed: '複習通過',
    attemptNumber: '第 {count} 次', expand: '展開完整紀錄', collapse: '收起紀錄',
  },
  ja: {
    eyebrow: 'LEETCODE · 練習データベース', title: '正解だけでなく、すべての挑戦を残す。',
    description: '問題をデイリーに予定し、各回の日付・結果・メモを一か所に蓄積します。',
    addTitle: '予定問題を追加', problem: '問題', problemPlaceholder: '例：1. Two Sum',
    url: '問題URL（任意）', difficulty: '難易度', plannedDate: 'デイリーに予定',
    add: '問題を追加', adding: '追加中…', easy: 'Easy', medium: 'Medium', hard: 'Hard',
    planned: '未完了の予定', attempted: '挑戦回数', solved: '習得済み', search: '問題を検索…',
    all: 'すべて', open: '要復習', solvedFilter: '習得済み', tableProblem: '問題', tablePlan: '予定',
    tableAttempts: '挑戦履歴', tableActions: '次の一歩', noAttempts: 'まだ記録がありません',
    scheduled: '予定済み', done: '完了', schedule: 'デイリーに予定', record: '挑戦を記録',
    empty: '条件に合う問題がありません。', loadError: 'LeetCodeデータベースを読み込めませんでした。',
    saveError: '保存できませんでした。もう一度お試しください。', alreadyScheduled: 'この日にはすでに予定されています。',
    attemptTitle: '今回の挑戦を完了', attemptHelp: '結果を選び、次回に役立つメモを残してください。',
    attemptDate: '日付', outcome: '結果', notes: 'メモ', notesPlaceholder: 'どの方法を使った？どこで詰まった？次回覚えておくことは？',
    cancel: 'キャンセル', saveAttempt: '挑戦を保存', saving: '保存中…',
    stuck: '詰まった', hinted: 'ヒントで解決', solvedStatus: '自力で解決', reviewed: '復習クリア',
    attemptNumber: '{count}回目', expand: '履歴をすべて表示', collapse: '履歴を閉じる',
  },
} satisfies Record<Language, Record<string, string>>;

function format(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function AttemptDialog({
  problemTitle,
  date,
  saving,
  lockDate = false,
  error = '',
  onCancel,
  onSave,
}: {
  problemTitle: string;
  date: string;
  saving: boolean;
  lockDate?: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (value: { attemptedOn: string; status: AttemptStatus; notes: string }) => void;
}) {
  const { language } = useI18n();
  const m = copy[language];
  const [attemptedOn, setAttemptedOn] = useState(date);
  const [status, setStatus] = useState<AttemptStatus>('solved');
  const [notes, setNotes] = useState('');

  return (
    <div className="attempt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <section className="attempt-dialog" role="dialog" aria-modal="true" aria-labelledby="attempt-dialog-title">
        <div className="attempt-dialog-heading">
          <div><p>{m.attemptTitle}</p><h2 id="attempt-dialog-title">{problemTitle}</h2></div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label={m.cancel}>×</button>
        </div>
        <p className="attempt-dialog-help">{m.attemptHelp}</p>
        <div className="attempt-dialog-fields">
          <label><span>{m.attemptDate}</span><input type="date" value={attemptedOn} onChange={(event) => setAttemptedOn(event.target.value)} disabled={saving || lockDate} /></label>
          <label><span>{m.outcome}</span><select value={status} onChange={(event) => setStatus(event.target.value as AttemptStatus)} disabled={saving}><option value="stuck">{m.stuck}</option><option value="hinted">{m.hinted}</option><option value="solved">{m.solvedStatus}</option><option value="reviewed">{m.reviewed}</option></select></label>
          <label className="attempt-notes-field"><span>{m.notes}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={m.notesPlaceholder} maxLength={10_000} autoFocus disabled={saving} /></label>
        </div>
        {error && <p className="attempt-dialog-error" role="alert">{error}</p>}
        <div className="attempt-dialog-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>{m.cancel}</button><button className="primary-button" type="button" onClick={() => onSave({ attemptedOn, status, notes: notes.trim() })} disabled={saving || !attemptedOn || !notes.trim()}>{saving ? m.saving : m.saveAttempt}</button></div>
      </section>
    </div>
  );
}

export default function LeetCode({ onCalendarChanged }: { onCalendarChanged: () => void }) {
  const { language, locale } = useI18n();
  const m = copy[language];
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [difficulty, setDifficulty] = useState<Problem['difficulty']>('medium');
  const [plannedDate, setPlannedDate] = useState(todayKey);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'solved'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({});
  const [attemptProblem, setAttemptProblem] = useState<Problem | null>(null);

  const load = async () => {
    const response = await fetch('/api/leetcode', { cache: 'no-store' });
    if (!response.ok) throw new Error(m.loadError);
    const result = await response.json() as { problems: Problem[] };
    setProblems(result.problems);
  };

  useEffect(() => {
    let active = true;
    fetch('/api/leetcode', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: { problems: Problem[] }) => { if (active) setProblems(result.problems); })
      .catch(() => { if (active) setMessage(m.loadError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [m.loadError]);

  const stats = useMemo(() => ({
    planned: problems.flatMap((problem) => problem.scheduledTasks).filter((task) => !task.done).length,
    attempted: problems.reduce((sum, problem) => sum + problem.attempts.length, 0),
    solved: problems.filter((problem) => problem.attempts.some((attempt) => attempt.status === 'solved' || attempt.status === 'reviewed')).length,
  }), [problems]);

  const filtered = useMemo(() => problems.filter((problem) => {
    const matchesSearch = problem.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const mastered = problem.attempts.some((attempt) => attempt.status === 'solved' || attempt.status === 'reviewed');
    return matchesSearch && (filter === 'all' || (filter === 'solved' ? mastered : !mastered));
  }), [filter, problems, search]);

  const createProblem = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, url, difficulty, plannedDate }) });
      if (!response.ok) throw new Error();
      setTitle('');
      setUrl('');
      await load();
      onCalendarChanged();
    } catch {
      setMessage(m.saveError);
    } finally {
      setSaving(false);
    }
  };

  const scheduleProblem = async (problem: Problem) => {
    const date = scheduleDates[problem.id] || todayKey();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'schedule', problemId: problem.id, date }) });
      if (!response.ok) throw new Error();
      const result = await response.json() as { created: boolean };
      if (!result.created) setMessage(m.alreadyScheduled);
      await load();
      onCalendarChanged();
    } catch {
      setMessage(m.saveError);
    } finally {
      setSaving(false);
    }
  };

  const recordAttempt = async (value: { attemptedOn: string; status: AttemptStatus; notes: string }) => {
    if (!attemptProblem) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'attempt', problemId: attemptProblem.id, ...value }) });
      if (!response.ok) throw new Error();
      setAttemptProblem(null);
      await load();
    } catch {
      setMessage(m.saveError);
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = (status: AttemptStatus) => ({ stuck: m.stuck, hinted: m.hinted, solved: m.solvedStatus, reviewed: m.reviewed }[status]);
  const difficultyLabel = (value: Problem['difficulty']) => ({ easy: m.easy, medium: m.medium, hard: m.hard }[value]);
  const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <section className="leetcode-view">
      <div className="leetcode-hero">
        <div><p className="eyebrow">{m.eyebrow}</p><h1>{m.title}</h1><p>{m.description}</p></div>
        <dl className="leetcode-stats"><div><dt>{m.planned}</dt><dd>{stats.planned}</dd></div><div><dt>{m.attempted}</dt><dd>{stats.attempted}</dd></div><div><dt>{m.solved}</dt><dd>{stats.solved}</dd></div></dl>
      </div>

      <form className="card leetcode-create" onSubmit={createProblem}>
        <div><p className="section-number">01</p><h2>{m.addTitle}</h2></div>
        <label className="leetcode-title-field"><span>{m.problem}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={m.problemPlaceholder} maxLength={200} /></label>
        <label><span>{m.difficulty}</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Problem['difficulty'])}><option value="easy">{m.easy}</option><option value="medium">{m.medium}</option><option value="hard">{m.hard}</option></select></label>
        <label><span>{m.plannedDate}</span><input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
        <label className="leetcode-url-field"><span>{m.url}</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://leetcode.com/problems/…" maxLength={500} /></label>
        <button className="primary-button" type="submit" disabled={saving || !title.trim()}>{saving ? m.adding : m.add}</button>
      </form>

      {message && <p className="leetcode-message" role="status">{message}</p>}

      <section className="leetcode-library" aria-busy={loading}>
        <div className="leetcode-toolbar"><div><p className="section-number">02</p><h2>{m.tableAttempts}</h2></div><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={m.search} /><div className="leetcode-filters" role="group"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{m.all}</button><button type="button" className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>{m.open}</button><button type="button" className={filter === 'solved' ? 'active' : ''} onClick={() => setFilter('solved')}>{m.solvedFilter}</button></div></div>
        <div className="leetcode-database">
          <div className="leetcode-db-head" aria-hidden="true"><span>{m.tableProblem}</span><span>{m.difficulty}</span><span>{m.tablePlan}</span><span>{m.tableAttempts}</span><span>{m.tableActions}</span></div>
          {!loading && filtered.length === 0 ? <p className="leetcode-empty">{m.empty}</p> : filtered.map((problem) => {
            const latest = problem.attempts.at(-1);
            const isExpanded = expanded === problem.id;
            return (
              <article className={isExpanded ? 'leetcode-db-row expanded' : 'leetcode-db-row'} key={problem.id}>
                <div className="leetcode-problem-cell"><button type="button" onClick={() => setExpanded(isExpanded ? null : problem.id)}><strong>{problem.title}</strong><small>{isExpanded ? m.collapse : m.expand}</small></button>{problem.url && <a href={problem.url} target="_blank" rel="noreferrer" aria-label={`${problem.title} LeetCode`}>↗</a>}</div>
                <span className={`difficulty-pill ${problem.difficulty}`}>{difficultyLabel(problem.difficulty)}</span>
                <div className="leetcode-plan-cell">{problem.scheduledTasks.length ? problem.scheduledTasks.slice(-2).map((task) => <span key={task.id}>{formatDate(task.date)} · {task.done ? m.done : m.scheduled}</span>) : <span>—</span>}</div>
                <div className="leetcode-attempt-summary">{latest ? <><strong>{format(m.attemptNumber, { count: latest.attemptNumber })}</strong><span className={`attempt-status ${latest.status}`}>{statusLabel(latest.status)}</span><small>{formatDate(latest.attemptedOn)}</small></> : <span>{m.noAttempts}</span>}</div>
                <div className="leetcode-row-actions"><label><span className="sr-only">{m.plannedDate}</span><input type="date" value={scheduleDates[problem.id] || todayKey()} onChange={(event) => setScheduleDates((current) => ({ ...current, [problem.id]: event.target.value }))} /></label><button type="button" onClick={() => void scheduleProblem(problem)} disabled={saving}>{m.schedule}</button><button type="button" onClick={() => setAttemptProblem(problem)} disabled={saving}>{m.record}</button></div>
                {isExpanded && <div className="leetcode-attempt-history">{problem.attempts.length ? problem.attempts.map((attempt) => <section key={attempt.id}><div><strong>{format(m.attemptNumber, { count: attempt.attemptNumber })}</strong><time>{formatDate(attempt.attemptedOn)}</time><span className={`attempt-status ${attempt.status}`}>{statusLabel(attempt.status)}</span></div><p>{attempt.notes}</p></section>) : <p>{m.noAttempts}</p>}</div>}
              </article>
            );
          })}
        </div>
      </section>

      {attemptProblem && <AttemptDialog problemTitle={attemptProblem.title} date={todayKey()} saving={saving} onCancel={() => setAttemptProblem(null)} onSave={(value) => void recordAttempt(value)} />}
    </section>
  );
}
