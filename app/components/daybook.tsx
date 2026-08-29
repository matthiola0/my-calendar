'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cycles from './cycles';

type Task = {
  id: string;
  text: string;
  done: boolean;
  cycleId: string | null;
  phaseId: string | null;
};

type CycleOption = {
  id: string;
  title: string;
  phases: Array<{ id: string; title: string }>;
};

type TaskDraft = Pick<Task, 'id' | 'text' | 'cycleId' | 'phaseId'>;

type DayEntry = {
  tasks: Task[];
  activity: string;
  reflection: string;
  revision: string | null;
};

type SyncStatus = 'loading' | 'saving' | 'saved' | 'conflict' | 'error';

const emptyEntry: DayEntry = {
  tasks: [],
  activity: '',
  reflection: '',
  revision: null,
};

class SaveConflictError extends Error {}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftDate(key: string, amount: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function taskLinkValue(cycleId: string | null, phaseId: string | null) {
  return cycleId ? `${cycleId}::${phaseId ?? ''}` : '';
}

function parseTaskLink(value: string) {
  if (!value) return { cycleId: null, phaseId: null };
  const [cycleId, phaseId] = value.split('::');
  return { cycleId, phaseId: phaseId || null };
}

function CycleLinkOptions({ cycles }: { cycles: CycleOption[] }) {
  return (
    <>
      <option value="">不綁定大週期</option>
      {cycles.flatMap((cycle) => [
        <option key={cycle.id} value={taskLinkValue(cycle.id, null)}>
          {cycle.title}（整體）
        </option>,
        ...cycle.phases.map((phase) => (
          <option key={phase.id} value={taskLinkValue(cycle.id, phase.id)}>
            {cycle.title} · {phase.title}
          </option>
        )),
      ])}
    </>
  );
}

async function readEntry(date: string, signal?: AbortSignal): Promise<DayEntry> {
  const response = await fetch(`/api/entries?date=${encodeURIComponent(date)}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('Unable to load entry');
  return response.json();
}

async function writeEntry(date: string, entry: DayEntry) {
  const response = await fetch('/api/entries', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, ...entry }),
  });
  if (response.status === 409) throw new SaveConflictError();
  if (!response.ok) throw new Error('Unable to save entry');
  return response.json() as Promise<{ revision: string }>;
}

export default function Daybook({ userName }: { userName: string }) {
  const [view, setView] = useState<'daily' | 'cycles'>('daily');
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [taskText, setTaskText] = useState('');
  const [taskLink, setTaskLink] = useState('');
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<{ date: string; entry: DayEntry } | null>(null);
  const revisionsRef = useRef<Record<string, string | null>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const saveErrorRef = useRef<unknown>(null);
  const isUnmountingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    // Loading state intentionally follows the externally selected date.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncStatus('loading');

    async function load() {
      try {
        const entry = await readEntry(selectedDate, controller.signal);
        if (!controller.signal.aborted) {
          revisionsRef.current[selectedDate] = entry.revision;
          setEntries((current) => ({ ...current, [selectedDate]: entry }));
          setSyncStatus('saved');
        }
      } catch {
        if (!controller.signal.aborted) setSyncStatus('error');
      }
    }

    load();
    return () => controller.abort();
  }, [selectedDate]);

  useEffect(() => {
    if (view !== 'daily') return;
    let active = true;
    fetch('/api/cycles', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: { cycles: CycleOption[] }) => {
        if (active) setCycles(result.cycles);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [view]);

  const entry = entries[selectedDate] ?? emptyEntry;
  const selected = fromDateKey(selectedDate);
  const todayKey = dateKey(new Date());
  const isToday = selectedDate === todayKey;
  const completed = entry.tasks.filter((task) => task.done).length;
  const progress = entry.tasks.length
    ? Math.round((completed / entry.tasks.length) * 100)
    : 0;
  const isReady = syncStatus !== 'loading';

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 3)),
    [selectedDate],
  );

  const flushPendingSave = useCallback(() => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
    const draft = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (!draft) return saveQueueRef.current;

    const sequence = ++saveSequenceRef.current;
    if (!isUnmountingRef.current) setSyncStatus('saving');
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const revision = revisionsRef.current[draft.date] ?? draft.entry.revision;
        const saved = await writeEntry(draft.date, { ...draft.entry, revision });
        revisionsRef.current[draft.date] = saved.revision;
        saveErrorRef.current = null;
        if (!isUnmountingRef.current) {
          setEntries((current) => {
            const currentEntry = current[draft.date];
            return currentEntry
              ? {
                  ...current,
                  [draft.date]: { ...currentEntry, revision: saved.revision },
                }
              : current;
          });
          if (sequence === saveSequenceRef.current) setSyncStatus('saved');
        }
      })
      .catch((error) => {
        saveErrorRef.current = error;
        if (!isUnmountingRef.current && sequence === saveSequenceRef.current) {
          setSyncStatus(error instanceof SaveConflictError ? 'conflict' : 'error');
        }
      });
    return saveQueueRef.current;
  }, []);

  useEffect(
    () => () => {
      isUnmountingRef.current = true;
      void flushPendingSave();
    },
    [flushPendingSave],
  );

  const updateEntry = (
    update: (current: DayEntry) => DayEntry,
    saveImmediately = false,
  ) => {
    const next = update(entry);
    setEntries((current) => ({ ...current, [selectedDate]: next }));
    pendingDraftRef.current = { date: selectedDate, entry: next };

    if (saveImmediately) {
      flushPendingSave();
      return;
    }
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(flushPendingSave, 500);
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    const text = taskText.trim();
    if (!text) return;
    const link = parseTaskLink(taskLink);

    updateEntry(
      (current) => ({
        ...current,
        tasks: [
          ...current.tasks,
          { id: crypto.randomUUID(), text, done: false, ...link },
        ],
      }),
      true,
    );
    setTaskText('');
  };

  const beginTaskEdit = (task: Task) => {
    setEditingTask({
      id: task.id,
      text: task.text,
      cycleId: task.cycleId,
      phaseId: task.phaseId,
    });
  };

  const taskCycleLabel = (task: Task) => {
    if (!task.cycleId) return null;
    const cycle = cycles.find((item) => item.id === task.cycleId);
    if (!cycle) return null;
    const phase = cycle.phases.find((item) => item.id === task.phaseId);
    return phase ? `${cycle.title} · ${phase.title}` : cycle.title;
  };

  const toggleTask = (id: string) => {
    updateEntry(
      (current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === id ? { ...task, done: !task.done } : task,
        ),
      }),
      true,
    );
  };

  const deleteTask = (id: string) => {
    updateEntry(
      (current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== id),
      }),
      true,
    );
  };

  const saveTaskEdit = (event: FormEvent) => {
    event.preventDefault();
    const text = editingTask?.text.trim();
    if (!editingTask || !text) return;

    updateEntry(
      (current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === editingTask.id
            ? {
                ...task,
                text,
                cycleId: editingTask.cycleId,
                phaseId: editingTask.phaseId,
              }
            : task,
        ),
      }),
      true,
    );
    setEditingTask(null);
  };

  const statusText = {
    loading: '正在讀取雲端資料…',
    saving: '正在同步…',
    saved: '已同步至雲端',
    conflict: '其他裝置已更新，請重新整理',
    error: '同步失敗，請檢查網路',
  }[syncStatus];

  const signOut = async () => {
    await flushPendingSave();
    if (saveErrorRef.current) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/');
  };

  const showCycles = () => {
    void flushPendingSave().then(() => setView('cycles'));
  };

  return (
    <main className="daybook-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="回到今日手帳頂端">
          <span className="brand-mark" aria-hidden="true">日</span>
          <span>
            <strong>日常</strong>
            <small>DAILY NOTES</small>
          </span>
        </a>
        <div className="header-meta">
          <div className="view-switch" aria-label="週期檢視">
            <button type="button" className={view === 'daily' ? 'active' : ''} onClick={() => setView('daily')}>小週期 · 每日</button>
            <button type="button" className={view === 'cycles' ? 'active' : ''} onClick={showCycles}>大週期</button>
          </div>
          {view === 'daily' && (
            <div className={syncStatus === 'error' || syncStatus === 'conflict' ? 'save-status error' : 'save-status'} role="status">
              <span className="status-dot" aria-hidden="true" />
              {statusText}
            </div>
          )}
          <button className="user-menu" type="button" onClick={signOut} title={userName}>
            {userName} · 登出
          </button>
        </div>
      </header>

      {view === 'cycles' ? <Cycles /> : (
        <>

      <section className="date-hero" id="top">
        <div className="date-heading">
          <p className="eyebrow">{selected.getFullYear()} 年 · 我的每一天</p>
          <h1>
            {selected.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}
            <span>{selected.toLocaleDateString('zh-TW', { weekday: 'long' })}</span>
          </h1>
        </div>

        <div className="date-actions">
          <div className="date-nav" aria-label="日期切換">
            <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="前一天">←</button>
            <label className="date-picker-label">
              <span>選擇日期</span>
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="後一天">→</button>
          </div>
          {!isToday && (
            <button className="today-button" type="button" onClick={() => setSelectedDate(todayKey)}>
              回到今天
            </button>
          )}
        </div>
      </section>

      <nav className="week-strip" aria-label="鄰近日期">
        {week.map((key) => {
          const date = fromDateKey(key);
          const active = key === selectedDate;
          return (
            <button
              className={active ? 'week-day active' : 'week-day'}
              key={key}
              type="button"
              onClick={() => setSelectedDate(key)}
              aria-current={active ? 'date' : undefined}
            >
              <span>{date.toLocaleDateString('zh-TW', { weekday: 'short' }).replace('週', '')}</span>
              <strong>{date.getDate()}</strong>
              {entries[key]?.tasks.some((task) => task.done) && <i aria-label="這天已有完成事項" />}
            </button>
          );
        })}
      </nav>

      <div className="content-grid" aria-busy={!isReady}>
        <section className="card tasks-card" aria-labelledby="tasks-title">
          <div className="card-heading">
            <div>
              <p className="section-number">01</p>
              <h2 id="tasks-title">今天要完成</h2>
            </div>
            <div className="progress-wrap" aria-label={`已完成 ${progress}%`}>
              <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}>
                <span>{progress}<small>%</small></span>
              </div>
              <p>{entry.tasks.length ? `${completed} / ${entry.tasks.length} 完成` : '慢慢開始'}</p>
            </div>
          </div>

          <form className="task-form" onSubmit={addTask}>
            <div className="task-create-fields">
              <label className="sr-only" htmlFor="new-task">新增待辦事項</label>
              <input
                id="new-task"
                value={taskText}
                onChange={(event) => setTaskText(event.target.value)}
                placeholder="寫下接下來要做的事…"
                autoComplete="off"
                disabled={!isReady}
              />
              <label className="sr-only" htmlFor="new-task-cycle">綁定大週期</label>
              <select id="new-task-cycle" value={taskLink} onChange={(event) => setTaskLink(event.target.value)} disabled={!isReady}>
                <CycleLinkOptions cycles={cycles} />
              </select>
            </div>
            <button type="submit" aria-label="加入待辦" disabled={!isReady}>＋</button>
          </form>

          <div className="task-list" aria-live="polite">
            {entry.tasks.length === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">✓</span>
                <p>{isReady ? '今天還是一張白紙' : '正在打開今天這一頁'}</p>
                <small>{isReady ? '從一件小事開始，就很好。' : '請稍候片刻。'}</small>
              </div>
            ) : (
              entry.tasks.map((task, index) => (
                <div className={task.done ? 'task-item done' : 'task-item'} key={task.id}>
                  <button
                    className="check-button"
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    aria-label={task.done ? `取消完成：${task.text}` : `標示完成：${task.text}`}
                    aria-pressed={task.done}
                    disabled={!isReady}
                  >
                    {task.done && '✓'}
                  </button>
                  <span className="task-index">{String(index + 1).padStart(2, '0')}</span>
                  {editingTask?.id === task.id ? (
                    <form className="task-edit-form" onSubmit={saveTaskEdit}>
                      <div className="task-edit-fields">
                        <input
                          value={editingTask.text}
                          onChange={(event) => setEditingTask((current) => current ? { ...current, text: event.target.value } : current)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditingTask(null);
                          }}
                          aria-label={`編輯待辦：${task.text}`}
                          maxLength={500}
                          autoFocus
                        />
                        <select
                          value={taskLinkValue(editingTask.cycleId, editingTask.phaseId)}
                          onChange={(event) => {
                            const link = parseTaskLink(event.target.value);
                            setEditingTask((current) => current ? { ...current, ...link } : current);
                          }}
                          aria-label="綁定大週期"
                        >
                          <CycleLinkOptions cycles={cycles} />
                        </select>
                      </div>
                      <button className="save-task-edit" type="submit" disabled={!editingTask.text.trim() || !isReady}>儲存</button>
                      <button className="cancel-task-edit" type="button" onClick={() => setEditingTask(null)}>取消</button>
                    </form>
                  ) : (
                    <>
                      <div className="task-copy">
                        <button
                          className="task-text-button"
                          type="button"
                          onClick={() => beginTaskEdit(task)}
                          aria-label={`編輯待辦：${task.text}`}
                          title="點擊編輯"
                          disabled={!isReady}
                        >
                          {task.text}
                        </button>
                        {taskCycleLabel(task) && <span className="task-cycle-label">↳ {taskCycleLabel(task)}</span>}
                      </div>
                      <div className="task-actions">
                        <button className="edit-button" type="button" onClick={() => beginTaskEdit(task)} aria-label={`編輯：${task.text}`} disabled={!isReady}>編</button>
                        <button className="delete-button" type="button" onClick={() => deleteTask(task.id)} aria-label={`刪除：${task.text}`} disabled={!isReady}>×</button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <div className="notes-column">
          <section className="card note-card" aria-labelledby="activity-title">
            <div className="card-heading compact">
              <div>
                <p className="section-number">02</p>
                <h2 id="activity-title">今天做了什麼</h2>
              </div>
              <span className="writing-mark" aria-hidden="true">✦</span>
            </div>
            <textarea
              value={entry.activity}
              onChange={(event) => updateEntry((current) => ({ ...current, activity: event.target.value }))}
              onBlur={flushPendingSave}
              placeholder={'把今天發生的事記下來…\n\n完成了什麼、去了哪裡，或是遇見了誰？'}
              aria-label="今天做了什麼"
              disabled={!isReady}
            />
          </section>

          <section className="card note-card reflection-card" aria-labelledby="reflection-title">
            <div className="card-heading compact">
              <div>
                <p className="section-number">03</p>
                <h2 id="reflection-title">今日心得</h2>
              </div>
              <span className="writing-mark" aria-hidden="true">〰</span>
            </div>
            <textarea
              value={entry.reflection}
              onChange={(event) => updateEntry((current) => ({ ...current, reflection: event.target.value }))}
              onBlur={flushPendingSave}
              placeholder={'今天有什麼感受？\n留一句話，給明天的自己。'}
              aria-label="今日心得"
              disabled={!isReady}
            />
          </section>
        </div>
      </div>

      <footer>
        <p>一天一頁，把日子好好收進來。</p>
        <span>{selectedDate.replaceAll('-', ' · ')}</span>
      </footer>
        </>
      )}
    </main>
  );
}
