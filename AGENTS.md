# Calendar data operations

When the user asks to read or change calendar data, use the project CLI rather than editing source files or accessing the database directly.

```bash
npm run calendar -- get YYYY-MM-DD
npm run calendar -- add YYYY-MM-DD "task"
npm run calendar -- toggle YYYY-MM-DD TASK_ID
npm run calendar -- remove YYYY-MM-DD TASK_ID
npm run calendar -- activity YYYY-MM-DD "what happened"
npm run calendar -- reflection YYYY-MM-DD "reflection"
```

For macro-cycle planning:

```bash
npm run calendar -- cycles
npm run calendar -- cycle-get CYCLE_ID
npm run calendar -- cycle-create START_DATE END_DATE "title" "goal"
npm run calendar -- phase-add CYCLE_ID START_DATE END_DATE "title" "description"
```

When breaking a macro cycle into daily tasks, read the cycle first, then read every target date before adding tasks. Preserve existing tasks, keep each day realistic, and read the dates again after writing to verify the plan.

Never display, commit, or copy values from `.env.local`. Treat calendar content as private user data.
