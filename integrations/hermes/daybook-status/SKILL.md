---
name: daybook-status
description: Report Daybook completion for a day, Monday-based week, or calendar month with routine progress and daily breakdowns.
---

# Daybook completion

Load the installed `daybook` skill with `skill_view` and follow its Day / week / month completion workflow. Map 今天/日 to `day`, 本週/週 to `week`, 本月/月 to `month`; default to day. Use the requested anchor date or timezone-aware today. Run `summary PERIOD [DATE]` read-only. Show actual range, completed/total, pending, and routine progress. Empty days have no completion percentage; distinguish future scheduled tasks from unfinished past work.
