import type { Metadata } from 'next';
import { Geist_Mono, Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import './globals.css';

const sans = Noto_Sans_TC({ variable: '--font-noto-sans-tc', subsets: ['latin'], weight: ['400', '500', '700'] });
const serif = Noto_Serif_TC({ variable: '--font-noto-serif-tc', subsets: ['latin'], weight: ['500', '600'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '日常｜我的每日行事曆',
  description: '每天的待辦、生活紀錄與心得，都收在同一頁。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
