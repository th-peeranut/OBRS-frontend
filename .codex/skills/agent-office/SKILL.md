---
name: agent-office
description: Run the OBRS Agent Office — a full-stack multi-agent pipeline: PM → SA → UX → (Frontend ∥ Backend) → QA → Reporter, each with Scrutinize review and retry logic. Use when the user submits a feature requirement or bug fix for the OBRS project.
---

# Agent Office — OBRS Team

You (Claude Code, the orchestrator) drive this pipeline using the `Agent` tool.
The agents are defined in `.claude/agents/obrs-*.md`.

**Retry limits** (track these counters throughout the run):
- Developer self-test retries: max 3 (internal, not counted globally)
- Scrutinize retries per phase: max 2
- QA retries: max 3
- Global cap: 4 combined Scrutinize + QA failures → escalation (Step 11)

---

## Worktree isolation (any run that touches code)
**Never let agents edit the sibling clones (`../OBRS-backend`, `../OBRS-frontend`) directly.** The moment a run will touch code in a repo, create a dedicated **git worktree off `dev`** for that repo and have every agent (and yourself, on the trivial path) work *there*:
```bash
SLUG=<feature-slug>                       # kebab-case; shared by branch + worktree dir
git -C ../OBRS-backend  fetch origin
git -C ../OBRS-backend  worktree add -b ao/$SLUG ../OBRS-backend-wt-$SLUG  origin/dev
git -C ../OBRS-frontend fetch origin
git -C ../OBRS-frontend worktree add -b ao/$SLUG ../OBRS-frontend-wt-$SLUG origin/dev
```
- Create a worktree **only for the repos this run actually changes** (backend-only → backend worktree only; frontend-only → frontend worktree only; trivial path → still use a worktree the moment you touch code).
- Pass the **worktree path** (`../OBRS-<repo>-wt-$SLUG`) to each developer/QA agent as its working directory — never the sibling clone. All edits, `mvn test`/`ng test`, and commits happen inside the worktree on branch `ao/$SLUG`.
- The branch `ao/$SLUG` lives only in the worktree until the end-of-run merge (Step 7), which merges it into `dev`, pushes, and **removes the worktree**. Never leave a worktree behind.

---

## Token tracking
Collect each agent's reported token usage into a table (`agent | tokens used`) once, when assembling the final report (Step 10) — no need to update a running tally after every call.

---

## Jira tracking
Every requirement submitted to this pipeline gets an OBRS Jira card **before** Step 1 (PM) starts. That card is also the **merge gate**: Step 7 (the `dev` merge/deploy) does not run until the user has reviewed the card and moved it to Done.
- Site cloudId: `e7d7f1d1-a112-4653-bf7a-3b8d9ab799a0` (`nj-phuyaipu.atlassian.net`), project key `OBRS`, issue type **Task**.
- **Search before creating:** before Step 1, run `mcp__atlassian__searchJiraIssuesUsingJql` (`project = OBRS AND text ~ "<keywords from the requirement>"`, or `mcp__atlassian__search`) for related/prior cards. If a clear match turns up, open it (`mcp__atlassian__getJiraIssue`) and read its description/comments — prior scope decisions or constraints there should inform Step 1 (PM) rather than being rediscovered. Note the related key in the new card's description. This is a quick lookup, not a blocker — proceed to card creation either way.
- Before Step 1: `mcp__atlassian__createJiraIssue` (project OBRS, type Task, summary = the requirement) → `mcp__atlassian__transitionJiraIssue` to **In Progress**. Keep the issue key for the whole run — pass it to Step 8 (Reporter) and Step 10 (Final report).
- Immediately after Step 6 reaches `##QA_PASSED##` (before Step 7 touches `dev`): `mcp__atlassian__getTransitionsForJiraIssue` on that issue to find the current **"Submit for Review"** transition id (only available while the card is In Progress) → `mcp__atlassian__transitionJiraIssue` to **In Review**. Then **stop and wait** — see the merge gate below.
- **Merge gate (Step 6 → Step 7):** after transitioning to In Review, do not run Step 7 in the same turn. Tell the user the run passed QA and the card is In Review, awaiting their review. Resume Step 7 only when the user confirms in chat (e.g. "done", "merged", "go ahead", "ship it") — or, if asked to check, call `mcp__atlassian__getJiraIssue` on the card and confirm its status is **Done** before proceeding. Don't poll Jira on your own initiative between turns.
- **Open the card for review, every run:** the moment the card transitions to In Review (the merge-gate point above), open it in Microsoft Edge for the user — `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "https://nj-phuyaipu.atlassian.net/browse/<KEY>" &` (background it, e.g. with `disown`, so it doesn't block the turn). Don't wait to be asked.
- **Before/after evidence on the card, every run with a visible UI change:** capture a before screenshot (the original repro/mock, or a QA screenshot of the old behavior) and an after screenshot (from QA's or your own live-verify step) before transitioning to In Review. **No MCP tool here can upload a Jira attachment** — `mcp__atlassian__createJiraIssue`/`editJiraIssue`/`addCommentToJiraIssue` only handle text, not files — so attach directly via the raw REST API using the Jira API token in `secrets.local.env` (`JIRA_SITE`/`JIRA_EMAIL`/`JIRA_API_TOKEN`, shared with `sit-hotfix-loop` — see that skill's `secrets.local.env.example`; if missing, fall back to the manual folder-drop method below and ask the user to add one):
  ```bash
  source .claude/skills/sit-hotfix-loop/secrets.local.env
  curl -s -o /dev/null -w "%{http_code}\n" -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -X POST \
    -H "X-Atlassian-Token: no-check" -F "file=@<path-to-image>" \
    "https://$JIRA_SITE/rest/api/3/issue/<ISSUE-KEY>/attachments"
  ```
  Expect `200`. Never echo `$JIRA_API_TOKEN` in output. **On a `200`, delete the local before/after image files immediately** — they only existed so curl had a path to read from; don't keep them on disk once the card has them. **Fallback if no token is configured:** copy both images into a stable, easy-to-find folder (not a worktree or scratchpad that gets cleaned up) — e.g. `<workshop-root>/jira-attachments/<ISSUE-KEY>/before-*.png` and `after-*.png` — open that folder in Explorer alongside the Edge tab from the bullet above, and tell the user those two things are ready so they can drag the files into the card themselves.
- If `ToolSearch query:"select:mcp__atlassian__createJiraIssue"` returns nothing, the MCP tools haven't loaded this session (needs a Claude Code restart after `/mcp` auth) — tell the user and proceed with the rest of the pipeline; don't silently skip the card.
- On escalation (Step 11), leave the card at **In Progress** — do not transition to In Review for an unresolved/blocked run.

---

## Step 0 — Triviality gate
Create the Jira card and move it to In Progress (see Jira tracking) before anything else. Then assess the requirement yourself:
- **Trivial** (single file, no spec/store/API surface change): handle it yourself — but still inside a worktree off `dev` (see Worktree isolation), not the sibling clone. Skip the pipeline. Then transition the Jira card to In Review (see Jira tracking) and **stop** — wait for the user to move it to Done before running the end-of-run merge (Step 7) to land it on `dev`, push, and remove the worktree.
- **Full-stack** (new/changed API + UI): run the full pipeline below.
- **Frontend-only**: skip SA, Backend, and related Scrutinize steps. Run: PM → UX → Frontend → Scrutinize → QA → Reporter.
- **Backend-only**: skip UX and Frontend. Run: PM → SA → Backend → Scrutinize → QA → Reporter.

---

## Step 1 — PM: Decompose requirement
Spawn `obrs-pm` with the customer's raw requirement.

**Checkpoint**: If the Brief contains R0 items (`auth.interceptor.ts`, `idempotency-key.ts`, payment flows), **stop and confirm with the user** before proceeding.

Keep the PM agent ID for reference.

---

## Step 2 — Brief sanity gate
Quick inline check of the PM's Brief (no separate `/scrutinize` pass — the substantive review happens on the SA/UX/dev outputs downstream):
- Acceptance criteria testable? Work breakdown complete and correctly scoped?
- Minor gaps: fix directly in the Brief text.
- Substantive gaps: send back to `obrs-pm` via `SendMessage` (see Retry Protocol in Notes).

---

## Step 3 — SA: System Specification
Spawn `obrs-sa` with the (possibly revised) Brief.

Then spawn `obrs-scrutinize` with the SA output.

**If `##SCRUTINIZE_FAILED##`**: return feedback to `obrs-sa` via `SendMessage` (see Retry Protocol). Count against global cap.
Repeat up to 2 Scrutinize retries. If still failing after global cap → escalate (Step 11).

**If `##SCRUTINIZE_PASSED##` or `##SELF_FIXED##`**: proceed.

---

## Step 4 — UX: Design Specification
Spawn `obrs-ux` with the Brief + SA spec.

Then spawn `obrs-scrutinize` with the UX output — **except skip this Scrutinize pass for frontend-only trivial changes** (cosmetic / single-component UI tweaks with no new user flow, no NgRx/state change, and no new API surface: e.g. label casing, dividers, dropdown parity). Go straight from UX to Frontend dev; the Frontend dev output is still scrutinized in Step 5, which catches what matters for these. Anything beyond cosmetic (new flow/state/component family) keeps the UX Scrutinize pass.

Apply same retry logic as Step 3 (when the pass runs).

---

## Step 5 — Development (parallel)
Spawn `obrs-frontend` and `obrs-backend` **in parallel** (two Agent calls in one message).
Both receive: Brief + SA spec + UX spec + **their worktree path** (`../OBRS-frontend-wt-$SLUG` / `../OBRS-backend-wt-$SLUG`) and branch `ao/$SLUG`. Each agent works, tests, and commits **inside its worktree** — never in the sibling clone.

**Documentation upkeep (both repos — include this expectation in each developer's prompt).** Each developer keeps its own repo's docs current as part of the work, symmetrically:
- **Backend** (`obrs-backend`): update `docs/api/*` for any new/changed endpoint, add an ADR under `docs/adr/` for a locked design/product decision, and keep `CONTEXT.md` domain terms in sync.
- **Frontend** (`obrs-frontend`): add/update **frontend docs** for any new or reshaped page/component — an ADR under `docs/adr/` for a notable UI-architecture decision (new page pattern, major component decomposition, state-management choice), and the README "UI Conventions" / relevant page docs. Do not leave a new page or component family undocumented; cross-link the backend ADR/API doc when a UI decision mirrors a backend one.

### For each developer independently:
- If `##SELF_TEST_FAILED##`: retry the developer up to 3 internal attempts (see Retry Protocol).
  If still failing after 3: escalate (Step 11) — do NOT block the other developer.
- If `##FRONTEND_COMPLETE##` / `##BACKEND_COMPLETE##`:
  spawn `obrs-scrutinize` for that developer's output.
  Apply same Scrutinize retry logic (max 2, counted against global cap).

Wait for both Frontend and Backend (and their Scrutinize passes) before proceeding to QA.

**Keep each developer's agent ID** — if Step 6 sends a fix back to them, resume via `SendMessage` (see Retry Protocol).

---

## Step 6 — QA

**QA gate — skip QA for frontend-only *trivial/cosmetic* changes** (same definition as Step 4: label/casing, dividers, dropdown parity — no new flow, no NgRx/state, no API surface). For those, the Step 5 dev-output Scrutinize + a quick orchestrator **live verify** (serve the worktree on the picked free port per the verification-port note below, confirm the change in the browser, **and eyeball it against `docs/design-system.md` §11** — palette/token use, one primary button, dropdown placeholder parity, single input shape — since the cosmetic lane skips the UX-Scrutinize design review) + CI `smoke-tests` are sufficient — this is exactly how `sit-hotfix-loop` ships 70/75 of all runs with no QA stage. A passing live verify counts as `##QA_PASSED##`.

**Run QA** for anything that touches a user flow, NgRx/state, or any API/backend change. QA's unique coverage is the full Playwright **E2E regression** suite, which CI's `smoke-tests` (health + booking smoke only) do **not** run — that's where an adjacent-flow break is caught, so don't skip it for non-cosmetic work.

Spawn `obrs-qa` with: Brief + SA spec + Frontend report + Backend report + **the worktree path(s)** (`../OBRS-<repo>-wt-$SLUG`) and branch `ao/$SLUG`. QA runs entirely against the worktree.

**QA verifies only — it does NOT merge.** Under the worktree model the orchestrator owns the merge to `dev` (Step 7); QA's job ends at a pass/fail verdict. Tell QA explicitly not to switch branches or merge.

**Local frontend verification port:** when QA (or you) serves the Angular frontend to verify a UI change against SIT, don't hardcode the port — pick the **first free port at/above 4201** (staying off 4200 avoids IPv4/IPv6 shadowing by a stale or sibling-worktree server): `$port = 4201; while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }; npx ng serve --configuration sit --port $port`. An alt port needs the cross-origin browser workaround in the `verify-sit-fix-alt-port-cors` memory (SIT CORS is pinned to `http://localhost:4200`). Pass the picked port to `obrs-qa` in its spawn prompt.

**For i18n/language-dependent changes specifically, verify a cold page load *and* a live in-app language switch (click the actual switcher UI, no reload) as two separate cases** — a fix that only reads a stored preference at load time can silently miss the live-switch path (a third-party embedded widget, a value cached at mount, etc.), and a cold-load-only test won't catch that (see `gis-button-locale-script-src-only` memory). Tell `obrs-qa` to cover both when the change touches `LanguageService`/`translate.use()`-adjacent code.

**Keep the QA agent ID** — retry via `SendMessage`, not a new agent spawn (see Retry Protocol).

If `##QA_FAILED##`: send only the specific failing criteria back to the relevant developer
(Frontend findings → `obrs-frontend` via `SendMessage`, Backend findings → `obrs-backend` via `SendMessage`).
After the fix, resume the same QA agent via `SendMessage` — do not re-run the full suite.

Retry up to 3 times (counted against global cap).

If `##QA_PASSED##`: transition the Jira card to In Review (see Jira tracking) and **stop** — report to the user and wait for them to move the card to Done. Do not proceed to Step 7 in the same turn.

---

## Step 7 — Merge to dev, push, and remove worktrees
Run this **only after** (a) QA verification passes (Step 6) **and** (b) the user has moved the Jira card to **Done**, once per repo that had a worktree this run. This is where the run's code lands on `dev` and (for the backend) deploys to SIT. The orchestrator owns this merge — QA no longer does it. **SIT/dev only — never `main`/prod.**

1. **Commit any residual** left in the worktree (devs/QA normally have already — this is the safety net). Skip if `git -C ../OBRS-<repo>-wt-$SLUG status --porcelain` is empty:
   `git -C ../OBRS-<repo>-wt-$SLUG add -A && git -C ../OBRS-<repo>-wt-$SLUG commit -m "chore(agent-office): residual for <feature>"`.

2. **Backend** (`OBRS-backend`, if it changed) — merge `ao/$SLUG` into `dev`, then push to **`origin/dev` and `origin/sit`** (Koyeb deploys from `sit`):
   ```bash
   git -C ../OBRS-backend checkout dev
   git -C ../OBRS-backend pull --ff-only origin dev
   git -C ../OBRS-backend merge --no-ff ao/$SLUG -m "feat(sit): <feature> (#<id>)"
   git -C ../OBRS-backend push origin dev
   git -C ../OBRS-backend push origin dev:sit          # promote the same commit to sit
   ```
   - `dev:sit` fast-forwards every run once `sit` tracks `dev`. If the **first** run under this model is rejected as non-fast-forward (legacy divergent `sit` history), reconcile once: `git -C ../OBRS-backend checkout sit && git -C ../OBRS-backend merge --no-ff dev && git -C ../OBRS-backend push origin sit && git -C ../OBRS-backend checkout dev`. Never blind `--force`.
   - Then **watch CI on `sit`** (it gates the deploy) and block on its result:
     ```bash
     for i in $(seq 1 10); do RUN=$(gh run list --repo th-peeranut/OBRS-backend --branch sit -L1 --json databaseId -q '.[0].databaseId'); [ -n "$RUN" ] && break; sleep 2; done   # poll until the run registers instead of a fixed wait
     gh run watch "$RUN" --repo th-peeranut/OBRS-backend --exit-status
     ```
     Pipeline: `unit-tests` + `integration-tests` → `deploy` (Koyeb redeploy, `sit` only) → `smoke-tests`.
     - tests fail → **no deploy happened**. Treat like a QA failure: loop back to the backend dev (Step 5/6) with the CI failure (counts against the global cap). Leave the worktree in place until it's resolved and merged.
     - `deploy` + `smoke-tests` succeed → SIT is live with the change.

3. **Frontend** (`OBRS-frontend`, if it changed) — merge `ao/$SLUG` into `dev`, then push to **`origin/dev` only** (it runs locally; no Koyeb deploy, no CI gate):
   ```bash
   git -C ../OBRS-frontend checkout dev
   git -C ../OBRS-frontend pull --ff-only origin dev
   git -C ../OBRS-frontend merge --no-ff ao/$SLUG -m "feat: <feature> (#<id>)"
   git -C ../OBRS-frontend push origin dev
   ```

4. **Remove the worktree(s)** once the merge is pushed (and, for backend, CI is green) — never leave one behind. **Use the guarded wrapper** — a PreToolUse hook DENIES raw `git worktree remove` because it can silently follow the `node_modules` junction and wipe the main clone's packages (CORE.md, 5 occurrences). The wrapper deletes the junction first, verifies it is gone, removes the worktree, then post-checks that the main clone's `node_modules` survived:
   ```bash
   powershell -NoProfile -ExecutionPolicy Bypass -File .claude/agent-office/scripts/safe-worktree-remove.ps1 -Worktree ../OBRS-backend-wt-$SLUG  && git -C ../OBRS-backend  branch -d ao/$SLUG
   powershell -NoProfile -ExecutionPolicy Bypass -File .claude/agent-office/scripts/safe-worktree-remove.ps1 -Worktree ../OBRS-frontend-wt-$SLUG && git -C ../OBRS-frontend branch -d ao/$SLUG
   ```
   If the wrapper reports residual changes (its `git worktree remove` exits non-zero), you skipped sub-step 1 — commit/merge them first; do **not** pass `-Force` to work away real changes.

5. Record the `dev` merge commit(s), the SIT push + CI/smoke result, and the worktree removal for the final report (Step 10). The Jira card is already at Done (the user set it, which is what unblocked this step) — no further transition needed here.

---

## Step 8 — Reporter
Spawn `obrs-reporter` with: Brief + all agent reports from this run + QA verdict + token usage table.

The reporter:
- Writes a run retrospective to `.claude/agent-office/memory/archive/`
- Updates `.claude/agent-office/MEMORY.md` index
- Reads `.claude/agent-office/memory/CORE.md` and promotes patterns if they recurred 2+ times
- Flags doc drift in **both** repos — backend (`docs/api/*`, `docs/adr/`, `CONTEXT.md`) and frontend (`docs/adr/`, README "UI Conventions", page/component docs) — flags only, does not edit. In particular, flag any new page/component or endpoint that shipped **without** a matching docs/ADR update (Step 5 should have produced it).

Proceed to Step 9 after the reporter finishes.

---

## Step 9 — Commit sweep & worktree check
Run at the end of **every** run — full pipeline, trivial-gate shortcut, or escalation (Step 11).
On the happy path Step 7 already committed, merged, pushed, and **removed** the worktrees; this step is the safety net for runs that aborted before Step 7 or left something stranded.

For each code repo — `OBRS-backend` **and** `OBRS-frontend`:
1. **Worktree still present?** (`git -C <repo> worktree list` shows `…-wt-$SLUG`) → the run didn't finish Step 7. Commit any uncommitted changes *inside the worktree* (`git -C ../OBRS-<repo>-wt-$SLUG add -A && … commit`), then:
   - if QA passed **and** the Jira card is Done, complete Step 7 (merge → push → remove worktree);
   - if QA passed but the card is still In Review (awaiting the user), **leave the worktree in place** — this is the expected paused state, not a stranded run;
   - on an aborted/escalated run, **leave the worktree in place with its work committed** and flag it for the user — never merge unverified work to `dev`.
2. **No worktree left** → the sibling clone should be clean on `dev`. `git -C <repo> status --porcelain` empty → record "nothing to commit". If somehow dirty, commit on the **current** branch (do not switch) and note it.

Do **not** push or merge the code repos here — landing on `dev`/`sit` is Step 7's job. This step only guarantees nothing is silently stranded and no worktree is orphaned.

**Orchestration repo (`obrs-agent-office` — the repo this skill runs in).** The reporter (Step 8) writes the run's durable memory here (retrospective, `MEMORY.md` index, any `CORE.md` promotion), and pending skill edits may also be present. Unlike the code repos, **commit AND push** these — the orchestration repo has no deploy target, so the push is just remote sync of the run's durable memory:
1. Stage the run memory (and any intended skill changes): `git -C . add .claude/agent-office/MEMORY.md .claude/agent-office/memory .claude/skills/agent-office/SKILL.md`.
2. Commit on the **current** branch (do not switch): `git -C . commit -m "docs(agent-office): retrospective for <feature> (#<id>)"`.
3. Push: `git -C . push`.
Record the orchestration commit hash for the final report. (If a stray `AGENT_MEMORY.md` was written to the repo root by an agent's misdirected cwd, delete it — the per-repo `AGENT_MEMORY.md` belongs in each code repo, not here.)

---

## Step 10 — Final report
Present to the user:
- Feature name and the `dev` merge commit per repo (Step 7)
- Summary of what was built (from each agent's report)
- Any Scrutinize self-fixes (from AGENT_MEMORY.md entries)
- **Push targets** — backend pushed to `origin/dev` + `origin/sit`, frontend to `origin/dev` (or "n/a — repo unchanged")
- **SIT deploy status** (Step 7) — `sit` commit + CI/smoke result, or "not deployed (frontend-only)"
- **Worktree cleanup** — confirm each `…-wt-$SLUG` worktree was removed (or flag any left behind on an aborted run)
- Commit sweep / safety-net results, plus the orchestration-repo memory/skill commit hash (pushed)
- Doc drift flags from the reporter (items that require human follow-up)
- Token usage table
- Any open items or follow-up recommendations
- Jira card key and its Done status (or "left In Progress — see escalation" on a blocked run, or "In Review — awaiting your Done" if this report is the pre-merge checkpoint)

---

## Step 11 — Escalation
If global cap (4) is reached OR a self-test fails after 3 attempts:
1. Send an email via the EmailTool in `agent-office/shared/tools/email_tool.py`
   OR instruct the user: "Pipeline blocked at [phase] — [reason]. Manual intervention needed."
2. Report exactly what was tried, what failed, and what the unresolved finding is.
3. Run the reporter anyway (Step 8) so the failure is archived and the token table is recorded.
4. Run the commit sweep (Step 9) so partial work isn't lost.
   (Do **not** run Step 7 on escalation — a blocked/failed run is never merged to `dev` or promoted to `sit`. Leave the worktree in place with its work committed so it can be resumed.)
5. Leave the Jira card at **In Progress** — do not transition it to In Review for a blocked/failed run.
6. Do NOT retry further. Present the failure report to the user.

---

## Notes

### Retry Protocol
**Preferred**: Resume an existing agent via `SendMessage` — the agent retains its prior diff and only needs the specific finding(s) appended.

**Fallback (when `SendMessage` is unavailable in this environment)**: Spawn a fresh agent. The retry prompt MUST be fully self-contained — the fresh agent starts cold with no memory of its prior diff:
- The specific finding(s), with `file:line` references
- The relevant acceptance criterion from the Brief that is failing
- A concise summary of what the prior agent implemented (which files were changed, what logic was added)
- Enough SA/UX spec context to understand the requirement — but only the relevant section, not the full spec

Do NOT resend the entire Brief + SA + UX spec on a retry. Scope the prompt to the minimum the agent needs to fix the specific finding. Unscoped retry prompts waste tokens and dilute the agent's focus.

### Agent IDs to keep
- `obrs-pm` — for Brief revisions (Step 2 SendMessage)
- `obrs-frontend` — for QA-driven fix retries (Step 6 SendMessage)
- `obrs-backend` — for QA-driven fix retries (Step 6 SendMessage)
- `obrs-qa` — for re-checks after fixes (Step 6 SendMessage)

### Memory locations
- Cross-run lessons: `.claude/agent-office/memory/CORE.md`
- Run retrospectives: `.claude/agent-office/memory/archive/<YYYY-MM-DD>-<slug>.md`
- Run index: `.claude/agent-office/MEMORY.md`
- Per-run agent notes: `AGENT_MEMORY.md` in each repo (written by SA, QA, and Scrutinize automatically)

### On-demand companion agents
These are NOT part of the main pipeline. Invoke separately when a stakeholder needs a status or quality review:
- `obrs-pm-scrum` — project status reports, sprint/milestone tracking, blockers, velocity
- `obrs-tech-lead` — technical health reports, code quality trends, process improvement suggestions

### Other rules
- **The orchestrator owns the worktree lifecycle and the merge** (created at Worktree isolation, landed at Step 7, swept at Step 9). Developers and QA only commit *inside the worktree* on `ao/$SLUG`; they never merge or switch branches. Beyond the actions in those steps, never push or merge, and never touch `main`/prod.
- **AGENT_MEMORY.md** is managed by the SA/QA/Scrutinize agents (see Memory locations) — you don't manage it.
