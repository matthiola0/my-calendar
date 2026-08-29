import type { Metadata } from 'next';
import { Geist_Mono, Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import './globals.css';
import { LanguageProvider, LanguageSwitcher } from './lib/i18n';

const sans = Noto_Sans_TC({ variable: '--font-noto-sans-tc', subsets: ['latin'], weight: ['400', '500', '700'] });
const serif = Noto_Serif_TC({ variable: '--font-noto-serif-tc', subsets: ['latin'], weight: ['500', '600'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://calendar.matthiola.dev'),
  title: 'Daybook | AI-assisted daily planning',
  description: 'Turn long-term goals into realistic daily tasks, build better habits, and reflect on each day.',
  openGraph: {
    title: 'Daybook | AI-assisted daily planning',
    description: 'Turn long-term goals into realistic daily tasks, build better habits, and reflect on each day.',
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['zh_TW', 'ja_JP'],
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Daybook daily planner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daybook | AI-assisted daily planning',
    description: 'Turn long-term goals into realistic daily tasks, build better habits, and reflect on each day.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <LanguageProvider>
          {children}
          <LanguageSwitcher />
        </LanguageProvider>
      </body>
    </html>
  );
}
