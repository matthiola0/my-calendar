'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cycles from './cycles';
import PlannerChat from './planner-chat';

type Task = {
  id: string;
  text: string;
  done: boolean;
  cycleId: string | null;
  phaseId: string | null;
  sectionId: string | null;
  recurrenceId: string | null;
  habitCue: string | null;
  tinyStart: string | null;
  identity: string | null;
  streak: number;
  recoveryDue: boolean;
};

type CycleOption = { id: string; title: string; phases: Array<{ id: string; title: string }> };
type DaySection = { id: string; title: string };
type CustomField = { id: string; title: string; content: string };
type TaskDraft = Pick<Task, 'id' | 'text' | 'cycleId' | 'phaseId' | 'sectionId' | 'recurrenceId' | 'habitCue' | 'tinyStart' | 'identity'>;
type DayEntry = { tasks: Task[]; activity: string; reflection: string; revision: string | null };
type SyncStatus = 'loading' | 'saving' | 'saved' | 'conflict' | 'error';
type RepeatUnit = '' | 'day' | 'week' | 'month';

const emptyEntry: DayEntry = { tasks: [], activity: '', reflection: '', revision: null };
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

function defaultSectionTitles(count: number) {
  const presets: Record<number, string[]> = {
    1: ['整天'],
    2: ['上午', '下午'],
    3: ['上午', '下午', '晚上'],
    4: ['清晨', '上午', '下午', '晚上'],
    5: ['清晨', '上午', '中午', '下午', '晚上'],
    6: ['清晨', '上午', '中午', '下午', '傍晚', '晚上'],
  };
  return presets[count] ?? [];
}

function CycleLinkOptions({ cycles }: { cycles: CycleOption[] }) {
  return (
    <>
      <option value="">不綁定大週期</option>
      {cycles.flatMap((cycle) => [
        <option key={cycle.id} value={taskLinkValue(cycle.id, null)}>{cycle.title}（整體）</option>,
        ...cycle.phases.map((phase) => (
          <option key={phase.id} value={taskLinkValue(cycle.id, phase.id)}>{cycle.title} · {phase.title}</option>
        )),
      ])}
    </>
  );
}

function SectionOptions({ sections }: { sections: DaySection[] }) {
  return (
    <>
      <option value="">尚未安排時段</option>
      {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
    </>
  );
}

async function readEntry(date: string, signal?: AbortSignal): Promise<DayEntry> {
  const response = await fetch(`/api/entries?date=${encodeURIComponent(date)}`, { cache: 'no-store', signal });
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

async function readCustomFields(date: string, signal?: AbortSignal): Promise<CustomField[]> {
  const response = await fetch(`/api/custom-fields?date=${encodeURIComponent(date)}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Unable to load custom fields');
  const result = await response.json() as { fields: CustomField[] };
  return result.fields;
}

export default function Daybook({ userName }: { userName: string }) {
  const initialDate = dateKey(new Date());
  const [view, setView] = useState<'daily' | 'cycles' | 'planner'>('daily');
  const [dataVersion, setDataVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [taskText, setTaskText] = useState('');
  const [taskLink, setTaskLink] = useState('');
  const [taskSection, setTaskSection] = useState('');
  const [habitCue, setHabitCue] = useState('');
  const [tinyStart, setTinyStart] = useState('');
  const [identity, setIdentity] = useState('');
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>('');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndMode, setRepeatEndMode] = useState<'count' | 'date'>('count');
  const [repeatCount, setRepeatCount] = useState(7);
  const [repeatUntil, setRepeatUntil] = useState(() => shiftDate(initialDate, 6));
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [sections, setSections] = useState<DaySection[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [newFieldTitle, setNewFieldTitle] = useState('');
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskMessage, setTaskMessage] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<{ date: string; entry: DayEntry } | null>(null);
  const customTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const revisionsRef = useRef<Record<string, string | null>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const saveErrorRef = useRef<unknown>(null);
  const isUnmountingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    // Loading follows the externally selected date.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncStatus('loading');
    Promise.all([readEntry(selectedDate, controller.signal), readCustomFields(selectedDate, controller.signal)])
      .then(([entry, fields]) => {
        if (controller.signal.aborted) return;
        revisionsRef.current[selectedDate] = entry.revision;
        setEntries((current) => ({ ...current, [selectedDate]: entry }));
        setCustomFields(fields);
        setSyncStatus('saved');
      })
      .catch(() => { if (!controller.signal.aborted) setSyncStatus('error'); });
    return () => controller.abort();
  }, [selectedDate, dataVersion]);

  useEffect(() => {
    if (view !== 'daily') return;
    let active = true;
    Promise.all([
      fetch('/api/cycles', { cache: 'no-store' }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch('/api/day-sections', { cache: 'no-store' }).then((response) => response.ok ? response.json() : Promise.reject()),
    ])
      .then(([cycleResult, sectionResult]: [{ cycles: CycleOption[] }, { sections: DaySection[] }]) => {
        if (!active) return;
        setCycles(cycleResult.cycles);
        setSections(sectionResult.sections);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [view, dataVersion]);

  const entry = entries[selectedDate] ?? emptyEntry;
  const selected = fromDateKey(selectedDate);
  const todayKey = dateKey(new Date());
  const isToday = selectedDate === todayKey;
  const completed = entry.tasks.filter((task) => task.done).length;
  const progress = entry.tasks.length ? Math.round((completed / entry.tasks.length) * 100) : 0;
  const isReady = syncStatus !== 'loading' && !isAddingTask;
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
            return currentEntry ? { ...current, [draft.date]: { ...currentEntry, revision: saved.revision } } : current;
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
      Object.values(customTimersRef.current).forEach(clearTimeout);
    },
    [flushPendingSave],
  );

  const updateEntry = (update: (current: DayEntry) => DayEntry, saveImmediately = false) => {
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

  const changeSelectedDate = (date: string) => {
    setSelectedDate(date);
    setRepeatUntil(shiftDate(date, 6));
    setEditingTask(null);
    setTaskMessage('');
  };

  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    const text = taskText.trim();
    if (!text) return;
    setIsAddingTask(true);
    setTaskMessage('');
    setSyncStatus('saving');
    await flushPendingSave();
    const link = parseTaskLink(taskLink);
    const recurrence = repeatUnit
      ? { unit: repeatUnit, interval: repeatInterval, endMode: repeatEndMode, ...(repeatEndMode === 'count' ? { count: repeatCount } : { until: repeatUntil }) }
      : null;
    try {
      const response = await fetch('/api/recurring-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: selectedDate, text, ...link, sectionId: taskSection || null, habitCue: habitCue || null, tinyStart: tinyStart || null, identity: identity || null, recurrence }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: '無法建立任務。' }));
        throw new Error(result.error ?? '無法建立任務。');
      }
      const result = await response.json() as { count: number };
      const next = await readEntry(selectedDate);
      revisionsRef.current[selectedDate] = next.revision;
      setEntries((current) => ({ ...current, [selectedDate]: next }));
      setTaskText('');
      setHabitCue('');
      setTinyStart('');
      setIdentity('');
      setTaskMessage(result.count > 1 ? `已建立 ${result.count} 個重複任務。` : '已加入今天。');
      setSyncStatus('saved');
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : '無法建立任務。');
      setSyncStatus('error');
    } finally {
      setIsAddingTask(false);
    }
  };

  const beginTaskEdit = (task: Task) => {
    setEditingTask({ id: task.id, text: task.text, cycleId: task.cycleId, phaseId: task.phaseId, sectionId: task.sectionId, recurrenceId: task.recurrenceId, habitCue: task.habitCue, tinyStart: task.tinyStart, identity: task.identity });
  };

  const taskCycleLabel = (task: Task) => {
    if (!task.cycleId) return null;
    const cycle = cycles.find((item) => item.id === task.cycleId);
    if (!cycle) return null;
    const phase = cycle.phases.find((item) => item.id === task.phaseId);
    return phase ? `${cycle.title} · ${phase.title}` : cycle.title;
  };

  const toggleTask = (id: string) => {
    updateEntry((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id
        ? { ...task, done: !task.done, streak: task.done ? Math.max(0, task.streak - 1) : task.streak + 1, recoveryDue: task.done ? task.recoveryDue : false }
        : task),
    }), true);
  };

  const deleteTask = (id: string) => {
    updateEntry((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }), true);
  };

  const moveTaskToSection = (id: string, sectionId: string | null) => {
    updateEntry((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, sectionId } : task) }), true);
    setDraggingTaskId(null);
  };

  const saveTaskEdit = (event: FormEvent) => {
    event.preventDefault();
    const text = editingTask?.text.trim();
    if (!editingTask || !text) return;
    updateEntry((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === editingTask.id
        ? { ...task, text, cycleId: editingTask.cycleId, phaseId: editingTask.phaseId, sectionId: editingTask.sectionId, habitCue: editingTask.habitCue?.trim() || null, tinyStart: editingTask.tinyStart?.trim() || null, identity: editingTask.identity?.trim() || null }
        : task),
    }), true);
    setEditingTask(null);
  };

  const saveTaskSeries = async () => {
    const text = editingTask?.text.trim();
    if (!editingTask?.recurrenceId || !text) return;
    setIsAddingTask(true);
    setTaskMessage('');
    setSyncStatus('saving');
    await flushPendingSave();
    try {
      const response = await fetch('/api/recurring-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recurrenceId: editingTask.recurrenceId,
          text,
          cycleId: editingTask.cycleId,
          phaseId: editingTask.phaseId,
          sectionId: editingTask.sectionId,
          habitCue: editingTask.habitCue?.trim() || null,
          tinyStart: editingTask.tinyStart?.trim() || null,
          identity: editingTask.identity?.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({ error: '無法更新重複任務。' })) as { count?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? '無法更新重複任務。');
      const next = await readEntry(selectedDate);
      revisionsRef.current[selectedDate] = next.revision;
      setEntries((current) => ({ ...current, [selectedDate]: next }));
      setEditingTask(null);
      setTaskMessage(`已更新全系列 ${result.count ?? 0} 個任務。`);
      setSyncStatus('saved');
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : '無法更新重複任務。');
      setSyncStatus('error');
    } finally {
      setIsAddingTask(false);
    }
  };

  const deleteTaskSeries = async () => {
    if (!editingTask?.recurrenceId || !window.confirm('刪除這一整組重複任務？所有日期的這組任務都會被刪除。')) return;
    setIsAddingTask(true);
    setTaskMessage('');
    setSyncStatus('saving');
    await flushPendingSave();
    try {
      const response = await fetch('/api/recurring-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurrenceId: editingTask.recurrenceId }),
      });
      const result = await response.json().catch(() => ({ error: '無法刪除重複任務。' })) as { count?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? '無法刪除重複任務。');
      const next = await readEntry(selectedDate);
      revisionsRef.current[selectedDate] = next.revision;
      setEntries((current) => ({ ...current, [selectedDate]: next }));
      setEditingTask(null);
      setTaskMessage(`已刪除全系列 ${result.count ?? 0} 個任務。`);
      setSyncStatus('saved');
    } catch (error) {
      setTaskMessage(error instanceof Error ? error.message : '無法刪除重複任務。');
      setSyncStatus('error');
    } finally {
      setIsAddingTask(false);
    }
  };

  const saveSections = async (next: DaySection[]) => {
    setSyncStatus('saving');
    try {
      const response = await fetch('/api/day-sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: next }) });
      if (!response.ok) throw new Error('Unable to save sections');
      setSyncStatus('saved');
    } catch {
      setSyncStatus('error');
    }
  };

  const changeSectionCount = (count: number) => {
    const titles = defaultSectionTitles(count);
    const next = Array.from({ length: count }, (_, index) => sections[index] ?? { id: crypto.randomUUID(), title: titles[index] });
    const validIds = new Set(next.map((section) => section.id));
    setSections(next);
    if (taskSection && !validIds.has(taskSection)) setTaskSection('');
    if (entry.tasks.some((task) => task.sectionId && !validIds.has(task.sectionId))) {
      updateEntry((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.sectionId && !validIds.has(task.sectionId) ? { ...task, sectionId: null } : task),
      }), true);
    }
    void saveSections(next);
  };

  const commitSectionNames = () => {
    const normalized = sections.map((section) => ({
      ...section,
      title: section.title.trim() || '未命名時段',
    }));
    setSections(normalized);
    void saveSections(normalized);
  };

  const updateCustomField = (id: string, content: string) => {
    setCustomFields((current) => current.map((field) => field.id === id ? { ...field, content } : field));
    if (customTimersRef.current[id]) clearTimeout(customTimersRef.current[id]);
    const date = selectedDate;
    customTimersRef.current[id] = setTimeout(async () => {
      const response = await fetch('/api/custom-fields', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, date, content }) });
      if (!response.ok) setSyncStatus('error');
      delete customTimersRef.current[id];
    }, 500);
  };

  const addCustomField = async (event: FormEvent) => {
    event.preventDefault();
    const title = newFieldTitle.trim();
    if (!title) return;
    const response = await fetch('/api/custom-fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!response.ok) {
      setSyncStatus('error');
      return;
    }
    const result = await response.json() as { field: CustomField };
    setCustomFields((current) => [...current, result.field]);
    setNewFieldTitle('');
  };

  const deleteCustomField = async (field: CustomField) => {
    if (!window.confirm(`刪除「${field.title}」會一併刪除所有日期的內容，確定嗎？`)) return;
    const response = await fetch('/api/custom-fields', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: field.id }) });
    if (response.ok) setCustomFields((current) => current.filter((item) => item.id !== field.id));
    else setSyncStatus('error');
  };

  const statusText = { loading: '正在讀取雲端資料…', saving: '正在同步…', saved: '已同步至雲端', conflict: '其他裝置已更新，請重新整理', error: '同步失敗，請檢查網路' }[syncStatus];

  const signOut = async () => {
    await flushPendingSave();
    await Promise.all(customFields.map((field) => fetch('/api/custom-fields', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: field.id, date: selectedDate, content: field.content }) })));
    if (saveErrorRef.current) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/');
  };

  const showCycles = () => { void flushPendingSave().then(() => setView('cycles')); };
  const showPlanner = () => { void flushPendingSave().then(() => setView('planner')); };
  const handlePlannerApplied = (firstDate: string | null) => {
    if (firstDate) setSelectedDate(firstDate);
    setDataVersion((current) => current + 1);
  };

  const renderTask = (task: Task, index: number) => (
    <div className={task.done ? 'task-item done' : 'task-item'} key={task.id} draggable={isReady && editingTask?.id !== task.id} onDragStart={() => setDraggingTaskId(task.id)} onDragEnd={() => setDraggingTaskId(null)}>
      <button className="check-button" type="button" onClick={() => toggleTask(task.id)} aria-label={task.done ? `取消完成：${task.text}` : `標示完成：${task.text}`} aria-pressed={task.done} disabled={!isReady}>{task.done && '✓'}</button>
      <span className="task-index">{String(index + 1).padStart(2, '0')}</span>
      {editingTask?.id === task.id ? (
        <form className="task-edit-form" onSubmit={saveTaskEdit}>
          <div className="task-edit-fields">
            <input value={editingTask.text} onChange={(event) => setEditingTask((current) => current ? { ...current, text: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Escape') setEditingTask(null); }} aria-label={`編輯待辦：${task.text}`} maxLength={500} autoFocus />
            <select value={taskLinkValue(editingTask.cycleId, editingTask.phaseId)} onChange={(event) => { const link = parseTaskLink(event.target.value); setEditingTask((current) => current ? { ...current, ...link } : current); }} aria-label="綁定大週期"><CycleLinkOptions cycles={cycles} /></select>
            <select value={editingTask.sectionId ?? ''} onChange={(event) => setEditingTask((current) => current ? { ...current, sectionId: event.target.value || null } : current)} aria-label="安排時段"><SectionOptions sections={sections} /></select>
            <input value={editingTask.habitCue ?? ''} onChange={(event) => setEditingTask((current) => current ? { ...current, habitCue: event.target.value } : current)} placeholder="提示：在什麼行為之後開始？" maxLength={300} />
            <input value={editingTask.tinyStart ?? ''} onChange={(event) => setEditingTask((current) => current ? { ...current, tinyStart: event.target.value } : current)} placeholder="兩分鐘版本：先做哪個最小動作？" maxLength={300} />
            <input value={editingTask.identity ?? ''} onChange={(event) => setEditingTask((current) => current ? { ...current, identity: event.target.value } : current)} placeholder="身份：我想成為怎樣的人？" maxLength={300} />
          </div>
          <div className="task-edit-actions">
            <button className="save-task-edit" type="submit" disabled={!editingTask.text.trim() || !isReady}>只儲存這次</button>
            {editingTask.recurrenceId && <button className="save-series-edit" type="button" onClick={() => void saveTaskSeries()} disabled={!editingTask.text.trim() || !isReady}>套用全系列</button>}
            {editingTask.recurrenceId && <button className="delete-series-edit" type="button" onClick={() => void deleteTaskSeries()} disabled={!isReady}>刪除全系列</button>}
            <button className="cancel-task-edit" type="button" onClick={() => setEditingTask(null)}>取消</button>
          </div>
        </form>
      ) : (
        <>
          <div className="task-copy">
            <button className="task-text-button" type="button" onClick={() => beginTaskEdit(task)} aria-label={`編輯待辦：${task.text}`} title="點擊編輯；也可拖曳到時段" disabled={!isReady}>{task.text}</button>
            <div className="task-meta">{taskCycleLabel(task) && <span>↳ {taskCycleLabel(task)}</span>}{task.recurrenceId && <span>↻ 重複</span>}{task.recurrenceId && task.streak > 0 && <span className="streak-badge">連續完成 {task.streak} 次</span>}</div>
            {task.identity && <small className="identity-note">身份：{task.identity}</small>}
            {task.habitCue && <small className="habit-note">提示：在「{task.habitCue}」之後</small>}
            {task.tinyStart && <small className="habit-note">兩分鐘開始：{task.tinyStart}</small>}
            {task.recoveryDue && <small className="recovery-note">上一回尚未完成；這次先做兩分鐘版本，避免連續錯過兩次。</small>}
          </div>
          <div className="task-actions">
            <button className="edit-button" type="button" onClick={() => beginTaskEdit(task)} aria-label={`編輯：${task.text}`} disabled={!isReady}>編</button>
            <button className="delete-button" type="button" onClick={() => deleteTask(task.id)} aria-label={`刪除：${task.text}`} disabled={!isReady}>×</button>
          </div>
        </>
      )}
    </div>
  );

  const unassignedTasks = entry.tasks.filter((task) => !task.sectionId || !sections.some((section) => section.id === task.sectionId));

  return (
    <main className="daybook-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="回到今日手帳頂端"><span className="brand-mark" aria-hidden="true">日</span><span><strong>日常</strong><small>DAILY NOTES</small></span></a>
        <div className="header-meta">
          <div className="view-switch" aria-label="行事曆檢視"><button type="button" className={view === 'daily' ? 'active' : ''} onClick={() => setView('daily')}>小週期 · 每日</button><button type="button" className={view === 'cycles' ? 'active' : ''} onClick={showCycles}>大週期</button><button type="button" className={view === 'planner' ? 'active' : ''} onClick={showPlanner}>AI 規劃</button></div>
          {view === 'daily' && <div className={syncStatus === 'error' || syncStatus === 'conflict' ? 'save-status error' : 'save-status'} role="status"><span className="status-dot" aria-hidden="true" />{statusText}</div>}
          <button className="user-menu" type="button" onClick={signOut} title={userName}>{userName} · 登出</button>
        </div>
      </header>

      {view === 'cycles' ? <Cycles key={dataVersion} /> : view === 'planner' ? (
        <PlannerChat selectedDate={selectedDate} onApplied={handlePlannerApplied} />
      ) : (
        <>
          <section className="date-hero" id="top">
            <div className="date-heading"><p className="eyebrow">{selected.getFullYear()} 年 · 我的每一天</p><h1>{selected.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}<span>{selected.toLocaleDateString('zh-TW', { weekday: 'long' })}</span></h1></div>
            <div className="date-actions">
              <div className="date-nav" aria-label="日期切換"><button type="button" onClick={() => changeSelectedDate(shiftDate(selectedDate, -1))} aria-label="前一天">←</button><label className="date-picker-label"><span>選擇日期</span><input type="date" value={selectedDate} onChange={(event) => changeSelectedDate(event.target.value)} /></label><button type="button" onClick={() => changeSelectedDate(shiftDate(selectedDate, 1))} aria-label="後一天">→</button></div>
              {!isToday && <button className="today-button" type="button" onClick={() => changeSelectedDate(todayKey)}>回到今天</button>}
            </div>
          </section>

          <nav className="week-strip" aria-label="鄰近日期">
            {week.map((key) => {
              const date = fromDateKey(key);
              const active = key === selectedDate;
              return <button className={active ? 'week-day active' : 'week-day'} key={key} type="button" onClick={() => changeSelectedDate(key)} aria-current={active ? 'date' : undefined}><span>{date.toLocaleDateString('zh-TW', { weekday: 'short' }).replace('週', '')}</span><strong>{date.getDate()}</strong>{entries[key]?.tasks.some((task) => task.done) && <i aria-label="這天已有完成事項" />}</button>;
            })}
          </nav>

          <div className="content-grid" aria-busy={!isReady}>
            <section className="card tasks-card" aria-labelledby="tasks-title">
              <div className="card-heading"><div><p className="section-number">01</p><h2 id="tasks-title">今天要完成</h2></div><div className="progress-wrap" aria-label={`已完成 ${progress}%`}><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><span>{progress}<small>%</small></span></div><p>{entry.tasks.length ? `${completed} / ${entry.tasks.length} 完成` : '慢慢開始'}</p></div></div>

              <div className="day-section-settings">
                <label><span>把每天切成</span><select value={sections.length} onChange={(event) => changeSectionCount(Number(event.target.value))} disabled={!isReady}><option value={0}>不切分</option>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} 等分</option>)}</select></label>
                {sections.length > 0 && <div className="section-name-fields">{sections.map((section) => <input key={section.id} value={section.title} maxLength={50} aria-label="分段名稱" onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item))} onBlur={commitSectionNames} />)}</div>}
                <small>{sections.length ? '拖曳待辦到下方分段；手機可點文字後選擇時段。' : '設定後可把任務拖曳到一天的不同部分。'}</small>
              </div>

              <form className="task-form" onSubmit={addTask}>
                <div className="task-create-fields">
                  <label className="sr-only" htmlFor="new-task">新增待辦事項</label><input id="new-task" value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="寫下接下來要做的事…" autoComplete="off" disabled={!isReady} />
                  <div className="task-basic-options"><select aria-label="綁定大週期" value={taskLink} onChange={(event) => setTaskLink(event.target.value)} disabled={!isReady}><CycleLinkOptions cycles={cycles} /></select><select aria-label="安排時段" value={taskSection} onChange={(event) => setTaskSection(event.target.value)} disabled={!isReady || sections.length === 0}><SectionOptions sections={sections} /></select></div>
                  <details className="task-advanced">
                    <summary>重複與習慣設計</summary>
                    <div className="repeat-grid">
                      <label><span>重複週期</span><select value={repeatUnit} onChange={(event) => setRepeatUnit(event.target.value as RepeatUnit)}><option value="">不重複</option><option value="day">按天</option><option value="week">按週</option><option value="month">按月</option></select></label>
                      {repeatUnit && <><label><span>每隔</span><input type="number" min={1} max={365} value={repeatInterval} onChange={(event) => setRepeatInterval(Number(event.target.value))} /></label><label><span>結束方式</span><select value={repeatEndMode} onChange={(event) => setRepeatEndMode(event.target.value as 'count' | 'date')}><option value="count">出現次數</option><option value="date">結束日期</option></select></label>{repeatEndMode === 'count' ? <label><span>總次數（含本次）</span><input type="number" min={2} max={365} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /></label> : <label><span>重複到</span><input type="date" min={shiftDate(selectedDate, 1)} value={repeatUntil} onChange={(event) => setRepeatUntil(event.target.value)} /></label>}</>}
                    </div>
                    <div className="habit-fields"><label><span>身份型習慣（選填）</span><input value={identity} maxLength={300} onChange={(event) => setIdentity(event.target.value)} placeholder="例如：成為持續精進的工程師" /></label><label><span>習慣提示（選填）</span><input value={habitCue} maxLength={300} onChange={(event) => setHabitCue(event.target.value)} placeholder="例如：泡好早上第一杯咖啡" /></label><label><span>兩分鐘版本（選填）</span><input value={tinyStart} maxLength={300} onChange={(event) => setTinyStart(event.target.value)} placeholder="例如：只打開題目並寫下輸入輸出" /></label></div>
                  </details>
                  {taskMessage && <p className={syncStatus === 'error' ? 'task-message error' : 'task-message'}>{taskMessage}</p>}
                </div>
                <button type="submit" aria-label="加入待辦" disabled={!isReady}>{isAddingTask ? '…' : '＋'}</button>
              </form>

              {entry.tasks.length === 0 ? <div className="empty-state"><span aria-hidden="true">✓</span><p>{isReady ? '今天還是一張白紙' : '正在打開今天這一頁'}</p><small>{isReady ? '從一件小事開始，就很好。' : '請稍候片刻。'}</small></div> : sections.length === 0 ? <div className="task-list" aria-live="polite">{entry.tasks.map(renderTask)}</div> : (
                <div className="day-section-board" aria-live="polite">
                  {sections.map((section) => {
                    const tasks = entry.tasks.filter((task) => task.sectionId === section.id);
                    return <section className={draggingTaskId ? 'day-section drop-ready' : 'day-section'} key={section.id} onDragOver={(event) => event.preventDefault()} onDrop={() => draggingTaskId && moveTaskToSection(draggingTaskId, section.id)}><header><strong>{section.title}</strong><span>{tasks.length} 件</span></header><div className="section-task-list">{tasks.length ? tasks.map((task) => renderTask(task, entry.tasks.indexOf(task))) : <p>拖到這裡</p>}</div></section>;
                  })}
                  {(unassignedTasks.length > 0 || draggingTaskId) && <section className="day-section unassigned" onDragOver={(event) => event.preventDefault()} onDrop={() => draggingTaskId && moveTaskToSection(draggingTaskId, null)}><header><strong>尚未安排</strong><span>{unassignedTasks.length} 件</span></header><div className="section-task-list">{unassignedTasks.map((task) => renderTask(task, entry.tasks.indexOf(task)))}</div></section>}
                </div>
              )}
            </section>

            <div className="notes-column">
              <section className="card note-card" aria-labelledby="activity-title"><div className="card-heading compact"><div><p className="section-number">02</p><h2 id="activity-title">今天做了什麼</h2></div><span className="writing-mark" aria-hidden="true">✦</span></div><textarea value={entry.activity} onChange={(event) => updateEntry((current) => ({ ...current, activity: event.target.value }))} onBlur={flushPendingSave} placeholder={'把今天發生的事記下來…\n\n完成了什麼、去了哪裡，或是遇見了誰？'} aria-label="今天做了什麼" disabled={!isReady} /></section>
              <section className="card note-card reflection-card" aria-labelledby="reflection-title"><div className="card-heading compact"><div><p className="section-number">03</p><h2 id="reflection-title">今日心得</h2></div><span className="writing-mark" aria-hidden="true">〰</span></div><textarea value={entry.reflection} onChange={(event) => updateEntry((current) => ({ ...current, reflection: event.target.value }))} onBlur={flushPendingSave} placeholder={'今天有什麼感受？\n留一句話，給明天的自己。'} aria-label="今日心得" disabled={!isReady} /></section>
            </div>
          </div>

          <section className="custom-records" aria-labelledby="custom-records-title">
            <div className="custom-records-heading"><div><p className="section-number">04</p><h2 id="custom-records-title">自訂紀錄</h2><small>新增一次後，每一天都會有同一個欄位。</small></div><form onSubmit={addCustomField}><input value={newFieldTitle} onChange={(event) => setNewFieldTitle(event.target.value)} maxLength={100} placeholder="例如：LeetCode 筆記" /><button type="submit">新增欄位</button></form></div>
            {customFields.length > 0 ? <div className="custom-record-grid">{customFields.map((field) => <section className="card custom-note-card" key={field.id}><div><h3>{field.title}</h3><button type="button" onClick={() => void deleteCustomField(field)} aria-label={`刪除欄位：${field.title}`}>刪除</button></div><textarea value={field.content} onChange={(event) => updateCustomField(field.id, event.target.value)} placeholder={`寫下今天的${field.title}…`} /></section>)}</div> : <p className="custom-record-empty">還沒有自訂欄位。可以先新增「LeetCode 筆記」或任何你想每天追蹤的內容。</p>}
          </section>

          <footer><p>一天一頁，把日子好好收進來。</p><span>{selectedDate.replaceAll('-', ' · ')}</span></footer>
        </>
      )}
    </main>
  );
}
