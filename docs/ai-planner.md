# AI calendar planner

The AI planner lets an authenticated user describe an outcome, deadline, and available time in English, Traditional Chinese, or Japanese. Daybook reads only the relevant dates, macro cycles, phases, and day sections, then returns a proposal for review. No proposal is written until the user selects **Apply to calendar**.

## Configuration

1. Create an API key in the [Groq Console](https://console.groq.com/keys).
2. Add the key to `.env.local` for local development:

   ```dotenv
   GROQ_API_KEY=gsk_...
   LLM_MODEL=qwen/qwen3.8-27b
   ```

3. Store `GROQ_API_KEY` as a server-side secret in production. Never place it in client code, Git, screenshots, or public logs.

`LLM_MODEL` is optional. Change it when Groq's available model list changes; no application code change is required.

## Request flow

1. The user opens **AI planner** from the application navigation.
2. A range-selection request identifies the smallest useful date range, up to 120 days.
3. The server loads existing tasks, cycles, phases, and day sections in that range and sends the minimum planning context to the model.
4. The model asks no more than three essential questions when information is missing. It creates a proposal only after the outcome, deadline, and available time are clear.
5. The user reviews the proposed cycle, phases, and daily tasks.
6. The apply route reads each target date again, validates all links and limits, and skips tasks with the same name on the same date.

The conversation remains in the current browser page and is cleared by navigation or refresh. A proposal may contain at most 30 tasks and at most five new tasks on one date. Each account may make up to eight planner requests per minute and 40 per day.

## Data and safety boundaries

- The provider API key exists only in the server environment.
- The model has no database credentials, agent credentials, or SQL access.
- The model returns structured data. The server validates every field, date, length, day section, and macro-cycle link.
- Applying a proposal may add a cycle, phases, and tasks. It never deletes, moves, or overwrites existing items.
- Reapplying a proposal skips tasks that already exist with the same text on the same date.
- Avoid unrelated passwords, API keys, government identifiers, medical records, or financial information in planner conversations.

Consult Groq's current [data controls documentation](https://console.groq.com/docs/your-data) before deploying to a new jurisdiction or changing the application's data-handling promises.

## Prompt examples

### Macro cycles

- `I want to publish my portfolio by October 31 and can spend eight hours a week. Ask no more than three essential questions, then propose phases, buffer time, and a completion reward.`
- `Review my active macro cycles. Find date conflicts or overloaded days and suggest adjustments before changing anything.`
- `Adjust this macro cycle to match my current progress. Preserve completed work and reduce any unrealistic scope.`

### Daily cycles

- `Read next week's existing calendar and active macro cycle. Preserve current items, add no more than three important tasks per day, and leave buffer time.`
- `I have 90 minutes today and average energy. Choose the two highest-value small actions from my current goal.`
- `Design a two-week habit with an identity, cue, two-minute start, and realistic rest days.`

## API

- `POST /api/assistant/chat` selects and loads the planning context, then returns questions or a structured proposal.
- `POST /api/assistant/apply` validates and applies a proposal that the user has approved.

Both routes require an authenticated session. The browser never calls Groq directly.
