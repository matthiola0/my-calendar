# 日常

一天一頁的個人行事曆：[calendar.matthiola.dev](https://calendar.matthiola.dev/)

- 大週期：設定日期範圍、目標、階段與完成獎勵
- 小週期：每日待辦可綁定大週期／階段，完成後自動更新大週期進度
- 重複任務：按天、週或月重複，可整批修改或刪除
- 時間切分：自訂每日等分並拖放待辦，手機也可從編輯選單安排
- 自訂紀錄：建立 LeetCode 筆記等跨日期欄位
- 習慣設計：身份、觸發提示、兩分鐘起步、連續完成與避免連續錯過提醒
- AI 規劃：在網頁對話中取得大／小週期建議，預覽後直接套用到行事曆
- Google 或帳號密碼登入
- D1 雲端同步，支援手機與桌面
- 本機 agent 指令

## 開發

需要 Node.js 22.13 以上版本。

```bash
npm install
npm run dev
```

複製 `.env.example` 至 `.env.local`。帳號密碼登入需要至少 32 字元的 `PASSWORD_PEPPER`；Google OAuth 為選用功能。網頁 AI 規劃需要伺服器端 `GROQ_API_KEY`，預設模型是 `qwen/qwen3.8-27b`。請勿提交任何 `.env` 檔案。

```bash
npm run lint
npm run build
npm run db:generate # 修改 db/schema.ts 後執行
```

## 結構

```text
app/components  介面元件
app/lib         登入、LLM 與行事曆規劃邏輯
app/api         後端路由
db              D1 schema 與遷移
scripts         本機 agent 指令
```

網頁 AI 只讀取規劃需要的日期、大週期與每日分段，產生的提案必須由使用者確認才會寫入；套用時只新增內容，不會刪除或覆蓋既有事項。設定、限制、建議問法與資料流程請見 [`docs/ai-planner.md`](docs/ai-planner.md)。本機 agent 指令與必要環境變數請見 [`AGENTS.md`](AGENTS.md) 與 [`.env.example`](.env.example)。安全問題請依 [`SECURITY.md`](SECURITY.md) 回報。
