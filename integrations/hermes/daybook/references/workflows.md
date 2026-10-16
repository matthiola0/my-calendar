# Daybook workflows

Use the CLI invocation from the main skill. `help` lists all commands. These examples use `calendar` as shorthand, not a binary to install.

## Today / today's agenda

Run `calendar today [YYYY-MM-DD]`. Present fixed appointments (including any times written in their titles), pending routine occurrences, other pending tasks grouped by real day section, deadlines, and completed/total counts. Mention habit cues and two-minute starts when helpful. Do not invent appointments, priorities, or missing time estimates. If the user asks what to start with, recommend a practical next action and say why.

## Record an appointment or task

Resolve the date with a fresh `today` read, then read `get YYYY-MM-DD` before `record YYYY-MM-DD "14:00 Dentist"`. Keep exact stated times and context in the title; include an end time or duration only if supplied. If the date/time is ambiguous enough to change the commitment, clarify it. Verify with `get`. `record` deduplicates normalized identical titles on that date; it does not detect differently worded duplicates. Compare existing tasks first. Place new tasks in existing sections with `move DATE TASK_ID SECTION_ID` when appropriate.

## Remember a routine

Read `today`, the dates needed, and `sections`. Represent an explicit routine as actual recurring tasks using:

```text
calendar repeat START_DATE "07:30 Exercise · 30 min" day 1 date END_DATE
calendar repeat START_DATE "Weekly review" week 1 count 12
calendar habit DATE TASK_ID "After breakfast" "Put on shoes" "Someone who exercises consistently"
```

The API generates finite occurrences, at most 365 per series. Use a user-provided end date/count. For an ongoing routine without an end date, propose a bounded horizon (for example, the next 30 days), explain the renewal date, and establish that horizon before creating it. Do not claim indefinite recurrence or automatic renewal. Never create a second series just because today's occurrence is already complete. For weekdays only, establish one weekly series per chosen weekday, then verify those dates; a daily series also includes weekends. Habit edits affect the selected occurrence; `series-update` changes the whole existing series including its metadata, so use it only when the user requests a series change. Never silently rewrite historical occurrences.

If the user says an item is not a routine but wants to keep the scheduled work, use `detach DATE TASK_ID` on the requested occurrences. This clears only the recurrence association and preserves the task, completion, placement, links, and notes. `unlink` instead removes a macro-cycle association; `series-remove` deletes tasks, so neither is a substitute. Preserve past dates unless the user asks to change them. For a future-only name change, use `rename DATE TASK_ID "title"` on each affected future occurrence instead of changing the whole historical series.

## Arrange / plan

Run `calendar plan [START_DATE] [END_DATE]` (defaults to today through six days later). Read every target date and real sections/cycles before writes, even when planning continues across multiple batches. Begin with fixed appointments and routines; preserve existing commitments, use the current phase of an active cycle, and fit new work into remaining capacity. Without estimates, use counts as a rough workload signal and keep proposed work small; do not infer available hours. State meaningful assumptions. `plan` itself only reads context.

If the user asks you to arrange/save the plan, use `record` for each task, then `link` and `move` to real IDs as appropriate; verify every affected day. If they ask for suggestions, present the plan without writing. Rescheduling or removing existing tasks needs an explicit instruction. Use `reschedule SOURCE_DATE TASK_ID TARGET_DATE ["title"]` for an authorized date change: it verifies a new task copy before removing the source, preserves its metadata, and returns the new ID. It is not atomic and rejects deadline or LeetCode-linked tasks. On any partial or unknown result, read both dates and reconcile the reported target copy before retrying; never treat partial copy/delete as success. `move` changes only the daily section, not the date.

Rescheduling also rejects a target date that already has an occurrence with the same recurrence ID. Detach the source first only if the user intends to turn it into an independent task. A server 5xx or connection failure can leave a saved copy; read both dates and reconcile before retrying.

## Review / reflection

Run `calendar review [YYYY-MM-DD]` first. Discuss actual completed and pending tasks, routine consistency, what got in the way, and one useful next adjustment. Ask about missing real outcomes; don't fabricate personal reflections. When the user supplies a reflection, run `calendar review YYYY-MM-DD "their reflection"` to append it while preserving earlier entries. Use `done DATE TASK_ID true` only for work the user explicitly reports as complete. Verify affected dates. Do not automatically carry unfinished tasks forward or mark them complete.

## On-demand LeetCode course

Use `calendar leetcode-policy` to read this Hermes profile's course settings and `calendar leetcode-next DATE` to preview its next main and review problems. These commands must not add calendar tasks. If no policy is configured, follow the user's explicit problem selection instead of guessing a course. The user defines the list order and starting progress; a website's lifetime solved count or an old attempt does not override a newly declared starting point. The current policy requires a daily quota of two main problems and one review problem.

The user's current course policy takes precedence over older macro-cycle descriptions of LeetCode question counts or frequency. Keep actual fixed appointments and the user's available time in view; do not silently replace the new quota with an old weekly practice template.

Only when the user asks to arrange or save a day's work, first read that day's `plan` context and real sections, then run `calendar leetcode-plan DATE`. It uses the saved quota and list order, shares existing problem records by LeetCode URL, and creates ordinary one-day tasks. Use the returned role, list position, and problem number to label each task with `rename` in the user's language, so a review is visibly a review while retaining its problem link. Place returned task IDs into suitable existing sections with `move` when needed; read the date again and report the saved work. Do not use `repeat`, prefill other dates, or re-create tasks just because the day currently has no general work. For a multi-day request, establish how unfinished problems should carry forward before assuming future completions.

The day's recorded selection is reused if planning is repeated, even after some problems are completed. A deleted task is treated as cancelled and is not silently re-created. If an operation stops partway, inspect the saved selection and actual date before continuing; keep the selected problems rather than allocating a new batch. Planning can be resumed through the same command. Do not run concurrent planners for one account on different devices: the profile lock serializes this local workflow, while the server's existing problem/date check is not a cross-device atomic guarantee.

Progress advances from genuine `solved` or `reviewed` attempt records for the relevant planned role, not from scheduling or `task.done`. The current API can mark a task done for a `stuck` or `hinted` attempt too, so those statuses must not advance course progress. Record only outcomes the user actually reports with `leetcode-attempt`; never fabricate attempts for the starting progress. A task ID accepts one attempt; if it already has an attempt and the user later reports another outcome, append the new attempt without that task ID, preserving its problem ID and actual date. Main and review roles share problem history, but completing a review must not skip an unassigned main problem.

Course settings and daily selections are private runtime data under the Hermes profile's `data/daybook` directory, separate from the installed skill. Read and update them through the CLI; never embed personal lists or progress in skill source or commit them to a repository. Setup uses `calendar leetcode-policy set /absolute/path/to/course.json` after verifying the user's lists and progress. Reimporting the same policy is safe; replacing an existing policy or resetting progress is not supported by the CLI. Installing updated skills must preserve this runtime data.

The stored policy and ledger are bound to a hash of the API URL and Agent Token together. Rotating a token or changing the URL does not automatically migrate the state, even for the same account. The CLI rejects that connection mismatch and has no migration command; inspect the original connection and progress before arranging a migration. Do not delete the ledger or silently import a new starting point to bypass this check.

## Day / week / month completion

```text
calendar summary day [YYYY-MM-DD]
calendar summary week [YYYY-MM-DD]
calendar summary month [YYYY-MM-DD]
```

Report the returned range and as-of date, completed/total, pending count, percentage (`completionRate` is 0–1), and routine completion separately. Empty totals have `null` completionRate: say there were no scheduled tasks, not 100% complete. Full week/month totals include future tasks, so label full-period and elapsed-through-today results separately if available; future scheduled work is not overdue. Do not claim a routine streak beyond returned evidence. If the user wants detail, use daily breakdowns and actual notes; never include the access token in output.
