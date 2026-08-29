# 日常

一天一頁的個人行事曆：[calendar.matthiola.dev](https://calendar.matthiola.dev/)

- 大週期：設定日期範圍、目標、階段與完成獎勵
- 小週期：每日待辦可綁定大週期／階段，完成後自動更新大週期進度
- 重複任務：按天、週或月重複，可用次數或日期結束
- 時間切分：自訂每日等分並拖放待辦，手機也可從編輯選單安排
- 自訂紀錄：建立 LeetCode 筆記等跨日期欄位
- 習慣設計：為任務設定觸發提示與兩分鐘起步動作
- 複製大週期的 AI 拆解指令，交給本機 agent 排入每日待辦
- Google 或帳號密碼登入
- D1 雲端同步，支援手機與桌面
- 本機 agent 指令

## 開發

需要 Node.js 22.13 以上版本。

```bash
npm install
npm run dev
```

複製 `.env.example` 至 `.env.local`。帳號密碼登入需要至少 32 字元的 `PASSWORD_PEPPER`；Google OAuth 為選用功能。請勿提交任何 `.env` 檔案。

```bash
npm run lint
npm run build
npm run db:generate # 修改 db/schema.ts 後執行
```

## 結構

```text
app/components  介面元件
app/lib         登入與 OAuth
app/api         後端路由
db              D1 schema 與遷移
scripts         本機 agent 指令
```

Agent 會先讀大週期、每日分段與既有日期，再把階段拆成可安排的每日待辦；目前不綁定任何 AI API。指令與必要環境變數請見 [`AGENTS.md`](AGENTS.md) 與 [`.env.example`](.env.example)。安全問題請依 [`SECURITY.md`](SECURITY.md) 回報。
