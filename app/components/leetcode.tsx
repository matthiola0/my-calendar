'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';

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
type LeetCodeList = { id: string; title: string; position: number };
type Problem = {
  id: string;
  title: string;
  url: string;
  difficulty: 'easy' | 'medium' | 'hard';
  plannedDate: string | null;
  listId: string | null;
  listPosition: number;
  attempts: Attempt[];
  scheduledTasks: ScheduledTask[];
};

const copy = {
  en: {
    eyebrow: 'LEETCODE · PRACTICE PLANNER', title: 'A clear path through every problem and attempt.',
    description: 'Organize problems into lists, keep your own order, and open the full note from any attempt.',
    planned: 'Open plans', attempted: 'Attempts', solved: 'Problems solved', addTitle: 'Add a planned problem',
    problem: 'Problem', problemPlaceholder: 'e.g. 1. Two Sum', url: 'Problem URL (optional)', difficulty: 'Difficulty',
    plannedDate: 'Plan into Daily', destination: 'List', add: 'Add problem', adding: 'Adding…',
    easy: 'Easy', medium: 'Medium', hard: 'Hard', collections: 'Lists', allProblems: 'All problems',
    allProblemsHelp: 'Sorted by problem number', customOrder: 'Custom order', unfiled: 'No list',
    newList: 'New list', listPlaceholder: 'List name', createList: 'Create', search: 'Search problems…',
    all: 'All', open: 'Needs work', solvedFilter: 'Solved', empty: 'No matching problems yet.',
    loadError: 'Could not load your LeetCode planner.', saveError: 'Could not save. Please try again.',
    alreadyScheduled: 'Already planned for that date.', schedule: 'Plan', record: '+ Attempt', scheduled: 'scheduled', done: 'done',
    noAttempts: 'No attempt yet', attemptNumber: 'Attempt {count}', moveUp: 'Move up', moveDown: 'Move down',
    attemptTitle: 'Complete this attempt', attemptHelp: 'Choose the outcome and leave one useful note for next time.',
    attemptDate: 'Date', outcome: 'Outcome', notes: 'Notes',
    notesPlaceholder: 'What approach did you use? Where did you get stuck? What should you remember?',
    cancel: 'Cancel', saveAttempt: 'Save attempt', saving: 'Saving…', stuck: 'Stuck', hinted: 'Solved with hints',
    solvedStatus: 'Solved independently', reviewed: 'Review passed', noteTitle: 'Attempt note',
    noteHint: 'Your complete note from this attempt.', close: 'Close', tableProblem: 'Problem & plan',
  },
  zh: {
    eyebrow: 'LEETCODE · 練習規劃', title: '每份題單、每次作答，都有清楚的位置。',
    description: '用不同清單整理規劃，保留自訂順序，點任何一次作答就能閱讀完整心得。',
    planned: '待練習', attempted: '累積作答', solved: '已掌握題目', addTitle: '加入規劃題目',
    problem: '題目', problemPlaceholder: '例如：1. Two Sum', url: '題目網址（選填）', difficulty: '難度',
    plannedDate: '排入每日', destination: '放入清單', add: '加入題庫', adding: '加入中…',
    easy: '簡單', medium: '中等', hard: '困難', collections: '題目清單', allProblems: '全部題目',
    allProblemsHelp: '固定依題號排序', customOrder: '自訂順序', unfiled: '未分類',
    newList: '新增清單', listPlaceholder: '清單名稱', createList: '建立', search: '搜尋題目…',
    all: '全部', open: '待加強', solvedFilter: '已掌握', empty: '目前沒有符合條件的題目。',
    loadError: '無法讀取 LeetCode 規劃。', saveError: '儲存失敗，請再試一次。',
    alreadyScheduled: '這天已經排過這道題目。', schedule: '排入', record: '+ 作答', scheduled: '已排入', done: '完成',
    noAttempts: '尚未作答', attemptNumber: 'Attempt {count}', moveUp: '往上移', moveDown: '往下移',
    attemptTitle: '完成這次作答', attemptHelp: '選擇作答狀況，留一點下次看得懂的筆記。',
    attemptDate: '作答日期', outcome: '作答狀況', notes: '心得筆記',
    notesPlaceholder: '用了什麼解法？卡在哪裡？下次要記得什麼？',
    cancel: '取消', saveAttempt: '儲存作答', saving: '儲存中…', stuck: '卡住', hinted: '提示後完成',
    solvedStatus: '獨立完成', reviewed: '複習通過', noteTitle: '作答心得',
    noteHint: '這是當次保留的完整筆記。', close: '關閉', tableProblem: '題目與規劃',
  },
  ja: {
    eyebrow: 'LEETCODE · 練習プランナー', title: '問題リストと挑戦履歴を、迷わず見渡す。',
    description: 'リストごとに問題を整理し、独自の順番を保ち、各挑戦のメモをすぐに開けます。',
    planned: '未完了の予定', attempted: '挑戦回数', solved: '習得済み', addTitle: '予定問題を追加',
    problem: '問題', problemPlaceholder: '例：1. Two Sum', url: '問題URL（任意）', difficulty: '難易度',
    plannedDate: 'デイリーに予定', destination: 'リスト', add: '問題を追加', adding: '追加中…',
    easy: 'Easy', medium: 'Medium', hard: 'Hard', collections: '問題リスト', allProblems: 'すべての問題',
    allProblemsHelp: '問題番号順', customOrder: 'カスタム順', unfiled: '未分類',
    newList: '新しいリスト', listPlaceholder: 'リスト名', createList: '作成', search: '問題を検索…',
    all: 'すべて', open: '要復習', solvedFilter: '習得済み', empty: '条件に合う問題がありません。',
    loadError: 'LeetCodeプランナーを読み込めませんでした。', saveError: '保存できませんでした。もう一度お試しください。',
    alreadyScheduled: 'この日にはすでに予定されています。', schedule: '予定', record: '+ 挑戦', scheduled: '予定済み', done: '完了',
    noAttempts: 'まだ挑戦がありません', attemptNumber: 'Attempt {count}', moveUp: '上へ', moveDown: '下へ',
    attemptTitle: '今回の挑戦を完了', attemptHelp: '結果を選び、次回に役立つメモを残してください。',
    attemptDate: '日付', outcome: '結果', notes: 'メモ',
    notesPlaceholder: 'どの方法を使った？どこで詰まった？次回覚えておくことは？',
    cancel: 'キャンセル', saveAttempt: '挑戦を保存', saving: '保存中…', stuck: '詰まった', hinted: 'ヒントで解決',
    solvedStatus: '自力で解決', reviewed: '復習クリア', noteTitle: '挑戦メモ',
    noteHint: 'この挑戦で保存した完全なメモです。', close: '閉じる', tableProblem: '問題と予定',
  },
};

function format(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function compareProblemNumbers(left: Problem, right: Problem) {
  const numberOf = (title: string) => {
    const match = title.trim().match(/^#?(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  return numberOf(left.title) - numberOf(right.title) || left.title.localeCompare(right.title);
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
  const [lists, setLists] = useState<LeetCodeList[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [activeList, setActiveList] = useState<'all' | string>('all');
  const [newListTitle, setNewListTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [difficulty, setDifficulty] = useState<Problem['difficulty']>('medium');
  const [plannedDate, setPlannedDate] = useState(todayKey);
  const [addListId, setAddListId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'solved'>('all');
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({});
  const [attemptProblem, setAttemptProblem] = useState<Problem | null>(null);
  const [detail, setDetail] = useState<{ problem: Problem; attempt: Attempt } | null>(null);

  const load = async () => {
    const response = await fetch('/api/leetcode', { cache: 'no-store' });
    if (!response.ok) throw new Error(m.loadError);
    const result = await response.json() as { lists: LeetCodeList[]; problems: Problem[] };
    setLists(result.lists);
    setProblems(result.problems);
    return result;
  };

  useEffect(() => {
    let active = true;
    fetch('/api/leetcode', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ lists: LeetCodeList[]; problems: Problem[] }>;
      })
      .then((result) => {
        if (active) {
          setLists(result.lists);
          setProblems(result.problems);
        }
      })
      .catch(() => { if (active) setMessage(m.loadError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [m.loadError]);

  const stats = useMemo(() => ({
    planned: problems.flatMap((problem) => problem.scheduledTasks).filter((task) => !task.done).length,
    attempted: problems.reduce((sum, problem) => sum + problem.attempts.length, 0),
    solved: problems.filter((problem) => problem.attempts.some((attempt) => attempt.status === 'solved' || attempt.status === 'reviewed')).length,
  }), [problems]);

  const selectedProblems = useMemo(() => {
    if (activeList === 'all') return [...problems].sort(compareProblemNumbers);
    return problems.filter((problem) => problem.listId === activeList)
      .sort((left, right) => left.listPosition - right.listPosition);
  }, [activeList, problems]);

  const visibleProblems = useMemo(() => selectedProblems.filter((problem) => {
    const matchesSearch = problem.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const mastered = problem.attempts.some((attempt) => attempt.status === 'solved' || attempt.status === 'reviewed');
    return matchesSearch && (filter === 'all' || (filter === 'solved' ? mastered : !mastered));
  }), [filter, search, selectedProblems]);

  const activeListTitle = activeList === 'all'
    ? m.allProblems
    : lists.find((list) => list.id === activeList)?.title ?? m.allProblems;
  const maxAttemptColumns = Math.max(3, ...problems.map((problem) => Math.max(0, ...problem.attempts.map((attempt) => attempt.attemptNumber))));
  const matrixStyle = { gridTemplateColumns: `minmax(330px, 390px) repeat(${maxAttemptColumns}, 176px)` };
  const canReorder = activeList !== 'all' && filter === 'all' && !search.trim();

  const createProblem = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, url, difficulty, plannedDate, listId: addListId || null }) });
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

  const createList = async (event: FormEvent) => {
    event.preventDefault();
    if (!newListTitle.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-list', title: newListTitle }) });
      if (!response.ok) throw new Error();
      const result = await response.json() as { id: string };
      setNewListTitle('');
      setActiveList(result.id);
      setAddListId(result.id);
      await load();
    } catch {
      setMessage(m.saveError);
    } finally {
      setSaving(false);
    }
  };

  const chooseList = (listId: 'all' | string) => {
    setActiveList(listId);
    if (listId !== 'all') setAddListId(listId);
  };

  const assignList = async (problemId: string, listId: string) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign-list', problemId, listId: listId || null }) });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setMessage(m.saveError);
    } finally {
      setSaving(false);
    }
  };

  const moveProblem = async (problemId: string, direction: -1 | 1) => {
    if (activeList === 'all') return;
    const ids = selectedProblems.map((problem) => problem.id);
    const index = ids.indexOf(problemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/leetcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reorder-list', listId: activeList, problemIds: ids }) });
      if (!response.ok) throw new Error();
      await load();
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
        <label><span>{m.destination}</span><select value={addListId} onChange={(event) => setAddListId(event.target.value)}><option value="">{m.unfiled}</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.title}</option>)}</select></label>
        <label><span>{m.plannedDate}</span><input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
        <label className="leetcode-url-field"><span>{m.url}</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://leetcode.com/problems/…" maxLength={500} /></label>
        <button className="primary-button" type="submit" disabled={saving || !title.trim()}>{saving ? m.adding : m.add}</button>
      </form>

      {message && <p className="leetcode-message" role="status">{message}</p>}

      <section className="leetcode-workspace" aria-busy={loading}>
        <aside className="leetcode-folders">
          <div className="leetcode-folders-heading"><p>{m.collections}</p><span>{lists.length}</span></div>
          <button type="button" className={activeList === 'all' ? 'active' : ''} onClick={() => chooseList('all')}><span className="leetcode-folder-icon">⌗</span><span><strong>{m.allProblems}</strong><small>{m.allProblemsHelp}</small></span><b>{problems.length}</b></button>
          <div className="leetcode-folder-list">
            {lists.map((list) => <button type="button" key={list.id} className={activeList === list.id ? 'active' : ''} onClick={() => chooseList(list.id)}><span className="leetcode-folder-icon">□</span><span><strong>{list.title}</strong><small>{m.customOrder}</small></span><b>{problems.filter((problem) => problem.listId === list.id).length}</b></button>)}
          </div>
          <form className="leetcode-new-list" onSubmit={createList}><label><span>{m.newList}</span><input value={newListTitle} onChange={(event) => setNewListTitle(event.target.value)} placeholder={m.listPlaceholder} maxLength={100} /></label><button type="submit" disabled={saving || !newListTitle.trim()}>{m.createList}</button></form>
        </aside>

        <div className="leetcode-library">
          <div className="leetcode-toolbar"><div><p className="section-number">02</p><div><h2>{activeListTitle}</h2><small>{activeList === 'all' ? m.allProblemsHelp : m.customOrder}</small></div></div><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={m.search} /><div className="leetcode-filters" role="group"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{m.all}</button><button type="button" className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>{m.open}</button><button type="button" className={filter === 'solved' ? 'active' : ''} onClick={() => setFilter('solved')}>{m.solvedFilter}</button></div></div>

          <div className="leetcode-matrix-shell">
            <div className="leetcode-matrix">
              <div className="leetcode-matrix-head" style={matrixStyle}><span className="leetcode-sticky-column">{m.tableProblem}</span>{Array.from({ length: maxAttemptColumns }, (_, index) => <span key={index}>{format(m.attemptNumber, { count: index + 1 })}</span>)}</div>
              {!loading && visibleProblems.length === 0 ? <p className="leetcode-empty">{m.empty}</p> : visibleProblems.map((problem, visibleIndex) => (
                <article className="leetcode-matrix-row" style={matrixStyle} key={problem.id}>
                  <div className="leetcode-sticky-column leetcode-problem-card">
                    <div className="leetcode-problem-heading"><div><strong>{problem.title}</strong><span className={`difficulty-pill ${problem.difficulty}`}>{difficultyLabel(problem.difficulty)}</span></div>{problem.url && <a href={problem.url} target="_blank" rel="noreferrer" aria-label={`${problem.title} LeetCode`}>↗</a>}</div>
                    <div className="leetcode-plan-summary">{problem.scheduledTasks.length ? problem.scheduledTasks.slice(-2).map((task) => <span key={task.id}>{formatDate(task.date)} · {task.done ? m.done : m.scheduled}</span>) : <span>—</span>}</div>
                    <div className="leetcode-problem-actions">
                      <select value={problem.listId ?? ''} onChange={(event) => void assignList(problem.id, event.target.value)} disabled={saving} aria-label={m.destination}><option value="">{m.unfiled}</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.title}</option>)}</select>
                      <input type="date" value={scheduleDates[problem.id] || todayKey()} onChange={(event) => setScheduleDates((current) => ({ ...current, [problem.id]: event.target.value }))} aria-label={m.plannedDate} />
                      <button type="button" onClick={() => void scheduleProblem(problem)} disabled={saving}>{m.schedule}</button>
                      <button type="button" className="leetcode-record-button" onClick={() => setAttemptProblem(problem)} disabled={saving}>{m.record}</button>
                    </div>
                    {canReorder && <div className="leetcode-order-actions"><button type="button" onClick={() => void moveProblem(problem.id, -1)} disabled={saving || visibleIndex === 0} aria-label={m.moveUp}>↑</button><button type="button" onClick={() => void moveProblem(problem.id, 1)} disabled={saving || visibleIndex === visibleProblems.length - 1} aria-label={m.moveDown}>↓</button><small>{visibleIndex + 1}</small></div>}
                  </div>
                  {Array.from({ length: maxAttemptColumns }, (_, index) => {
                    const attempt = problem.attempts.find((item) => item.attemptNumber === index + 1);
                    return attempt ? <button type="button" className="leetcode-attempt-cell" key={attempt.id} onClick={() => setDetail({ problem, attempt })}><span className={`attempt-status ${attempt.status}`}>{statusLabel(attempt.status)}</span><time>{formatDate(attempt.attemptedOn)}</time><span className="leetcode-attempt-preview">{attempt.notes}</span></button> : <div className="leetcode-attempt-empty" key={index}><span>{m.noAttempts}</span></div>;
                  })}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {attemptProblem && <AttemptDialog problemTitle={attemptProblem.title} date={todayKey()} saving={saving} onCancel={() => setAttemptProblem(null)} onSave={(value) => void recordAttempt(value)} />}
      {detail && <div className="attempt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="attempt-dialog attempt-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="attempt-detail-title"><div className="attempt-dialog-heading"><div><p>{m.noteTitle}</p><h2 id="attempt-detail-title">{detail.problem.title}</h2></div><button type="button" onClick={() => setDetail(null)} aria-label={m.close}>×</button></div><p className="attempt-dialog-help">{m.noteHint}</p><div className="attempt-detail-meta"><strong>{format(m.attemptNumber, { count: detail.attempt.attemptNumber })}</strong><span className={`attempt-status ${detail.attempt.status}`}>{statusLabel(detail.attempt.status)}</span><time>{formatDate(detail.attempt.attemptedOn)}</time></div><p className="attempt-detail-notes">{detail.attempt.notes}</p><div className="attempt-dialog-actions"><button className="primary-button" type="button" onClick={() => setDetail(null)}>{m.close}</button></div></section></div>}
    </section>
  );
}
