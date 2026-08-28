'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Task = {
  id: string;
  text: string;
  done: boolean;
};

type DayEntry = {
  tasks: Task[];
  activity: string;
  reflection: string;
};

const STORAGE_KEY = 'my-daybook-entries-v1';
const emptyEntry: DayEntry = { tasks: [], activity: '', reflection: '' };

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

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [taskText, setTaskText] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setEntries(JSON.parse(saved));
    } catch {
      // A malformed local draft should never prevent the journal from opening.
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries, isReady]);

  const entry = entries[selectedDate] ?? emptyEntry;
  const selected = fromDateKey(selectedDate);
  const todayKey = dateKey(new Date());
  const isToday = selectedDate === todayKey;
  const completed = entry.tasks.filter((task) => task.done).length;
  const progress = entry.tasks.length
    ? Math.round((completed / entry.tasks.length) * 100)
    : 0;

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 3)),
    [selectedDate],
  );

  const updateEntry = (update: (current: DayEntry) => DayEntry) => {
    setEntries((current) => ({
      ...current,
      [selectedDate]: update(current[selectedDate] ?? emptyEntry),
    }));
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    const text = taskText.trim();
    if (!text) return;

    updateEntry((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        { id: crypto.randomUUID(), text, done: false },
      ],
    }));
    setTaskText('');
  };

  const toggleTask = (id: string) => {
    updateEntry((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    }));
  };

  const deleteTask = (id: string) => {
    updateEntry((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
    }));
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
        <div className="save-status" role="status">
          <span className="status-dot" aria-hidden="true" />
          {isReady ? '已自動儲存' : '正在讀取…'}
        </div>
      </header>

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

      <div className="content-grid">
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
            <label className="sr-only" htmlFor="new-task">新增待辦事項</label>
            <input
              id="new-task"
              value={taskText}
              onChange={(event) => setTaskText(event.target.value)}
              placeholder="寫下接下來要做的事…"
              autoComplete="off"
            />
            <button type="submit" aria-label="加入待辦">＋</button>
          </form>

          <div className="task-list" aria-live="polite">
            {entry.tasks.length === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">✓</span>
                <p>今天還是一張白紙</p>
                <small>從一件小事開始，就很好。</small>
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
                  >
                    {task.done && '✓'}
                  </button>
                  <span className="task-index">{String(index + 1).padStart(2, '0')}</span>
                  <p>{task.text}</p>
                  <button className="delete-button" type="button" onClick={() => deleteTask(task.id)} aria-label={`刪除：${task.text}`}>×</button>
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
              placeholder={'把今天發生的事記下來…\n\n完成了什麼、去了哪裡，或是遇見了誰？'}
              aria-label="今天做了什麼"
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
              placeholder={'今天有什麼感受？\n留一句話，給明天的自己。'}
              aria-label="今日心得"
            />
          </section>
        </div>
      </div>

      <footer>
        <p>一天一頁，把日子好好收進來。</p>
        <span>{selectedDate.replaceAll('-', ' · ')}</span>
      </footer>
    </main>
  );
}
