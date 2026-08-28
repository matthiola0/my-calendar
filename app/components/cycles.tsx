'use client';

import { FormEvent, useEffect, useState } from 'react';

type CyclePhase = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
};

type MacroCycle = {
  id: string;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed';
  revision: string | null;
  phases: CyclePhase[];
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

async function readCycles() {
  const response = await fetch('/api/cycles', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load cycles');
  return response.json() as Promise<{ cycles: MacroCycle[] }>;
}

export default function Cycles() {
  const [cycles, setCycles] = useState<MacroCycle[]>([]);
  const [draft, setDraft] = useState<MacroCycle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    readCycles()
      .then((result) => {
        if (!active) return;
        setCycles(result.cycles);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const startNewCycle = () => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 30);
    setDraft({
      id: crypto.randomUUID(),
      title: '',
      goal: '',
      startDate: dateKey(start),
      endDate: dateKey(end),
      status: 'active',
      revision: null,
      phases: [],
    });
    setMessage('');
  };

  const editCycle = (cycle: MacroCycle) => {
    setDraft({ ...cycle, phases: cycle.phases.map((phase) => ({ ...phase })) });
    setMessage('');
  };

  const updateDraft = <Key extends keyof MacroCycle>(key: Key, value: MacroCycle[Key]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updatePhase = (id: string, update: Partial<CyclePhase>) => {
    if (!draft) return;
    updateDraft(
      'phases',
      draft.phases.map((phase) => phase.id === id ? { ...phase, ...update } : phase),
    );
  };

  const addPhase = () => {
    if (!draft) return;
    updateDraft('phases', [
      ...draft.phases,
      {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        startDate: draft.startDate,
        endDate: draft.endDate,
      },
    ]);
  };

  const saveCycle = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/cycles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? '儲存失敗。');
      }
      const result = await readCycles();
      setCycles(result.cycles);
      setDraft(null);
      setStatus('ready');
      setMessage('大週期已同步至雲端。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '儲存失敗。');
    }
  };

  const copyAiPrompt = async (cycle: MacroCycle) => {
    const phases = cycle.phases
      .map((phase) => `- ${phase.startDate}～${phase.endDate}｜${phase.title}：${phase.description}`)
      .join('\n');
    const prompt = `請依照這個大週期，先讀取日期內既有行事曆，再把每個階段拆成可完成的每日待辦。保留原有事項，控制每天工作量，並在排完後讀回確認。\n\n大週期：${cycle.title}\n日期：${cycle.startDate}～${cycle.endDate}\n目標：${cycle.goal}\n階段：\n${phases || '- 尚未設定，請先協助拆分階段'}`;
    await navigator.clipboard.writeText(prompt);
    setMessage('AI 拆解指令已複製；貼到你的 AI 對話即可。');
  };

  return (
    <div className="cycles-view" id="top">
      <section className="cycles-hero">
        <div>
          <p className="eyebrow">MACRO CYCLE · 先看方向</p>
          <h1>把遠方，拆成今天的一小步。</h1>
          <p>設定一段時間的目標與階段，再交給 AI 轉成每天能執行的小週期。</p>
        </div>
        <button className="primary-button" type="button" onClick={startNewCycle}>＋ 新增大週期</button>
      </section>

      {message && <p className={status === 'error' ? 'cycle-message error' : 'cycle-message'} role="status">{message}</p>}

      {draft && (
        <form className="card cycle-editor" onSubmit={saveCycle}>
          <div className="cycle-editor-heading">
            <div>
              <p className="section-number">PLAN</p>
              <h2>{draft.revision ? '編輯大週期' : '設定新的大週期'}</h2>
            </div>
            <button className="text-button" type="button" onClick={() => setDraft(null)}>取消</button>
          </div>

          <div className="cycle-fields">
            <label className="wide-field">
              <span>名稱</span>
              <input required maxLength={200} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="例如：2027 畢業無縫就業" />
            </label>
            <label>
              <span>開始</span>
              <input required type="date" value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} />
            </label>
            <label>
              <span>結束</span>
              <input required type="date" value={draft.endDate} onChange={(event) => updateDraft('endDate', event.target.value)} />
            </label>
            <label className="wide-field">
              <span>這個週期完成時，我想成為什麼狀態？</span>
              <textarea required maxLength={5000} value={draft.goal} onChange={(event) => updateDraft('goal', event.target.value)} placeholder="寫結果，不只寫想做的事。" />
            </label>
            <label>
              <span>狀態</span>
              <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value as MacroCycle['status'])}>
                <option value="active">進行中</option>
                <option value="completed">已完成</option>
              </select>
            </label>
          </div>

          <div className="phase-editor-heading">
            <div>
              <h3>階段</h3>
              <p>每個階段只保留一個清楚的重點。</p>
            </div>
            <button className="secondary-button" type="button" onClick={addPhase}>＋ 加入階段</button>
          </div>

          <div className="phase-editor-list">
            {draft.phases.map((phase, index) => (
              <fieldset className="phase-editor" key={phase.id}>
                <legend>{String(index + 1).padStart(2, '0')}</legend>
                <label className="phase-title-field">
                  <span>階段名稱</span>
                  <input required maxLength={200} value={phase.title} onChange={(event) => updatePhase(phase.id, { title: event.target.value })} />
                </label>
                <label>
                  <span>開始</span>
                  <input required type="date" value={phase.startDate} onChange={(event) => updatePhase(phase.id, { startDate: event.target.value })} />
                </label>
                <label>
                  <span>結束</span>
                  <input required type="date" value={phase.endDate} onChange={(event) => updatePhase(phase.id, { endDate: event.target.value })} />
                </label>
                <label className="phase-description-field">
                  <span>這一段要做到什麼</span>
                  <textarea maxLength={2000} value={phase.description} onChange={(event) => updatePhase(phase.id, { description: event.target.value })} />
                </label>
                <button className="remove-phase" type="button" onClick={() => updateDraft('phases', draft.phases.filter((item) => item.id !== phase.id))}>移除</button>
              </fieldset>
            ))}
          </div>

          <div className="cycle-editor-actions">
            <p>資料只存進你的行事曆；按下 AI 拆解時才由你決定貼給哪個 AI。</p>
            <button className="primary-button" type="submit" disabled={status === 'saving'}>{status === 'saving' ? '正在儲存…' : '儲存大週期'}</button>
          </div>
        </form>
      )}

      <section className="cycles-list" aria-busy={status === 'loading'}>
        {status === 'loading' ? (
          <div className="card cycle-empty">正在打開你的大週期…</div>
        ) : cycles.length === 0 ? (
          <div className="card cycle-empty">
            <span>◎</span>
            <h2>先決定要去哪裡</h2>
            <p>新增第一個大週期，再把它拆成幾個有明確結果的階段。</p>
          </div>
        ) : (
          cycles.map((cycle) => (
            <article className="card cycle-card" key={cycle.id}>
              <div className="cycle-card-heading">
                <div>
                  <p className="cycle-dates">{displayDate(cycle.startDate)} — {displayDate(cycle.endDate)}</p>
                  <h2>{cycle.title}</h2>
                  <p className="cycle-goal">{cycle.goal}</p>
                </div>
                <span className={cycle.status === 'completed' ? 'cycle-status completed' : 'cycle-status'}>{cycle.status === 'completed' ? '已完成' : '進行中'}</span>
              </div>

              <ol className="phase-timeline">
                {cycle.phases.length ? cycle.phases.map((phase) => (
                  <li key={phase.id}>
                    <span className="phase-dot" aria-hidden="true" />
                    <p>{displayDate(phase.startDate)} — {displayDate(phase.endDate)}</p>
                    <h3>{phase.title}</h3>
                    {phase.description && <small>{phase.description}</small>}
                  </li>
                )) : (
                  <li className="no-phase">尚未設定階段，可以先請 AI 幫你拆分。</li>
                )}
              </ol>

              <div className="cycle-card-actions">
                <button className="secondary-button" type="button" onClick={() => copyAiPrompt(cycle)}>複製 AI 拆解指令</button>
                <button className="text-button" type="button" onClick={() => editCycle(cycle)}>編輯</button>
              </div>
            </article>
          ))
        )}
      </section>

      <footer>
        <p>大週期決定方向，小週期負責前進。</p>
        <span>MACRO → DAILY</span>
      </footer>
    </div>
  );
}
