# Calendar data operations

When the user asks to read or change calendar data, use the project CLI rather than editing source files or accessing the database directly.

```bash
npm run calendar -- get YYYY-MM-DD
npm run calendar -- add YYYY-MM-DD "task"
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

When breaking a macro cycle into daily tasks, read the cycle and daily sections first, then read every target date before adding tasks. Preserve existing tasks, keep each day realistic, link and place new tasks when appropriate, and read the dates again after writing to verify the plan.

Store LeetCode notes in the `LeetCode 筆記` custom field, one problem per line. Do not place them in the activity note.

Never display, commit, or copy values from `.env.local`. Treat calendar content as private user data.
