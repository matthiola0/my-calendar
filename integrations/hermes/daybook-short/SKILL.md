---
name: daybook-short
description: List unfinished Daybook short-term tasks with deadlines across dates, including overdue and future work, grouped by recurring series. Read-only.
---

# List short-term Daybook tasks

Load the installed `daybook` skill with `skill_view` for its CLI invocation and follow **Short-term task list** in `references/workflows.md`. Run `short-list [YYYY-MM-DD]`, using the requested as-of date or its timezone-aware default. This reads all deadline tasks across dates, rather than today's agenda or an arbitrary date window.

Present each returned group once, in deadline order, with its text, deadline, status, and remaining occurrence count. Distinguish elapsed unfinished occurrences from future scheduled occurrences. Completion applies to each dated occurrence; one checked day does not finish the whole series. Do not infer overall goal completion from task counts. The CLI already excludes fully checked groups and keeps different series separate even when their text matches. With no results, say there are no unfinished short-term tasks. Do not create, check off, reschedule, or remove tasks.
