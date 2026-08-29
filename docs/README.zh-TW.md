<div align="center">

# 日常 Daybook

### 把遠方的目標，拆成今天做得到的一小步。

一個結合 AI 規劃、大週期、每日習慣與反思的個人行事曆。

[開始使用](https://calendar.matthiola.dev/) · [AI 規劃說明](ai-planner.md) · [安全問題回報](../SECURITY.md)

[English](../README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

</div>

![Daybook AI 規劃器將目標拆成大週期與每日任務](images/ai-planner-demo.png)

## 為什麼是 Daybook？

一般待辦清單從「今天要做什麼？」開始；Daybook 會先問：「我想改變什麼，而現在最小、最有用的行動是什麼？」

先設定有期限的大週期與成果，拆成階段，再把每日任務連回同一個方向。內建 AI 只讀取必要日期、保留既有安排，先產生可檢查的提案；得到你的確認後才會寫入。

## 特色

| 從想法出發 | 落到每天 | 持續學習 |
| --- | --- | --- |
| 大週期、成果、階段、日期與完成獎勵 | AI 任務、重複排程、每日分段與兩分鐘起步 | 進度條、連續紀錄、生活紀錄、心得與自訂欄位 |

- **有確認步驟的 AI 規劃**：用英文、繁體中文或日文對話，先預覽大週期與每日任務，再決定是否套用。
- **大週期與小週期連動**：把每日任務綁定目標或階段，大週期進度會自動更新。
- **能切分的一天**：自訂一天的專注區段，電腦可拖曳，手機可從任務編輯選擇時段。
- **實用的重複規則**：按天、週或月重複，設定次數或截止日，也能只改一次或整個系列。
- **習慣設計**：記下想成為的身份、開始提示，以及狀態不好時也做得到的兩分鐘版本。
- **不只有打勾**：紀錄今天做了什麼、寫下心得，或建立 LeetCode 筆記等每日自訂欄位。
- **帳號隔離與跨裝置同步**：支援 Google 或帳號密碼登入，每個帳號的內容彼此獨立。
- **Agent 可操作**：授權後，本機 coding agent 可透過 CLI 讀寫同一份行事曆，不需直接接觸資料庫。

## 受到《原子習慣》啟發

Daybook 將 James Clear 習慣方法中的幾個概念變成可操作的規劃欄位：

- 先定義想成為的身份，而不只寫結果；
- 明確記錄行動的觸發提示；
- 用兩分鐘起步降低開始阻力；
- 讓進度看得見，錯過一次後盡快回到節奏。

可閱讀官方的[《原子習慣》摘要](https://jamesclear.com/atomic-habits-summary)與[書籍介紹](https://jamesclear.com/atomic-habits)。Daybook 是獨立開源專案，與 James Clear 無合作或隸屬關係。

## AI 規劃器

你可以請 Daybook 建立大週期、把目前階段拆成每日任務、檢查是否過載、設計習慣，或依實際進度調整接下來兩週。

1. 只選取這次問題需要的日期範圍。
2. 伺服器讀取範圍內既有任務、大週期、階段與每日分段。
3. 模型回傳結構化提案，不直接寫資料庫。
4. Daybook 再驗證日期、數量、連結與重複內容。
5. 由你檢查並決定是否套用。

套用只會新增，不會刪除或覆蓋原本內容。設定、限制、資料流程與範例請見 [AI 規劃說明](ai-planner.md)。

## 開始開發

需要 Node.js 22.13 以上版本。

```bash
git clone https://github.com/matthiola0/my-calendar.git
cd my-calendar
npm install
cp .env.example .env.local
npm run dev
```

帳號密碼登入需要至少 32 個隨機字元的 `PASSWORD_PEPPER`。Google OAuth 與網頁 AI 規劃是選用功能；AI 規劃需要伺服器端 `GROQ_API_KEY`。不要提交任何 `.env` 檔案。

```bash
npm run lint
npm run build
npm run db:generate # 只有修改 db/schema.ts 時需要
```

## 專案結構

```text
app/components  UI 與前端互動
app/lib         登入、i18n、行事曆與 LLM 規劃邏輯
app/api         需要驗證身分的後端路由
db              D1 schema 與 migrations
docs            專案文件
scripts         本機行事曆 agent CLI
```

完整 agent 指令見 [AGENTS.md](../AGENTS.md)。行事曆內容屬於私密資料，請勿放進公開 log、issue、截圖或 commit。

## 參與貢獻

歡迎提出 issue 或 pull request。請保持修改範圍清楚、維持帳號資料隔離，並附上 lint、build 或手動驗證結果。安全問題請依 [SECURITY.md](../SECURITY.md) 私下回報。
