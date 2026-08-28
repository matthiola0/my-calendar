# 日常

一天一頁的個人行事曆：[calendar.matthiola.dev](https://calendar.matthiola.dev/)

- 大週期：設定日期範圍、目標與階段
- 小週期：每日待辦、完成進度、活動紀錄與心得
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

Agent 會先讀大週期與既有日期，再把階段拆成每日待辦；目前不綁定任何 AI API。指令與必要環境變數請見 [`AGENTS.md`](AGENTS.md) 與 [`.env.example`](.env.example)。安全問題請依 [`SECURITY.md`](SECURITY.md) 回報。
