import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '隱私權政策｜日常',
  description: '日常行事曆如何處理登入資訊與個人內容。',
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <Link className="brand legal-brand" href="/" aria-label="返回日常首頁">
          <span className="brand-mark" aria-hidden="true">日</span>
          <span>
            <strong>日常</strong>
            <small>DAILY NOTES</small>
          </span>
        </Link>

        <p className="eyebrow">PRIVACY POLICY</p>
        <h1>隱私權政策</h1>
        <p className="legal-updated">最後更新：2026 年 8 月 28 日</p>

        <section>
          <h2>我們收集哪些資料</h2>
          <p>
            為了提供登入與跨裝置同步功能，日常會處理你的帳號識別資訊，例如 Google
            提供的使用者識別碼、電子郵件與顯示名稱，或你自行註冊的帳號及經雜湊處理的密碼。
            我們也會保存你主動輸入的待辦、生活紀錄與心得。
          </p>
        </section>

        <section>
          <h2>資料如何使用</h2>
          <p>
            這些資料只用於驗證身分、顯示你的個人行事曆、在不同裝置同步內容，以及維護服務安全。
            每個帳號的內容彼此分開，不會公開給其他使用者。
          </p>
        </section>

        <section>
          <h2>登入與 Cookie</h2>
          <p>
            登入後，網站會使用安全的 HttpOnly Session Cookie 維持登入狀態。使用 Google 登入時，
            網站只取得完成登入所需的基本個人資料，不會保存 Google access token，也不會存取你的
            Google 行事曆、雲端硬碟或其他 Google 內容。
          </p>
        </section>

        <section>
          <h2>儲存與分享</h2>
          <p>
            資料儲存在網站的受管資料庫中，並由提供網站執行、資料儲存與登入所需的基礎設施服務商處理。
            我們不出售個人資料，也不將行事曆內容用於廣告。
          </p>
        </section>

        <section>
          <h2>你的選擇</h2>
          <p>
            你可以停止使用本服務，或透過 Google OAuth 同意畫面所列的支援聯絡方式，要求查詢或刪除帳號與內容。
          </p>
        </section>

        <Link className="legal-back" href="/">返回日常</Link>
      </article>
    </main>
  );
}
