---
name: fleet-loop
description: Run the OBRS-frontend Fleet Loop — a multi-agent Goal -> Brief -> Build -> Review -> Targeted Retry -> Report cycle. Use when the user invokes /fleet-loop with a goal/feature description, or asks to run the fleet loop / fleet team on a frontend task.
---

# Fleet Loop (Frontend)

The Fleet Loop is a repeatable process for non-trivial OBRS-frontend changes: a Planner produces a Brief, the Frontend Builder implements it (self-reviewing as it goes), a QA Reviewer checks the result against the Brief, failures are routed back to the Frontend Builder for targeted fixes, and a Release Reporter closes out the run.

You (the orchestrator) drive this loop using the `Agent` tool with the `fleet-*` subagents defined in `.claude/agents/`. Do not skip steps.

## Token usage tracking

Maintain a running table for this run: `agent | role | tokens used`. After each `Agent`/`SendMessage` call returns, record the token usage reported for that call. If no usage figure is surfaced, record "n/a". Carry this table to step 6 for the release-reporter.

## Steps

### 0. Triviality gate

Before spawning anything, assess the goal yourself:

- **Trivial** (a single file or two tightly-coupled files, no new i18n/store/spec surface — e.g. a style tweak, label text change, a single constant rename): handle it directly. Edit the file(s), run `ng build --configuration production`, done. Do **not** invoke the Fleet Loop — tell the user you handled it directly and why.
- **Fleet-worthy** (touches multiple layers and/or has acceptance criteria worth QA-gating — new/changed components with store interaction, new API service methods, new routes, new i18n keys, new spec files): proceed to step 1.
- **Unsure**: proceed to step 1. If the Brief comes back with a single trivial task and no Safety flags, you may implement it yourself instead of spawning Builder/QA/Reporter.

### 1. Goal -> Brief

Spawn `fleet-planner` with the user's goal description. It returns a Brief: tasks with ownership (Frontend Builder), dependencies, acceptance criteria, QA pass criteria, safety flags, backend dependency flags, and open items.

**Checkpoint**: If the Brief's "Safety flags" section is non-empty (any CLAUDE.md §9 item: `auth.interceptor.ts`, `auth.guard.ts`, `error.interceptor.ts`, `idempotency-key.ts`, payment flows, or a new dependency request), **stop and confirm with the user before proceeding**. Also surface any "Open items for orchestrator" — particularly missing backend service methods — so the user can confirm the backend work is done before building.

### 1.5 Scrutinize the Brief

Before assigning any tasks, run the `/scrutinize` skill yourself against the Brief from step 1. Check: does the task breakdown achieve the goal with the simplest viable approach, are acceptance criteria specific enough for QA to produce a verdict, are there Angular-specific pitfalls the Planner missed?

- Minor issues (vague criterion, missing dependency note): fix directly in the Brief text before step 2.
- Substantive issues (wrong approach, missing task, scope mismatch): send the finding back to `fleet-planner` via `SendMessage` and have it revise before proceeding.

### 2. Assign -> Build

Spawn `fleet-frontend-builder` with the task(s) from the Brief. There is currently one specialist type — all tasks go to the Frontend Builder.

- If multiple tasks are independent (no declared dependency), you may run them in parallel — a single message with multiple `Agent` tool calls each scoped to one task. In practice, most frontend tasks have UI/store dependencies and should run sequentially.
- The Frontend Builder self-reviews (`ng build --configuration production` + targeted `ng test`) before returning. You don't need to re-trigger this.
- **Keep the agent ID** — if step 4 needs a retry, resume via `SendMessage` rather than spawning a new agent.

### 3. Evaluate

Spawn `fleet-qa-reviewer` **once** with the Brief and the Frontend Builder's report. It returns a PASS/FAIL verdict per acceptance criterion, with per-failure `{owner, finding, suggested fix area}`, plus a "Safety notes" section. **Keep this agent's ID** — do not spawn a new QA reviewer for rechecks.

### 4. Targeted Retry

If the overall verdict is FAIL:

- Resume the Frontend Builder's agent via `SendMessage` (to its existing ID from step 2) with **only the specific finding** to fix — do not re-send the whole Brief.
- Track a retry count per finding. Cap at **2** retries per finding.
- After the Frontend Builder responds, resume the **same** `fleet-qa-reviewer` via `SendMessage` — tell it what changed and ask it to re-check the affected criteria. It already has the Brief and prior verdict in context.
- Repeat until overall PASS, or until any single finding has been retried twice and is still failing.

### 5. Stop conditions

- **All criteria PASS** → proceed to step 6 with outcome = PASS.
- **A finding still fails after its 2nd retry** → stop immediately. Proceed to step 6 with outcome = ESCALATED, including the unresolved finding(s), what was tried in each attempt, and why it needs human judgment.

### 6. Report -> Ship

Spawn `fleet-release-reporter` with the full run history (Brief, every Frontend Builder report, every QA verdict, the outcome from step 5, and the token usage table). It returns a summary, writes a retrospective to `.claude/fleet-loop/memory/archive/`, updates `.claude/fleet-loop/MEMORY.md`, and may update `.claude/fleet-loop/memory/CORE.md`.

Present the Reporter's summary to the user. **Do not commit, push, or otherwise ship the change yourself** — leave that to the user.
