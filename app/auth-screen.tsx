'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type Mode = 'login' | 'register';

export default function AuthScreen() {
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
      setError('兩次輸入的密碼不一致。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? '暫時無法登入，請稍後再試。');
        return;
      }
      window.location.replace('/');
    } catch {
      setError('連線失敗，請檢查網路後再試。');
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
        <Link className="brand auth-brand" href="/" aria-label="日常首頁">
          <span className="brand-mark" aria-hidden="true">日</span>
          <span>
            <strong>日常</strong>
            <small>DAILY NOTES</small>
          </span>
        </Link>
        <div>
          <p className="eyebrow">一天一頁 · 只屬於你的空間</p>
          <h1>把待辦、生活與心情，<br />好好收進每一天。</h1>
          <p className="auth-description">
            無論用手機或電腦，登入後都能回到自己的行事曆。每個帳號的內容彼此獨立。
          </p>
        </div>
        <p className="auth-footnote">PRIVATE BY ACCOUNT · SYNCED ACROSS DEVICES</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="登入或註冊">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>登入</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>註冊</button>
          </div>

          <div className="auth-heading">
            <p className="section-number">WELCOME</p>
            <h2 id="auth-title">{mode === 'login' ? '歡迎回來' : '建立你的日常'}</h2>
            <p>{mode === 'login' ? '選擇一種方式，繼續寫今天這一頁。' : '註冊後即可在不同裝置同步你的內容。'}</p>
          </div>

          <a className="chatgpt-login" href="/signin-with-chatgpt?return_to=/">
            <span aria-hidden="true">✦</span>
            使用 ChatGPT 登入
          </a>

          <div className="auth-divider"><span>或使用帳號密碼</span></div>

          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>帳號</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_.-]+"
                placeholder="3–30 個英數字、_ 或 -"
                required
              />
            </label>
            <label>
              <span>密碼</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={10}
                maxLength={128}
                placeholder="至少 10 個字元"
                required
              />
            </label>
            {mode === 'register' && (
              <label>
                <span>確認密碼</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  placeholder="再輸入一次密碼"
                  required
                />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? '請稍候…' : mode === 'login' ? '登入我的行事曆' : '註冊並開始使用'}
            </button>
          </form>

          <p className="auth-privacy">你的待辦、紀錄與心得不會與其他使用者共用。</p>
        </div>
      </section>
    </main>
  );
}
