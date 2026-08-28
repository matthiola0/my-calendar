# 日常｜我的每日行事曆

一個以「一天一頁」為概念的私人網頁行事曆。

- 依日期新增、完成與刪除待辦事項
- 自動計算當日完成進度
- 記錄今天做了哪些事與今日心得
- 使用雲端 D1 資料庫跨裝置同步
- 以 ChatGPT 帳號登入保護私人內容
- 支援手機與桌面版面
- 提供受保護的本地 agent 管理指令

## 在本機執行

需要 Node.js 22.13 以上版本。

```bash
npm install
npm run dev
```

開啟終端機顯示的網址；本機登入流程會使用 Sites 提供的模擬使用者。

## 資料庫

修改 `db/schema.ts` 後產生遷移：

```bash
npm run db:generate
```

## 本地 agent 操作

本機的 `.env.local` 保存兩組不會提交至 GitHub 的金鑰。agent 可透過以下指令讀寫正式網站的同一份資料：

```bash
npm run calendar -- get 2026-08-28
npm run calendar -- add 2026-08-28 "整理明天的工作"
npm run calendar -- activity 2026-08-28 "完成網站設定"
npm run calendar -- reflection 2026-08-28 "今天的進度很踏實"
```

完整指令請參考 `AGENTS.md`。

## 正式建置

```bash
npm run build
```
