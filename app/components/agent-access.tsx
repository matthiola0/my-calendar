'use client';

import { FormEvent, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import type { AgentTokenMetadata } from '../lib/agent-access';

const quickCommands = [
  ['/daybook-today', 'agentCommandToday'],
  ['/daybook-plan', 'agentCommandPlan'],
  ['/daybook-review', 'agentCommandReview'],
  ['/daybook-status day|week|month', 'agentCommandStatus'],
  ['/daybook', 'agentCommandNatural'],
] as const;

export default function AgentAccess() {
  const { locale, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const secretRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [tokens, setTokens] = useState<AgentTokenMetadata[]>([]);
  const [name, setName] = useState('Hermes');
  const [secret, setSecret] = useState('');
  const [secretTokenId, setSecretTokenId] = useState('');
  const [origin, setOrigin] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  async function openDialog() {
    if (dialogRef.current?.open) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setSecret('');
    setSecretTokenId('');
    setCopyMessage('');
    setError('');
    setTokens([]);
    setPending(null);
    setLoading(true);
    setOrigin(window.location.origin);
    dialogRef.current?.showModal();
    try {
      const response = await fetch('/api/agent-tokens', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error();
      const result = await response.json() as { tokens: AgentTokenMetadata[] };
      if (!controller.signal.aborted) setTokens(result.tokens);
    } catch {
      if (!controller.signal.aborted) setError(t('agentLoadError'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function clearDialog() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSecret('');
    setSecretTokenId('');
    setCopyMessage('');
    setError('');
  }

  function closeDialog() {
    clearDialog();
    dialogRef.current?.close();
  }

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller = controllerRef.current;
    if (!name.trim() || pending || loading || secret || !controller) return;
    setPending('create');
    setError('');
    try {
      const response = await fetch('/api/agent-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
        signal: controller.signal,
      });
      if (response.status === 409) {
        if (!controller.signal.aborted) setError(t('agentLimitError'));
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json() as AgentTokenMetadata & { token: string };
      if (!controller.signal.aborted) {
        setSecret(result.token);
        setSecretTokenId(result.id);
        setCopyMessage('');
        setTokens((current) => [{ id: result.id, name: result.name, createdAt: result.createdAt, expiresAt: result.expiresAt }, ...current]);
      }
    } catch {
      if (!controller.signal.aborted) setError(t('agentCreateError'));
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function revokeToken(id: string) {
    const controller = controllerRef.current;
    if (pending || !controller) return;
    setPending(id);
    setError('');
    try {
      const response = await fetch('/api/agent-tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      if (!controller.signal.aborted) {
        setTokens((current) => current.filter((token) => token.id !== id));
        if (id === secretTokenId) {
          setSecret('');
          setSecretTokenId('');
          setCopyMessage('');
        }
      }
    } catch {
      if (!controller.signal.aborted) setError(t('agentRevokeError'));
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function copyToken() {
    const controller = controllerRef.current;
    secretRef.current?.focus();
    secretRef.current?.select();
    try {
      await navigator.clipboard.writeText(secret);
      if (controller && !controller.signal.aborted) setCopyMessage(t('agentCopied'));
    } catch {
      if (controller && !controller.signal.aborted) setCopyMessage(t('agentCopyFallback'));
    }
  }

  function formatDate(value: number) {
    return new Date(value).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <>
      <button className="agent-access-trigger" type="button" onClick={() => void openDialog()} aria-haspopup="dialog">{t('agentAccess')}</button>
      <dialog className="agent-access-dialog" ref={dialogRef} aria-labelledby="agent-access-title" aria-describedby="agent-access-description" onClose={clearDialog}>
        <div className="agent-access-heading">
          <div><p className="eyebrow">HERMES AGENT</p><h2 id="agent-access-title">{t('agentAccessTitle')}</h2></div>
          <button className="agent-access-close" type="button" onClick={closeDialog} aria-label={t('agentClose')}>×</button>
        </div>
        <p className="agent-access-description" id="agent-access-description">{t('agentAccessDescription')}</p>

        <section className="agent-access-section" aria-labelledby="agent-create-title">
          <h3 id="agent-create-title">{t('agentCreateTitle')}</h3>
          <form className="agent-access-form" onSubmit={(event) => void createToken(event)}>
            <label htmlFor="agent-token-name">{t('agentTokenName')}<input id="agent-token-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoComplete="off" disabled={Boolean(pending) || Boolean(secret)} /></label>
            <button className="agent-access-primary" type="submit" disabled={loading || Boolean(pending) || Boolean(secret) || !name.trim()}>{pending === 'create' ? t('saving') : t('agentCreate')}</button>
          </form>
          <p className="agent-access-hint">{t('agentExpiryHint')}</p>
          {secret && <div className="agent-access-secret">
            <label htmlFor="agent-token-secret">{t('agentSecretOnce')}</label>
            <textarea id="agent-token-secret" ref={secretRef} value={secret} readOnly autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" onClick={() => void copyToken()}>{t('agentCopy')}</button>
            {copyMessage && <p role="status">{copyMessage}</p>}
          </div>}
        </section>

        <section className="agent-access-section" aria-labelledby="agent-setup-title">
          <h3 id="agent-setup-title">{t('agentSetupTitle')}</h3>
          <p className="agent-access-hint">{t('agentInstallHint')}</p>
          <pre className="agent-access-config"><code>npm run hermes:install</code></pre>
          <p className="agent-access-hint">{t('agentSetupHint')}</p>
          <pre className="agent-access-config"><code>{`CALENDAR_API_URL=${origin}\nCALENDAR_AGENT_TOKEN=<${t('agentTokenPlaceholder')}>`}</code></pre>
          <p className="agent-access-hint">{t('agentSkillRequired')}</p>
          <div className="agent-access-commands"><table>
            <caption>{t('agentCommandsTitle')}</caption>
            <thead><tr><th scope="col">{t('agentCommandLabel')}</th><th scope="col">{t('agentCommandPurpose')}</th></tr></thead>
            <tbody>{quickCommands.map(([command, key]) => <tr key={command}><td><code>{command}</code></td><td>{t(key)}</td></tr>)}</tbody>
          </table></div>
        </section>

        <section className="agent-access-section" aria-labelledby="agent-tokens-title" aria-busy={loading}>
          <h3 id="agent-tokens-title">{t('agentTokensTitle')}</h3>
          {loading ? <p className="agent-access-hint" role="status">{t('agentLoading')}</p> : tokens.length ? <ul className="agent-access-tokens">{tokens.map((token) => <li key={token.id}>
            <div><strong>{token.name}</strong><small>{t('agentCreatedAt')} <time dateTime={new Date(token.createdAt).toISOString()}>{formatDate(token.createdAt)}</time> · {t('agentExpiresAt')} <time dateTime={new Date(token.expiresAt).toISOString()}>{formatDate(token.expiresAt)}</time></small></div>
            <button type="button" disabled={Boolean(pending)} onClick={() => void revokeToken(token.id)} aria-label={t('agentRevokeNamed', { name: token.name })}>{pending === token.id ? t('saving') : t('agentRevoke')}</button>
          </li>)}</ul> : <p className="agent-access-hint">{t('agentNoTokens')}</p>}
        </section>
        {error && <p className="agent-access-error" role="alert">{error}</p>}
      </dialog>
    </>
  );
}
