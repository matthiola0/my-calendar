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

## Arrange / plan

Run `calendar plan [START_DATE] [END_DATE]` (defaults to today through six days later). Read every target date and real sections/cycles before writes, even when planning continues across multiple batches. Begin with fixed appointments and routines; preserve existing commitments, use the current phase of an active cycle, and fit new work into remaining capacity. Without estimates, use counts as a rough workload signal and keep proposed work small; do not infer available hours. State meaningful assumptions. `plan` itself only reads context.

If the user asks you to arrange/save the plan, use `record` for each task, then `link` and `move` to real IDs as appropriate; verify every affected day. If they ask for suggestions, present the plan without writing. Rescheduling or removing existing tasks needs an explicit instruction; adding a duplicate on another date does not reschedule the original. This CLI does not provide an atomic cross-date move; explain that limitation if a move is requested and avoid treating partial copy/delete as success.

## Review / reflection

Run `calendar review [YYYY-MM-DD]` first. Discuss actual completed and pending tasks, routine consistency, what got in the way, and one useful next adjustment. Ask about missing real outcomes; don't fabricate personal reflections. When the user supplies a reflection, run `calendar review YYYY-MM-DD "their reflection"` to append it while preserving earlier entries. Use `done DATE TASK_ID true` only for work the user explicitly reports as complete. Verify affected dates. Do not automatically carry unfinished tasks forward or mark them complete.

## Day / week / month completion

```text
calendar summary day [YYYY-MM-DD]
calendar summary week [YYYY-MM-DD]
calendar summary month [YYYY-MM-DD]
```

Report the returned range and as-of date, completed/total, pending count, percentage (`completionRate` is 0–1), and routine completion separately. Empty totals have `null` completionRate: say there were no scheduled tasks, not 100% complete. Full week/month totals include future tasks, so label full-period and elapsed-through-today results separately if available; future scheduled work is not overdue. Do not claim a routine streak beyond returned evidence. If the user wants detail, use daily breakdowns and actual notes; never include the access token in output.
