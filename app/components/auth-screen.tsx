'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../lib/i18n';

type Mode = 'login' | 'register';

export default function AuthScreen({ googleEnabled }: { googleEnabled: boolean }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError(t('authPasswordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      await response.json();
      if (!response.ok) {
        setError(response.status === 409
          ? t('authTaken')
          : response.status === 401
            ? t('authCredentials')
            : response.status === 400
              ? t('authInvalidFormat')
              : t('authUnavailable'));
        return;
      }
      window.location.replace('/');
    } catch {
      setError(t('authNetworkError'));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <Link className="brand auth-brand" href="/" aria-label={t('brandHome')}>
          <span className="brand-mark" aria-hidden="true">{t('brandMark')}</span>
          <span>
            <strong>{t('brandName')}</strong>
            <small>DAILY NOTES</small>
          </span>
        </Link>
        <div>
          <p className="eyebrow">{t('authEyebrow')}</p>
          <h1>{t('authHeadline1')}<br />{t('authHeadline2')}</h1>
          <p className="auth-description">
            {t('authDescription')}
          </p>
        </div>
        <p className="auth-footnote">{t('authFootnote')}</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label={t('authTabsLabel')}>
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>{t('authLogin')}</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>{t('authRegister')}</button>
          </div>

          <div className="auth-heading">
            <p className="section-number">WELCOME</p>
            <h2 id="auth-title">{mode === 'login' ? t('authWelcome') : t('authCreateTitle')}</h2>
            <p>{mode === 'login' ? t('authLoginDescription') : t('authRegisterDescription')}</p>
          </div>

          {googleEnabled && (
            <a className="google-login" href="/api/auth/google">
              <span aria-hidden="true">G</span>
              {t('authGoogle')}
            </a>
          )}

          <div className="auth-divider"><span>{t('authDivider')}</span></div>

          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>{t('authUsername')}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_.-]+"
                placeholder={t('authUsernamePlaceholder')}
                required
              />
            </label>
            <label>
              <span>{t('authPassword')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={10}
                maxLength={128}
                placeholder={t('authPasswordPlaceholder')}
                required
              />
            </label>
            {mode === 'register' && (
              <label>
                <span>{t('authConfirmPassword')}</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  placeholder={t('authConfirmPlaceholder')}
                  required
                />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? t('authPleaseWait') : mode === 'login' ? t('authLoginButton') : t('authRegisterButton')}
            </button>
          </form>

          <p className="auth-privacy">
            {t('authPrivacy1')}<br />
            <Link href="/privacy">{t('authPrivacyLink')}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
