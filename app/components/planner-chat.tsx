'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerChatMessage, PlannerProposal, PlannerReply } from '../lib/planner-types';

type ChatItem = PlannerChatMessage & {
  id: string;
  localOnly?: boolean;
  questions?: string[];
  proposal?: PlannerProposal | null;
  applied?: boolean;
};

const suggestions = [
  {
    label: '規劃大週期',
    prompt: '我想建立一個新的大週期。請先問我最多三個必要問題，再替我規劃階段、緩衝時間和完成獎勵。',
  },
  {
    label: '拆成每日任務',
    prompt: '請讀取我進行中的大週期和接下來兩週的既有行事曆，保留原有事項，把目前階段拆成每天可完成的小任務。',
  },
  {
    label: '檢查是否超載',
    prompt: '請檢查我下週的既有任務和大週期，找出工作量過重或日期衝突的地方，先給我調整建議。',
  },
  {
    label: '只安排今天',
    prompt: '我今天可投入 90 分鐘，請讀取今天的行事曆，替我挑出最值得新增的兩個小任務，並保留緩衝。',
  },
  {
    label: '建立習慣',
    prompt: '我想培養一個新習慣。請幫我設計身份、觸發提示、兩分鐘起步，並提出未來兩週的合理安排。',
  },
  {
    label: '依進度調整',
    prompt: '請根據目前大週期的完成進度和接下來兩週的行事曆，提出一份更現實的小週期安排。',
  },
];

export default function PlannerChat({
  selectedDate,
  onApplied,
}: {
  selectedDate: string;
  onApplied: (firstDate: string | null) => void;
}) {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      localOnly: true,
      content: '告訴我你想完成什麼、期限和每週能投入多少時間。我會先讀取相關日期，再提出可以預覽的行事曆計畫。',
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
        body: JSON.stringify({ messages: history, currentDate: selectedDate, timezone }),
      });
      const result = await response.json().catch(() => ({ error: 'AI 暫時沒有回應。' })) as PlannerReply & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'AI 暫時沒有回應。');

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
      setError(caught instanceof Error ? caught.message : 'AI 暫時沒有回應。');
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
      const result = await response.json().catch(() => ({ error: '無法套用提案。' })) as {
        error?: string;
        cycleCreated?: boolean;
        tasksCreated?: number;
        tasksSkipped?: number;
        firstDate?: string | null;
      };
      if (!response.ok) throw new Error(result.error ?? '無法套用提案。');
      const detail = [
        result.cycleCreated ? '已建立大週期' : null,
        result.tasksCreated ? `新增 ${result.tasksCreated} 個任務` : null,
        result.tasksSkipped ? `略過 ${result.tasksSkipped} 個重複任務` : null,
      ].filter(Boolean).join('，');
      setMessages((current) => current.map((message) =>
        message.id === messageId
          ? { ...message, applied: true }
          : message,
      ).concat({
        id: crypto.randomUUID(),
        role: 'assistant',
        localOnly: true,
        content: `${detail || '提案已套用'}。你可以回到每日或大週期頁面查看。`,
      }));
      onApplied(result.firstDate ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '無法套用提案。');
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
          <p className="eyebrow">AI PLANNER · 先對話，再寫入</p>
          <h1 id="planner-title">一起把想法，排成做得到的日子。</h1>
          <p>AI 只會讀取規劃所需的日期；提案在你確認前不會更動行事曆。</p>
        </div>
        <div className="planner-privacy"><span aria-hidden="true">◇</span><p><strong>對話不保存</strong><small>離開或重新整理後即清除</small></p></div>
      </div>

      <div className="planner-layout">
        <aside className="planner-suggestions" aria-label="建議問題">
          <p>不知道怎麼開始？</p>
          <div>
            {suggestions.map((suggestion) => (
              <button key={suggestion.label} type="button" onClick={() => chooseSuggestion(suggestion.prompt)}>
                <strong>{suggestion.label}</strong>
                <span>填入對話框</span>
              </button>
            ))}
          </div>
          <small>目前以 {selectedDate} 作為「今天」來理解相對日期。</small>
        </aside>

        <div className="card planner-chat-card">
          <div className="planner-messages" aria-live="polite">
            {messages.map((message) => (
              <article className={`planner-message ${message.role}`} key={message.id}>
                <div className="planner-avatar" aria-hidden="true">{message.role === 'assistant' ? '日' : '你'}</div>
                <div className="planner-bubble">
                  <p>{message.questions?.length ? message.content.split('\n\n')[0] : message.content}</p>
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
              <article className="planner-message assistant loading" aria-label="AI 正在規劃">
                <div className="planner-avatar" aria-hidden="true">日</div>
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
                placeholder="例如：我想在十月底完成作品集，每週能投入八小時…"
                aria-label="和 AI 規劃行事曆"
                disabled={status !== 'ready'}
              />
              <button type="submit" disabled={!input.trim() || status !== 'ready'}>
                {status === 'ready' ? '送出' : '請稍候'}
              </button>
            </div>
            <small>Enter 送出 · Shift + Enter 換行。請避免輸入不必要的敏感資料。</small>
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
  const groupedTasks = proposal.tasks.reduce<Record<string, typeof proposal.tasks>>((groups, task) => {
    (groups[task.date] ??= []).push(task);
    return groups;
  }, {});

  return (
    <section className="planner-proposal" aria-label="AI 行事曆提案">
      <header><span>提案預覽</span><strong>{proposal.tasks.length} 個新任務</strong></header>
      <p>{proposal.summary}</p>
      {proposal.cycle ? (
        <div className="proposal-cycle">
          <small>NEW MACRO CYCLE</small>
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
        <small>套用只會新增內容，既有事項不會被刪除或覆蓋。</small>
        <button type="button" onClick={onApply} disabled={applied || applying}>
          {applied ? '已套用' : applying ? '正在套用…' : '確認套用到行事曆'}
        </button>
      </footer>
    </section>
  );
}

