'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useI18n } from '@/app/lib/i18n';

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
  reward: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed';
  revision: string | null;
  phases: CyclePhase[];
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string, locale: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(locale, {
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
  const { locale, t } = useI18n();
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
      reward: '',
      startDate: dateKey(start),
      endDate: dateKey(end),
      status: 'active',
      revision: null,
      phases: [],
      progress: { completed: 0, total: 0, percentage: 0 },
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
        throw new Error(t('saveFailed'));
      }
      const result = await readCycles();
      setCycles(result.cycles);
      setDraft(null);
      setStatus('ready');
      setMessage(t('cycleSaved'));
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : t('saveFailed'));
    }
  };

  const copyAiPrompt = async (cycle: MacroCycle) => {
    const phases = cycle.phases
      .map((phase) => `- ${phase.startDate}–${phase.endDate} | ${phase.title}: ${phase.description}`)
      .join('\n');
    const prompt = t('cycleAiPrompt', {
      title: cycle.title,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      goal: cycle.goal,
      reward: cycle.reward || t('notSet'),
      phases: phases || t('phasesNotSet'),
    });
    await navigator.clipboard.writeText(prompt);
    setMessage(t('aiPromptCopied'));
  };

  return (
    <div className="cycles-view" id="top">
      <section className="cycles-hero">
        <div>
          <p className="eyebrow">{t('cyclesEyebrow')}</p>
          <h1>{t('cyclesHeadline')}</h1>
          <p>{t('cyclesDescription')}</p>
        </div>
        <button className="primary-button" type="button" onClick={startNewCycle}>＋ {t('addCycle')}</button>
      </section>

      {message && <p className={status === 'error' ? 'cycle-message error' : 'cycle-message'} role="status">{message}</p>}

      {draft && (
        <form className="card cycle-editor" onSubmit={saveCycle}>
          <div className="cycle-editor-heading">
            <div>
              <p className="section-number">PLAN</p>
              <h2>{draft.revision ? t('editCycle') : t('newCycle')}</h2>
            </div>
            <button className="text-button" type="button" onClick={() => setDraft(null)}>{t('cancel')}</button>
          </div>

          <div className="cycle-fields">
            <label className="wide-field">
              <span>{t('cycleName')}</span>
              <input required maxLength={200} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder={t('cycleNameExample')} />
            </label>
            <label>
              <span>{t('start')}</span>
              <input required type="date" value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} />
            </label>
            <label>
              <span>{t('end')}</span>
              <input required type="date" value={draft.endDate} onChange={(event) => updateDraft('endDate', event.target.value)} />
            </label>
            <label className="wide-field">
              <span>{t('cycleGoal')}</span>
              <textarea required maxLength={5000} value={draft.goal} onChange={(event) => updateDraft('goal', event.target.value)} placeholder={t('cycleGoalPlaceholder')} />
            </label>
            <label className="wide-field">
              <span>{t('cycleReward')}</span>
              <input maxLength={1000} value={draft.reward} onChange={(event) => updateDraft('reward', event.target.value)} placeholder={t('cycleRewardPlaceholder')} />
            </label>
            <label>
              <span>{t('status')}</span>
              <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value as MacroCycle['status'])}>
                <option value="active">{t('active')}</option>
                <option value="completed">{t('completed')}</option>
              </select>
            </label>
          </div>

          <div className="phase-editor-heading">
            <div>
              <h3>{t('phases')}</h3>
              <p>{t('phasesHint')}</p>
            </div>
            <button className="secondary-button" type="button" onClick={addPhase}>＋ {t('addPhase')}</button>
          </div>

          <div className="phase-editor-list">
            {draft.phases.map((phase, index) => (
              <fieldset className="phase-editor" key={phase.id}>
                <legend>{String(index + 1).padStart(2, '0')}</legend>
                <label className="phase-title-field">
                  <span>{t('phaseName')}</span>
                  <input required maxLength={200} value={phase.title} onChange={(event) => updatePhase(phase.id, { title: event.target.value })} />
                </label>
                <label>
                  <span>{t('start')}</span>
                  <input required type="date" value={phase.startDate} onChange={(event) => updatePhase(phase.id, { startDate: event.target.value })} />
                </label>
                <label>
                  <span>{t('end')}</span>
                  <input required type="date" value={phase.endDate} onChange={(event) => updatePhase(phase.id, { endDate: event.target.value })} />
                </label>
                <label className="phase-description-field">
                  <span>{t('phaseOutcome')}</span>
                  <textarea maxLength={2000} value={phase.description} onChange={(event) => updatePhase(phase.id, { description: event.target.value })} />
                </label>
                <button className="remove-phase" type="button" onClick={() => updateDraft('phases', draft.phases.filter((item) => item.id !== phase.id))}>{t('remove')}</button>
              </fieldset>
            ))}
          </div>

          <div className="cycle-editor-actions">
            <p>{t('cycleDataNote')}</p>
            <button className="primary-button" type="submit" disabled={status === 'saving'}>{status === 'saving' ? t('saving') : t('saveCycle')}</button>
          </div>
        </form>
      )}

      <section className="cycles-list" aria-busy={status === 'loading'}>
        {status === 'loading' ? (
          <div className="card cycle-empty">{t('loadingCycles')}</div>
        ) : cycles.length === 0 ? (
          <div className="card cycle-empty">
            <span>◎</span>
            <h2>{t('emptyCyclesTitle')}</h2>
            <p>{t('emptyCyclesText')}</p>
          </div>
        ) : (
          cycles.map((cycle) => (
            <article className="card cycle-card" key={cycle.id}>
              <div className="cycle-card-heading">
                <div>
                  <p className="cycle-dates">{displayDate(cycle.startDate, locale)} — {displayDate(cycle.endDate, locale)}</p>
                  <h2>{cycle.title}</h2>
                  <p className="cycle-goal">{cycle.goal}</p>
                </div>
                <span className={cycle.status === 'completed' ? 'cycle-status completed' : 'cycle-status'}>{cycle.status === 'completed' ? t('completed') : t('active')}</span>
              </div>

              <div className="cycle-progress" aria-label={t('cycleProgress', { progress: cycle.progress.percentage })}>
                <div className="cycle-progress-heading">
                  <strong>{cycle.progress.percentage}%</strong>
                  <span>{cycle.progress.total ? t('cycleTasksDone', { completed: cycle.progress.completed, total: cycle.progress.total }) : t('noLinkedTasks')}</span>
                </div>
                <div className="cycle-progress-track" aria-hidden="true">
                  <i style={{ width: `${cycle.progress.percentage}%` }} />
                </div>
              </div>

              <div className={cycle.reward ? 'cycle-reward' : 'cycle-reward empty'}>
                <strong>{t('reward')}</strong>
                <p>{cycle.reward || t('noReward')}</p>
              </div>

              <ol className="phase-timeline">
                {cycle.phases.length ? cycle.phases.map((phase) => (
                  <li key={phase.id}>
                    <span className="phase-dot" aria-hidden="true" />
                    <p>{displayDate(phase.startDate, locale)} — {displayDate(phase.endDate, locale)}</p>
                    <h3>{phase.title}</h3>
                    {phase.description && <small>{phase.description}</small>}
                  </li>
                )) : (
                  <li className="no-phase">{t('noPhases')}</li>
                )}
              </ol>

              <div className="cycle-card-actions">
                <button className="secondary-button" type="button" onClick={() => copyAiPrompt(cycle)}>{t('copyAiPrompt')}</button>
                <button className="text-button" type="button" onClick={() => editCycle(cycle)}>{t('edit')}</button>
              </div>
            </article>
          ))
        )}
      </section>

      <footer>
        <p>{t('cyclesFooter')}</p>
        <span>MACRO → DAILY</span>
      </footer>
    </div>
  );
}
