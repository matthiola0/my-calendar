'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerChatMessage, PlannerProposal, PlannerReply } from '../lib/planner-types';
import { useI18n } from '../lib/i18n';

type ChatItem = PlannerChatMessage & {
  id: string;
  localOnly?: boolean;
  questions?: string[];
  proposal?: PlannerProposal | null;
  applied?: boolean;
};

export default function PlannerChat({
  selectedDate,
  onApplied,
}: {
  selectedDate: string;
  onApplied: (firstDate: string | null) => void;
}) {
  const { language, t } = useI18n();
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      localOnly: true,
      content: '',
    },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'ready' | 'sending' | 'applying'>('ready');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
    [],
  );
  const suggestions = [
    { label: t('suggestionCycleLabel'), prompt: t('suggestionCyclePrompt') },
    { label: t('suggestionDailyLabel'), prompt: t('suggestionDailyPrompt') },
    { label: t('suggestionLoadLabel'), prompt: t('suggestionLoadPrompt') },
    { label: t('suggestionTodayLabel'), prompt: t('suggestionTodayPrompt') },
    { label: t('suggestionHabitLabel'), prompt: t('suggestionHabitPrompt') },
    { label: t('suggestionAdjustLabel'), prompt: t('suggestionAdjustPrompt') },
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, status]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = input.trim();
    if (!content || status !== 'ready') return;

    const userMessage: ChatItem = { id: crypto.randomUUID(), role: 'user', content };
    const history = [...messages.filter((message) => !message.localOnly), userMessage]
      .slice(-12)
      .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError('');
    setStatus('sending');

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, currentDate: selectedDate, timezone, language }),
      });
      const result = await response.json().catch(() => ({})) as PlannerReply & { error?: string };
      if (!response.ok) throw new Error(t('plannerTemporaryError'));

      const questionText = result.questions.length
        ? `\n\n${result.questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}`
        : '';
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `${result.message}${questionText}`,
          questions: result.questions,
          proposal: result.proposal,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('plannerTemporaryError'));
    } finally {
      setStatus('ready');
    }
  };

  const applyProposal = async (messageId: string, proposal: PlannerProposal) => {
    if (status !== 'ready') return;
    setStatus('applying');
    setError('');
    try {
      const response = await fetch('/api/assistant/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal }),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        cycleCreated?: boolean;
        tasksCreated?: number;
        tasksSkipped?: number;
        firstDate?: string | null;
      };
      if (!response.ok) throw new Error(t('plannerApplyError'));
      const detail = [
        result.cycleCreated ? t('plannerAppliedCycle') : null,
        result.tasksCreated ? t('plannerAppliedTasks', { count: result.tasksCreated }) : null,
        result.tasksSkipped ? t('plannerSkippedTasks', { count: result.tasksSkipped }) : null,
      ].filter(Boolean).join(' · ');
      setMessages((current) => current.map((message) =>
        message.id === messageId
          ? { ...message, applied: true }
          : message,
      ).concat({
        id: crypto.randomUUID(),
        role: 'assistant',
        localOnly: true,
        content: detail ? `${detail}. ${t('plannerApplied')}` : t('plannerApplied'),
      }));
      onApplied(result.firstDate ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('plannerApplyError'));
    } finally {
      setStatus('ready');
    }
  };

  const chooseSuggestion = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <section className="planner-view" id="top" aria-labelledby="planner-title">
      <div className="planner-heading">
        <div>
          <p className="eyebrow">{t('plannerEyebrow')}</p>
          <h1 id="planner-title">{t('plannerHeadline')}</h1>
          <p>{t('plannerDescription')}</p>
        </div>
        <div className="planner-privacy"><span aria-hidden="true">◇</span><p><strong>{t('plannerNoSave')}</strong><small>{t('plannerNoSaveHint')}</small></p></div>
      </div>

      <div className="planner-layout">
        <aside className="planner-suggestions" aria-label={t('plannerSuggestionsTitle')}>
          <p>{t('plannerSuggestionsTitle')}</p>
          <div>
            {suggestions.map((suggestion) => (
              <button key={suggestion.label} type="button" onClick={() => chooseSuggestion(suggestion.prompt)}>
                <strong>{suggestion.label}</strong>
                <span>{t('plannerFillPrompt')}</span>
              </button>
            ))}
          </div>
          <small>{t('plannerCurrentDate', { date: selectedDate })}</small>
        </aside>

        <div className="card planner-chat-card">
          <div className="planner-messages" aria-live="polite">
            {messages.map((message) => (
              <article className={`planner-message ${message.role}`} key={message.id}>
                <div className="planner-avatar" aria-hidden="true">{message.role === 'assistant' ? t('brandMark') : language === 'zh' ? '你' : language === 'ja' ? '私' : 'Y'}</div>
                <div className="planner-bubble">
                  <p>{message.id === 'welcome' ? t('plannerWelcome') : message.questions?.length ? message.content.split('\n\n')[0] : message.content}</p>
                  {message.questions?.length ? (
                    <ol>{message.questions.map((question) => <li key={question}>{question}</li>)}</ol>
                  ) : null}
                  {message.proposal ? (
                    <ProposalCard
                      proposal={message.proposal}
                      applied={Boolean(message.applied)}
                      applying={status === 'applying'}
                      onApply={() => void applyProposal(message.id, message.proposal as PlannerProposal)}
                    />
                  ) : null}
                </div>
              </article>
            ))}
            {status === 'sending' ? (
              <article className="planner-message assistant loading" aria-label={t('plannerThinking')}>
                <div className="planner-avatar" aria-hidden="true">{t('brandMark')}</div>
                <div className="planner-bubble"><span /><span /><span /></div>
              </article>
            ) : null}
            <div ref={endRef} />
          </div>

          <form className="planner-composer" onSubmit={submit}>
            {error ? <p className="planner-error" role="alert">{error}</p> : null}
            <div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={4_000}
                rows={3}
                placeholder={t('plannerPlaceholder')}
                aria-label={t('plannerAria')}
                disabled={status !== 'ready'}
              />
              <button type="submit" disabled={!input.trim() || status !== 'ready'}>
                {status === 'ready' ? t('send') : t('pleaseWait')}
              </button>
            </div>
            <small>{t('plannerComposerHint')}</small>
          </form>
        </div>
      </div>
    </section>
  );
}

function ProposalCard({
  proposal,
  applied,
  applying,
  onApply,
}: {
  proposal: PlannerProposal;
  applied: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const groupedTasks = proposal.tasks.reduce<Record<string, typeof proposal.tasks>>((groups, task) => {
    (groups[task.date] ??= []).push(task);
    return groups;
  }, {});

  return (
    <section className="planner-proposal" aria-label={t('proposalLabel')}>
      <header><span>{t('proposalPreview')}</span><strong>{t('proposalTaskCount', { count: proposal.tasks.length })}</strong></header>
      <p>{proposal.summary}</p>
      {proposal.cycle ? (
        <div className="proposal-cycle">
          <small>{t('proposalNewCycle')}</small>
          <h3>{proposal.cycle.title}</h3>
          <p>{proposal.cycle.startDate} — {proposal.cycle.endDate}</p>
          <strong>{proposal.cycle.goal}</strong>
          {proposal.cycle.phases.length ? (
            <ol>{proposal.cycle.phases.map((phase) => <li key={`${phase.startDate}-${phase.title}`}><span>{phase.startDate}～{phase.endDate}</span>{phase.title}</li>)}</ol>
          ) : null}
        </div>
      ) : null}
      {proposal.tasks.length ? (
        <div className="proposal-days">
          {Object.entries(groupedTasks).map(([date, tasks]) => (
            <section key={date}>
              <time>{date}</time>
              <ul>{tasks.map((task) => <li key={`${date}-${task.text}`}><span />{task.text}</li>)}</ul>
            </section>
          ))}
        </div>
      ) : null}
      <footer>
        <small>{t('proposalSafety')}</small>
        <button type="button" onClick={onApply} disabled={applied || applying}>
          {applied ? t('proposalApplied') : applying ? t('proposalApplying') : t('proposalApply')}
        </button>
      </footer>
    </section>
  );
}
