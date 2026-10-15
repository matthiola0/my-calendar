---
name: daybook-review
description: Review a Daybook day and append the user's reflection without overwriting prior notes.
---

# Review Daybook

Load the installed `daybook` skill with `skill_view` and follow its Review / reflection workflow. Read `review` context first, using the requested date or timezone-aware today. Base discussion on actual completed/pending tasks and routine occurrences. With no reflection supplied, help the user reflect without inventing or saving answers. Append supplied reflection text through `review DATE "text"`; mark tasks done only when the user explicitly reports completion. Verify changes.
