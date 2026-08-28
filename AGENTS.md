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

Read the relevant date before modifying an existing task so you have its ID. Never display, commit, or copy values from `.env.local`. Treat calendar content as private user data.
