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

重新啟動 Hermes，或使用 `/reload-skills` 更新技能清單。Discord 透過 `/skill` 的 `name` 欄位選取技能，詳見下方用法。技能來源在 [integrations/hermes](../integrations/hermes)；請使用此安裝器，直接複製 `SKILL.md` 不會包含 CLI。

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

### Discord 直接指令

安裝原生 Discord 快速指令外掛，讓 `/daybook-*` 直接出現在選單：

```bash
npm run hermes:install -- --home /path/to/hermes-profile --discord
hermes config set plugins.entries.daybook-shortcuts.allow_gateway_injection true
hermes plugins enable daybook-shortcuts
hermes gateway restart
```

請對同一個 Hermes profile 執行以上步驟。安裝器僅放入技能、CLI 與外掛，不讀取憑證或改寫設定；後續 Hermes 指令啟用該外掛、允許它把使用者點選的指令交給同一個 Discord 對話處理，並重新同步原生指令。既有 Discord 使用者與指令授權仍適用。

此外掛目前支援 `plugins.isolation: in_process`；請用 `hermes config get plugins.isolation` 確認。`host` 模式尚未傳遞指令呼叫的對話 context，外掛會拒絕執行；安裝器不變更隔離模式。

外掛使用目前 Hermes 的技能展開與對話 context API。更新 Hermes 後，可使用其 Python runtime 執行 `python scripts/test-hermes-shortcuts.py /path/to/hermes-agent` 驗證相容性；測試在臨時 profile 執行，不傳送 Discord 訊息或操作真實行事曆。

| Discord 指令 | 行為 |
| --- | --- |
| `/daybook-today` | 唯讀查詢今天的行程、例行公事與待辦 |
| `/daybook-plan` | 安排並儲存今天，依目前 LeetCode 規則選題 |
| `/daybook-plan`，`args: 建議下週怎麼安排` | 只提出建議，尚不寫入 |
| `/daybook-review` | 開始複盤；`args` 可填入要記錄的心得 |
| `/daybook-status` | 今日完成狀況；`args` 可填 `week` 或 `month` |
| `/daybook` | 顯示用法；`args` 可填入要記錄的行程或其他操作 |

有補充指示時填入 Discord 的可選 `args` 欄位。外掛只轉交既有技能，使用原來的連線與規劃流程，不直接讀寫行事曆、不建立自動排程，也不會另外開一個對話。更新技能後仍使用最新版內容。

### 未安裝外掛的 Discord 用法

也可以輸入 `/skill`，在 `name` 欄位輸入 `daybook`，再選擇技能；需要補充指示時填入 `args`。沒有安裝上方外掛時，Hermes 將技能集中於 `/skill`。空白搜尋只顯示部分技能，請輸入 `daybook` 篩選。

| 操作 | `name` | `args` |
| --- | --- | --- |
| 今天要做什麼 | `daybook-today` | 留空 |
| 安排今天 | `daybook-plan` | `幫我安排今天` |
| 只看安排建議 | `daybook-plan` | `建議下週怎麼安排` |
| 開始複盤 | `daybook-review` | 留空或填入心得 |
| 今日／本週／本月完成狀況 | `daybook-status` | `day`／`week`／`month` |
| 記錄行程或修改例行公事 | `daybook` | 填入日期、行程或修改指示 |

例如選取 `/skill`，填入 `name: daybook-plan`、`args: 幫我安排今天`。若找不到新技能，在同一個 Discord bot 執行 `/reload-skills` 後重新搜尋；若連 `/skill` 都沒有，檢查該 bot 的 gateway 與 Discord 指令同步狀態。

### Hermes 終端機

Hermes 傳統終端機可直接使用以下技能名稱。啟用 `daybook-shortcuts` 外掛後仍沿用技能原本的行為：單獨 `/daybook-plan` 只提供今天的建議；要儲存請明確附上安排指示。此外掛的 gateway 快速指令僅支援 Discord；其他聊天平台會拒絕執行。

| Hermes 終端機指令 | 行為 |
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

### 依清單安排 LeetCode

可為 Hermes profile 保存主線與複習清單的完整順序及使用者確認的起始進度；目前每日題數固定為主線 2 題、複習 1 題。`leetcode-policy set /absolute/path/to/course.json` 僅保存初始設定；相同設定可重複匯入，CLI 尚不支援替換既有設定或重設進度。`leetcode-next [DATE]` 只預覽；只有明確要求安排時才執行 `leetcode-plan DATE`，將當天的主線及複習題存為一般待辦。同一天重複安排會沿用已選題目，不會再補一批，刪除的安排也不會自動重建。

設定與選題紀錄保存在 `$HERMES_HOME/data/daybook`，與技能檔分開，更新技能時會保留；從專案執行時請設定正確的 `HERMES_HOME`。個人清單與進度不可寫入原始碼或提交版本控制。清單不同角色以同一 LeetCode 題目紀錄共用作答歷史，不因清單重疊而複製題庫。進度依本次安排後真正回報的 `solved`／`reviewed` 推進；預排、勾選或舊的解題紀錄都不等同本輪完成。

目前設定以 API URL 與 Agent Token 的組合雜湊綁定連線；即使仍使用同一帳號，換網址或輪替 Token 後也會拒絕沿用既有設定與選題紀錄。CLI 尚未提供遷移指令，請先檢查原連線與進度，再另行處理遷移；不要刪除紀錄、重新匯入或假設它會自動重設。

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
npm run calendar -- rename 2026-10-16 TASK_ID "meeting"
npm run calendar -- detach 2026-10-16 TASK_ID
npm run calendar -- reschedule 2026-10-16 TASK_ID 2026-10-17 "20:30–21:30 進度報告準備"
```

`plan` 回傳讀取到的 context，不自行呼叫模型或寫入提案；實際安排由 Hermes 按照你的指示完成。`agenda`／`plan` 每次最多查 31 天。`done` 重複執行維持同一狀態；`record` 只去除同一天、正規化後完全相同的任務文字，語意近似仍由 Agent 判斷。

`rename` 只改指定日期的一次項目；`detach` 保留原待辦與資料，只解除它的重複系列，帶截止日的短週期項目不適用。兩個指令重複執行相同修改不會再次寫入。`unlink` 解除的是大週期關聯，`move` 變更的是每日分段；整組系列指令則會影響歷史。

`reschedule` 將一次項目移至不同日期，可同時改文字，並保留完成狀態、分段、週期與習慣欄位。它先用新 ID 儲存並核對目標副本，再重新確認來源項目未變，才移除來源，最後讀回兩日。帶截止日或 LeetCode 關聯的任務會拒絕移日，避免截止與歷史連結歧義。兩日儲存並非原子操作；若途中停止，錯誤會提供目標日期與新 ID。先讀取兩日並核對副本，再決定下一步，不要直接重跑移日指令。

若目標日已有相同重複系列的項目，移日也會拒絕執行；只有使用者確定要將來源改為獨立待辦時，才先 `detach` 再移日。伺服器 5xx 或連線失敗也可能留下已儲存的副本，仍須讀回兩日確認，不能直接重試。

開發驗證：

```bash
npm run test:agent
npm run lint
npm run build
```

測試使用記憶體資料庫與本機 mock API，不讀取真實帳號或行事曆。

格式與設定方式依據 Hermes 官方的 [Skills System](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md) 與 [Creating Skills](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/creating-skills.md)。
