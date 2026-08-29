'use client';

import Link from 'next/link';
import { useI18n } from '../lib/i18n';

export default function PrivacyPage() {
  const { t } = useI18n();
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <Link className="brand legal-brand" href="/" aria-label={t('brandHome')}>
          <span className="brand-mark" aria-hidden="true">{t('brandMark')}</span>
          <span>
            <strong>{t('brandName')}</strong>
            <small>DAILY NOTES</small>
          </span>
        </Link>

        <p className="eyebrow">{t('privacyEyebrow')}</p>
        <h1>{t('privacyTitle')}</h1>
        <p className="legal-updated">{t('privacyUpdated')}</p>

        <section>
          <h2>{t('privacyCollectedTitle')}</h2>
          <p>{t('privacyCollectedText')}</p>
        </section>

        <section>
          <h2>{t('privacyUseTitle')}</h2>
          <p>{t('privacyUseText')}</p>
        </section>

        <section>
          <h2>{t('privacyCookiesTitle')}</h2>
          <p>{t('privacyCookiesText')}</p>
        </section>

        <section>
          <h2>{t('privacyStorageTitle')}</h2>
          <p>{t('privacyStorageText')}</p>
        </section>

        <section>
          <h2>{t('privacyAiTitle')}</h2>
          <p>{t('privacyAiText')}</p>
        </section>

        <section>
          <h2>{t('privacyChoicesTitle')}</h2>
          <p>{t('privacyChoicesText')}</p>
        </section>

        <Link className="legal-back" href="/">{t('privacyBack')}</Link>
      </article>
    </main>
  );
}
