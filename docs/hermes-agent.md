# Hermes Agent 行事曆助手

Hermes 可以使用自己的模型來讀取 Daybook、記錄行程、維護例行任務、安排工作及複盤。它透過 CLI 操作你授權的帳號，資料會與網頁同步。

## 1. 授權自己的帳號

先在 Daybook 使用 Google 或帳號密碼登入，再開啟頁首的 Agent 授權，建立一組名為 Hermes 的金鑰。金鑰只顯示一次、90 天到期，可隨時撤銷。持有者可以讀寫該帳號的行事曆，不能管理授權或操作其他帳號；不需要把 Google 密碼交給 Agent。

伺服器必須先部署包含 `/api/agent-tokens` 的版本。開發版會透過 `ensureSchema` 建立授權資料表，正式 schema migration 為 `0011_clever_jasper_sitwell.sql`。舊的伺服器環境變數 `AGENT_API_TOKEN` 仍只對應預設 `owner`，不同使用者應使用網頁建立的個人金鑰。

## 2. 在執行 Hermes 的機器安裝技能

需要 Node.js 22.13 以上，以及啟用 terminal、skills 工具的 Hermes。於這個專案目錄執行：

```bash
npm run hermes:install
```

安裝器將五個技能及獨立 CLI 放入 `$HERMES_HOME/skills`；未設定時使用 `~/.hermes/skills`。安裝後執行 CLI 不需要專案或 npm dependencies。安裝器不讀取或複製 `.env.local`、密碼、Token，也不修改 Hermes 設定檔。重複執行可更新安裝器管理的檔案；遇到手動修改會停止，保留修改後才使用 `--force` 覆蓋。

不同 profile 或自訂位置可指定：

```bash
npm run hermes:install -- --home /path/to/hermes-profile
```

重新啟動 Hermes，或使用 `/reload-skills` 更新快速指令。技能來源在 [integrations/hermes](../integrations/hermes)；請使用此安裝器，直接複製 `SKILL.md` 不會包含 CLI。

## 3. 設定連線

在 Hermes 所在機器的私密環境設定（例如該 profile 的 `~/.hermes/.env`）填入以下變數。請直接在本機安全設定，不要把金鑰貼進聊天、指令參數或公開 log。

```dotenv
CALENDAR_API_URL=https://your-daybook.example
CALENDAR_AGENT_TOKEN=<在 Daybook 建立的個人金鑰>
```

預設時區為 `Asia/Taipei`。可選用 `CALENDAR_TIMEZONE` 指定其他 IANA 時區。如果網站另外有 Sites 存取保護，另行設定 `CALENDAR_SITES_BYPASS_TOKEN`；一般網站不需要。

技能宣告的兩個必要變數會由 Hermes 傳入 terminal sandbox。若使用其他選用變數，請合併至 Hermes 既有的 `config.yaml` 設定，保留原本清單：

```yaml
terminal:
  env_passthrough:
    - CALENDAR_TIMEZONE
    - CALENDAR_SITES_BYPASS_TOKEN
```

若 Hermes 使用 Docker、遠端 terminal 或 WSL，Node 與技能需存在於實際執行的環境。CLI 僅接受 HTTPS，另允許 localhost HTTP 供開發測試，且拒絕重新導向以保護金鑰。

## 快速指令

| Hermes 指令 | 行為 |
| --- | --- |
| `/daybook-today` | 今天的行程、例行公事、待辦與完成數 |
| `/daybook-plan 幫我安排今天` | 讀取原有行程與工作量，再安排並記錄新增工作 |
| `/daybook-plan 建議下週怎麼安排` | 提出建議，尚不寫入 |
| `/daybook-review` | 根據當天實際紀錄開始複盤 |
| `/daybook-review 今天讀書容易分心，明天先讀 20 分鐘` | 追加心得，保留原本紀錄 |
| `/daybook-status day` | 今日完成狀況 |
| `/daybook-status week` | 本週完成狀況，週一至週日 |
| `/daybook-status month` | 本月完成狀況 |
| `/daybook 明天 14:00–15:00 看牙醫，幫我記起來` | 記錄指定行程，避免同日相同文字重複新增 |
| `/daybook 每週一早上七點跑步，先安排接下來十二週` | 建立有限次數的例行任務 |

也可以直接說「今天要做什麼」「幫我安排」「開始複盤」「這週做完多少」，由 Hermes 選用技能。快速指令屬於 Hermes，Daybook 網頁的內建 AI 對話維持原有操作。

## 記錄與規劃原則

- 例行公事使用 Daybook 的重複任務，跨對話仍以行事曆資料為準。一次最多建立 365 次；沒有結束日的例行公事，Hermes 會先與你確定安排期限，不會宣稱永久自動延續。
- 規劃先讀取目標日期、每日分段與進行中的大週期，保留既有行程。任務數量只作為工作量參考；若缺少時長或可用時間，會說明假設或詢問，不會把空白日期視為整天有空。
- 固定時間目前保留在任務文字中，尚無獨立起訖時間或自動衝突偵測欄位。你提供的時間與長度會一併寫入，例如「14:00–15:00 看牙醫」。
- 日／週／月統計依實際勾選計算，另列例行任務；沒有任務時完成率為空值。完整週／月包含未來安排，呈現時會與截至今天的結果區分，未來工作不算逾期。
- 複盤追加既有心得，只有你回報完成才更新勾選。LeetCode 筆記使用 attempt records。查詢與規劃 context 本身不寫入資料。
- 新增後重新讀取確認；遇到並行修改會停止該次寫入，重新讀取後再處理，不會覆蓋其他裝置剛存的資料。

## CLI 與驗證

在專案內可沿用 `npm run calendar -- …`；完整既有指令見 [AGENTS.md](../AGENTS.md)。新指令的回傳為 JSON：

```bash
npm run calendar -- help
npm run calendar -- today
npm run calendar -- agenda 2026-10-15 2026-10-21
npm run calendar -- plan 2026-10-15 2026-10-21
npm run calendar -- summary week 2026-10-15
npm run calendar -- review 2026-10-15
npm run calendar -- review 2026-10-15 "今天完成了什麼、卡在哪裡"
npm run calendar -- record 2026-10-16 "14:00–15:00 看牙醫"
npm run calendar -- done 2026-10-16 TASK_ID true
```

`plan` 回傳讀取到的 context，不自行呼叫模型或寫入提案；實際安排由 Hermes 按照你的指示完成。`agenda`／`plan` 每次最多查 31 天。`done` 重複執行維持同一狀態；`record` 只去除同一天、正規化後完全相同的任務文字，語意近似仍由 Agent 判斷。

開發驗證：

```bash
npm run test:agent
npm run lint
npm run build
```

測試使用記憶體資料庫與本機 mock API，不讀取真實帳號或行事曆。

格式與設定方式依據 Hermes 官方的 [Skills System](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md) 與 [Creating Skills](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/creating-skills.md)。
