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

const learningCopy = {
  en: {
    label: 'Use my practice history',
    detail: 'Include up to 60 LeetCode attempts (with short notes) and 100 practice sessions from the 30 days ending on the selected date. These are sent to Groq with this conversation. Changing this option starts a new conversation.',
    start: 'Plan four weeks of interview prep',
    startPrompt: 'I want to prepare for coding interviews over the next four weeks. Ask about my target, deadline, weekly available time, and starting level if needed, then propose phases and a realistic first week with review and buffer time.',
    review: 'Adjust my next practice week',
    reviewPrompt: 'Review my recent practice attempts and missed sessions, then propose the next seven days around my existing calendar. Explain which dated attempts justify each review. Ask for my deadline and available hours if missing. Keep completed work and existing tasks unchanged; reduce new work if review needs more time.',
    linked: 'Linked practice · completion records a new attempt',
  },
  zh: {
    label: '使用我的練習紀錄',
    detail: '包含截至所選日期前 30 天、最多 60 次 LeetCode 作答（含簡短筆記）與 100 個練習任務，會和對話一起傳送給 Groq。切換此選項會開始新對話。',
    start: '安排四週面試準備',
    startPrompt: '我想在未來四週準備程式面試。請先確認我的目標、期限、每週可用時間與目前程度，再提出階段和合理的第一週安排，包含複習與緩衝時間。',
    review: '依作答調整下週練習',
    reviewPrompt: '請讀取最近的作答結果與未完成練習，搭配既有行事曆安排未來七天，說明每項複習是根據哪一題、哪一天的紀錄。如果缺少期限或可用時數，請先詢問。保留已完成與既有任務，複習較多時減少新題。',
    linked: '已連結題目 · 完成時可記錄本次作答',
  },
  ja: {
    label: '練習履歴を使う',
    detail: '選択日までの30日間から、最大60件のLeetCode解答（短いメモを含む）と100件の練習予定を会話とともにGroqへ送信します。変更すると新しい会話が始まります。',
    start: '4週間の面接準備を計画',
    startPrompt: '今後4週間でコーディング面接を準備したいです。目標、期限、週の空き時間、現在のレベルを確認し、復習と余白を含むフェーズと最初の1週間を提案してください。',
    review: '解答履歴から来週を調整',
    reviewPrompt: '最近の解答結果と未完了の練習を読み、既存の予定に合わせて次の7日間を提案してください。復習の根拠となる問題名と日付を説明してください。期限と時間が不明なら先に質問し、完了済みと既存のタスクを保持して、復習が多い場合は新しい問題を減らしてください。',
    linked: '問題にリンク済み · 完了時に解答を記録',
  },
};

export default function PlannerChat({
  selectedDate,
  onApplied,
}: {
  selectedDate: string;
  onApplied: (firstDate: string | null) => void;
}) {
  const { language, t } = useI18n();
  const learning = learningCopy[language];
  const [includePractice, setIncludePractice] = useState(false);
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
    { label: learning.start, prompt: learning.startPrompt },
    ...(includePractice ? [{ label: learning.review, prompt: learning.reviewPrompt }] : []),
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
        body: JSON.stringify({ messages: history, currentDate: selectedDate, timezone, language, includePractice }),
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

      <div className="card practice-context-control">
        <label>
          <input type="checkbox" checked={includePractice} disabled={status !== 'ready'} onChange={event => {
            setIncludePractice(event.target.checked);
            setMessages([{ id: 'welcome', role: 'assistant', localOnly: true, content: '' }]);
            setError('');
          }} />
          <strong>{learning.label}</strong>
        </label>
        <p>{learning.detail}</p>
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
  const { t, language } = useI18n();
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
              <ul>{tasks.map((task) => <li key={`${date}-${task.text}`}><span /><div>{task.text}{task.leetcodeProblemId && <small className="practice-linked">{learningCopy[language].linked}</small>}</div></li>)}</ul>
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
