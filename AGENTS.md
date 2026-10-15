# Calendar data operations

When the user asks to read or change calendar data, use the project CLI rather than editing source files or accessing the database directly.

For agent workflows (dates default to `CALENDAR_TIMEZONE`, or `Asia/Taipei`):

```bash
npm run calendar -- today [YYYY-MM-DD]
npm run calendar -- agenda [START_DATE] [END_DATE]
npm run calendar -- plan [START_DATE] [END_DATE]
npm run calendar -- summary day|week|month [YYYY-MM-DD]
npm run calendar -- review [YYYY-MM-DD] ["reflection to append"]
npm run calendar -- record YYYY-MM-DD "task"
npm run calendar -- done YYYY-MM-DD TASK_ID [true|false]
```

`today`, `agenda`, `plan`, `summary`, and `review` without text are read-only. `plan` returns workload context for the agent to plan with; it does not write a plan. `record` avoids identical normalized task text on the same date; `done` sets an explicit state instead of toggling it. `review` with text appends to existing reflection. Agenda/plan ranges are at most 31 days. Weeks begin Monday; full-period counts include future dates, so distinguish elapsed completion from future scheduled tasks.

Hermes setup and quick commands are documented in [docs/hermes-agent.md](docs/hermes-agent.md). Install portable skills with `npm run hermes:install`; use a personal token created in the signed-in account's Agent access panel. The legacy server token only accesses the default owner. Never request credentials in chat.

```bash
npm run calendar -- get YYYY-MM-DD
npm run calendar -- add YYYY-MM-DD "task"
npm run calendar -- short YYYY-MM-DD "task" END_DATE
npm run calendar -- repeat YYYY-MM-DD "task" day|week|month INTERVAL count|date COUNT|END_DATE
npm run calendar -- toggle YYYY-MM-DD TASK_ID
npm run calendar -- remove YYYY-MM-DD TASK_ID
npm run calendar -- link YYYY-MM-DD TASK_ID CYCLE_ID [PHASE_ID]
npm run calendar -- unlink YYYY-MM-DD TASK_ID
npm run calendar -- move YYYY-MM-DD TASK_ID SECTION_ID|none
npm run calendar -- habit YYYY-MM-DD TASK_ID "cue" "two-minute start" "identity"
npm run calendar -- series-update YYYY-MM-DD TASK_ID "task" "cue" "two-minute start" "identity"
npm run calendar -- series-remove YYYY-MM-DD TASK_ID
npm run calendar -- activity YYYY-MM-DD "what happened"
npm run calendar -- reflection YYYY-MM-DD "reflection"
```

For macro-cycle planning:

```bash
npm run calendar -- cycles
npm run calendar -- cycle-get CYCLE_ID
npm run calendar -- cycle-create START_DATE END_DATE "title" "goal"
npm run calendar -- phase-add CYCLE_ID START_DATE END_DATE "title" "description"
npm run calendar -- cycle-reward CYCLE_ID "reward"
```

For daily sections and custom records:

```bash
npm run calendar -- sections
npm run calendar -- sections-set "morning" "afternoon" "evening"
npm run calendar -- fields YYYY-MM-DD
npm run calendar -- field-add "title"
npm run calendar -- field-write YYYY-MM-DD FIELD_ID "content"
```

For LeetCode planning and attempt history:

```bash
npm run calendar -- leetcode
npm run calendar -- leetcode-lists
npm run calendar -- leetcode-list-add "title"
npm run calendar -- leetcode-list-assign PROBLEM_ID LIST_ID|none
npm run calendar -- leetcode-list-order LIST_ID PROBLEM_ID...
npm run calendar -- leetcode-add YYYY-MM-DD easy|medium|hard "title" [URL]
npm run calendar -- leetcode-schedule PROBLEM_ID YYYY-MM-DD
npm run calendar -- leetcode-attempt PROBLEM_ID YYYY-MM-DD stuck|hinted|solved|reviewed "notes" [TASK_ID]
```

When breaking a macro cycle into daily tasks, read the cycle and daily sections first, then read every target date before adding tasks. Preserve existing tasks, keep each day realistic, link and place new tasks when appropriate, and read the dates again after writing to verify the plan.

Store LeetCode notes as attempt records. Do not place them in the activity note or a custom field.

Never display, commit, or copy values from `.env.local`. Treat calendar content as private user data.
