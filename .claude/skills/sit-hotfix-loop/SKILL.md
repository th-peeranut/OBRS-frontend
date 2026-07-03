---
name: sit-hotfix-loop
description: Debug → fix → review → deploy → verify loop for bugs found while manually testing the OBRS app (local frontend against the live SIT backend). Trigger each time the user reports/pastes a SIT issue in chat. Leads with debug-mantra, reuses the obrs-* agents for the fix, scrutinizes, applies live Supabase DB migrations directly when needed, pushes to the `sit` branch (CI auto-deploys to Koyeb), verifies against live SIT, and records each fix in a local retrospective. NOT the feature pipeline — for building features use agent-office.
---

> **Mirrored from the `obrs-agent-office` repo — canonical source of truth.** This copy lives here as an *alignment reference* for AI coding in this repo; edit the skill in `obrs-agent-office`, not here. Paths such as `../OBRS-backend`, `../OBRS-frontend`, and `.claude/agent-office/…` are relative to the **obrs-agent-office** repo (a sibling of this one), not to this repo — do not run the cross-repo orchestration from here. When coding with AI in this repo: read this repo's own skills first, then align to this office skill as the source of truth.

# sit-hotfix-loop — OBRS SIT Bug Hotfix Loop

You (Claude Code, the orchestrator) run this loop **once per issue the user reports in chat**.
This is a *debug-and-ship* loop, distinct from `agent-office` (the feature-build pipeline).
It deliberately does what agent-office must never do: **push and deploy**, and **mutate the live SIT DB**.

## Scope guardrails
- **SIT only.** Deploy target is the `sit` branch → Koyeb `obrs-backend/sit-obrs-backend`. Never touch `main`/prod.
- **Always work in a worktree off `dev`** (see Worktree isolation), and **after verify passes, merge it into `dev`** — backend pushes to `origin/dev` + `origin/sit`, frontend to `origin/dev` — then **remove the worktree** (Step 7).
- **Backend is what deploys.** The frontend runs locally (points at SIT). A frontend-only bug → fix in the worktree, verify locally, then merge to `dev` and push `origin/dev` at Step 7 — **no Koyeb deploy** (only the backend deploys; pushing the frontend just syncs the remote).
- **Reuse the roster**, don't rebuild it: spawn `obrs-backend` for the fix and `obrs-scrutinize`/`scrutinize` for review. Skip PM/SA/UX/QA/Reporter pipeline ceremony.
- **Run end-to-end by default — don't ask permission mid-loop** through Step 6 (verify on SIT). The push/deploy/DB steps up to and including the SIT verification deploy are pre-authorized. **Only checkpoint before that if the user explicitly frames the run as a "test"/"dry-run"/"diagnose only"** — then stop after Step 3 and report. Don't re-confirm the same authorization every run.
- **The `dev` merge (Step 7) is a standing checkpoint, not end-to-end.** Once Step 6 verification passes, transition the Jira card to In Review and **stop** — do not merge to `dev`/push/remove the worktree until the user has reviewed the Jira card and moved it to **Done**. This applies on every run, not just runs framed as a test.

## Paths & secrets
- Orchestration repo (here): `.` — `obrs-agent-office`
- Backend repo: `../OBRS-backend` (sibling). Frontend repo: `../OBRS-frontend`.
- Secrets: `source .claude/skills/sit-hotfix-loop/secrets.local.env` (gitignored). Never echo or commit these values. If `secrets.local.env` is missing, copy `.example` and stop to ask the user to fill it.
- **Issue tracking: Jira first, local retrospective always.** Every reported issue gets an OBRS Jira **Bug** card (see Jira tracking below) before Step 2 touches any code — no GitHub Issues. The local retrospective (Step 8.1) is the durable knowledge record regardless of the Jira card's state. The affected layer from Step 1 still decides which repo the *fix* lands in: a backend/DB bug → `OBRS-backend`; a frontend bug → `OBRS-frontend`.

## Jira tracking
Every issue reported in chat gets an OBRS Jira card **before** Step 2 (Fix) touches any code. That card is also the **merge gate**: Step 7 (the `dev` merge) does not run until the user has reviewed the card and moved it to Done.
- Site cloudId: `e7d7f1d1-a112-4653-bf7a-3b8d9ab799a0` (`nj-phuyaipu.atlassian.net`), project key `OBRS`, issue type **Bug**.
- **Search before creating:** as part of Step 1 (diagnose), run `mcp__atlassian__searchJiraIssuesUsingJql` (`project = OBRS AND text ~ "<keywords from the symptom>"`, or `mcp__atlassian__search`) for related/duplicate cards. If a clear match turns up, open it (`mcp__atlassian__getJiraIssue`) and read its description/comments for prior root-cause notes or decisions before proposing a fix — don't re-diagnose from scratch if it's already documented. Note the related key in the new card's description (or, if it's truly the same unresolved issue, comment on the existing card instead of creating a duplicate — ask the user which they'd prefer if it's ambiguous). This is a quick lookup, not a blocker — proceed to card creation either way.
- After Step 1 (diagnose) confirms root cause + affected layer: `mcp__atlassian__createJiraIssue` (project OBRS, type Bug, summary = the symptom) → `mcp__atlassian__transitionJiraIssue` to **In Progress**. Keep the issue key for the rest of the run.
- Immediately after Step 6 verification passes (fix proven on SIT, before Step 7 touches `dev`): `mcp__atlassian__getTransitionsForJiraIssue` on that issue to find the current **"Submit for Review"** transition id (only available while the card is In Progress) → `mcp__atlassian__transitionJiraIssue` to **In Review**. Then **stop and wait** — see the merge gate below.
- **Merge gate (Step 6 → Step 7):** after transitioning to In Review, do not run Step 7 in the same turn. Tell the user the fix is verified on SIT and the card is In Review, awaiting their review. Resume Step 7 only when the user confirms in chat (e.g. "done", "merged", "go ahead", "ship it") — or, if asked to check, call `mcp__atlassian__getJiraIssue` on the card and confirm its status is **Done** before proceeding. Don't poll Jira on your own initiative between turns.
- **Micro-fix lane:** same gate applies after its Step 3 live-verify, before its Step 4 merge — see Micro-fix lane below.
- **Open the card for review, every run:** the moment the card transitions to In Review (the merge-gate point above, or the micro-fix lane's equivalent), open it in Microsoft Edge for the user — `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "https://nj-phuyaipu.atlassian.net/browse/<KEY>" &` (background it, e.g. with `disown`, so it doesn't block the turn). Don't wait to be asked.
- **Before/after evidence on the card, every run with a visible UI change:** for any frontend/UI fix, capture a before screenshot (the user's original repro image, or one you take) and an after screenshot (from your own live-verify step) before transitioning to In Review. **No MCP tool here can upload a Jira attachment** — `mcp__atlassian__createJiraIssue`/`editJiraIssue`/`addCommentToJiraIssue` only handle text, not files — so attach directly via the raw REST API using the Jira API token in `secrets.local.env` (`JIRA_SITE`/`JIRA_EMAIL`/`JIRA_API_TOKEN` — see `secrets.local.env.example`; if missing, fall back to the manual folder-drop method below and ask the user to add one):
  ```bash
  source .claude/skills/sit-hotfix-loop/secrets.local.env
  curl -s -o /dev/null -w "%{http_code}\n" -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -X POST \
    -H "X-Atlassian-Token: no-check" -F "file=@<path-to-image>" \
    "https://$JIRA_SITE/rest/api/3/issue/<ISSUE-KEY>/attachments"
  ```
  Expect `200`. Never echo `$JIRA_API_TOKEN` in output. **On a `200`, delete the local before/after image files immediately** — they only existed so curl had a path to read from; don't keep them on disk once the card has them. **Fallback if no token is configured:** copy both images into a stable, easy-to-find folder (not the session scratchpad, which gets cleaned up) — e.g. `<workshop-root>/jira-attachments/<ISSUE-KEY>/before-*.png` and `after-*.png` — open that folder in Explorer alongside the Edge tab from the bullet above, and tell the user those two things are ready so they can drag the files into the card themselves.
- If `ToolSearch query:"select:mcp__atlassian__createJiraIssue"` returns nothing, the MCP tools haven't loaded this session (needs a Claude Code restart after `/mcp` auth) — tell the user and proceed with the rest of the loop; don't silently skip the card.
- If the loop aborts before Step 6 passes (verification never succeeded), leave the card at **In Progress** — do not transition to In Review for unresolved work.

## Worktree isolation (any fix that touches code)
**Never edit the sibling clones (`../OBRS-backend`, `../OBRS-frontend`) directly.** The moment the fix will touch code, create a dedicated **git worktree off `dev`** for the affected repo and do all editing/testing/committing there:
```bash
SLUG=<issue-slug>                          # kebab-case; shared by branch + worktree dir
git -C ../OBRS-backend  fetch origin
git -C ../OBRS-backend  worktree add -b sit/$SLUG ../OBRS-backend-wt-$SLUG  origin/dev
# (frontend bug instead:)
git -C ../OBRS-frontend fetch origin
git -C ../OBRS-frontend worktree add -b sit/$SLUG ../OBRS-frontend-wt-$SLUG origin/dev
```
- Worktree **only** for the repo the bug lives in (the affected layer from Step 1). DB-only fixes touch the live DB, not repo code — no worktree needed unless you also change `schema.sql`/migrations files.
- The branch `sit/$SLUG` branches off `dev`. It is what deploys to SIT for verification (Step 5) and what merges back into `dev` at the end (Step 7).
- Step 7 merges it to `dev`, pushes, and **removes the worktree** — never leave one behind.

---

## Micro-fix lane (provably-cosmetic frontend changes)
**Most reported issues are one-line cosmetic frontend tweaks** (label/casing, dividers, spacing, an underline, dropdown/parity polish). Running the full loop — `obrs-frontend` spawn, scrutinize subagent, full retrospective — on a CSS/label change is wasted ceremony. So **first decide which lane this issue is on:**

A change qualifies for the micro-fix lane **only if ALL hold**: frontend-only, **no** logic/state/NgRx/API/payload change, **no** DB, **no** new component or user flow, **≤ ~15 lines** in 1–2 files, and a human can eyeball the fix as correct. **If in any doubt, use the full loop** — the lane is for changes that cannot regress anything testable.

**Micro-fix lane (abbreviated path):**
1. Worktree off `dev` (Worktree isolation) — still required; never edit the sibling clone.
2. Fix it yourself in the worktree (no `obrs-frontend` spawn, no scrutinize subagent).
3. **Live-verify in the browser** on the picked free port (Step 6's port + CORS note) — DOM/screenshot proof, plus a quick glance that you didn't break the adjacent element **and that the change conforms to `docs/design-system.md` §11** (token/palette use, button role, dropdown placeholder parity, single input shape) — the micro-fix lane has no scrutinize subagent, so this glance is the only design review. This replaces scrutinize; it does **not** replace the Jira merge gate. **For any i18n/language-dependent fix, verify both a cold page load with the target language pre-set AND a live in-app language switch (click the actual switcher, no reload)** — they can exercise genuinely different code paths (see `gis-button-locale-script-src-only` memory: a cold-load-only test missed that a live switch never reached an already-rendered third-party widget).
4. Transition the Jira card to In Review (see Jira tracking) and **stop** — wait for the user to move it to Done before continuing.
5. Once the user confirms Done: merge to `dev` and push `origin/dev` (Step 7 frontend block), then remove the worktree.
6. **Lightweight record only:** add a **one-line** entry to `.claude/agent-office/MEMORY.md` (`- <date> micro-fix: <what> — OBRS-frontend <commit>`). **Skip** the per-run retrospective file (Step 8.1) and the `CORE.md` step. Commit + push the orchestration repo (Step 8.3).

Anything that fails even one gate above runs the **full loop below (Steps 1–8)**. Backend or DB bugs are **never** micro-fixes — they deploy.

---

## Step 1 — Reproduce & diagnose (debug-mantra)
Invoke the **`debug-mantra`** skill first. Recite its mantra block verbatim, then apply the four steps:
1. **Reproduce** — turn the user's report into an exact, repeatable trigger (HTTP request, UI action, or failing test). **Save this repro** — Step 6 re-runs it to prove the fix.
2. **Trace the fail path** — follow the actual code path to the failure; don't guess.
3. **Falsify the hypothesis** — confirm the root cause before proposing a fix.
4. **Cross-reference** every breadcrumb (logs, stack trace, `debug.log`, SIT response).

Output: root cause + affected layer — **backend**, **frontend**, or **DB schema/data**. Then create the Jira card and move it to In Progress (see Jira tracking) — before Step 2 touches any code.

---

## Step 2 — Fix
First create the worktree off `dev` for the affected repo (see Worktree isolation). Every fix below happens **inside `../OBRS-<repo>-wt-$SLUG` on branch `sit/$SLUG`** — never the sibling clone.
- **Backend bug:** spawn `obrs-backend` with **the worktree path**, the root cause, the failing repro, and the exact `file:line` from Step 1. It implements the fix and runs `./mvnw test`.
- **Frontend bug:** spawn `obrs-frontend` with the worktree path; it fixes and runs `ng test`. (No Koyeb deploy — frontend is local — but it still merges to `dev` and pushes at the end, see Step 7.)
- **Trivial (≤ ~30 lines, one file):** fix it yourself in the worktree; don't spawn.

---

## Step 3 — Scrutinize (subagent)
Spawn a **subagent** to run the `scrutinize` skill against the fix diff in the worktree (`git -C ../OBRS-<repo>-wt-$SLUG diff origin/dev`). It questions intent, looks for a simpler approach, and traces the real code path.
**Fix every finding** (loop Step 2 ↔ Step 3 until scrutinize is clean). Findings ≤ 30 lines the subagent self-fixes; larger ones come back to the dev agent.
**This loop has no QA stage** — so if scrutinize flags missing test coverage that would lock the fix (a regression test), **add that test now** as part of fixing findings. Do not defer it "to QA". Add the test that fails on the old behavior and passes on the new (and a companion guarding any adjacent rule you kept, e.g. `@NotBlank`).

---

## Step 4 — DB migration (only if Step 1 found a schema/data cause)
You apply changes to the **live SIT Supabase DB directly** (user-authorized for SIT).
1. Write a dated migration file in the **worktree** matching the existing convention:
   `../OBRS-backend-wt-$SLUG/migrations/<YYYY-MM-DD>_<slug>.sql` (idempotent: `IF NOT EXISTS` / `IF EXISTS`) — so it gets committed and merged to `dev` with the fix.
2. Keep `../OBRS-backend-wt-$SLUG/src/main/resources/schema.sql` in sync if the change is structural.
3. Apply it to the live SIT DB via **session mode (port 5432)** — the 6543 txn pooler is unreliable for DDL:
   ```bash
   source .claude/skills/sit-hotfix-loop/secrets.local.env
   PGPASSWORD="$SIT_DB_PASSWORD" psql \
     "host=$SIT_DB_HOST port=$SIT_DB_PORT dbname=$SIT_DB_NAME user=$SIT_DB_USER sslmode=require" \
     -v ON_ERROR_STOP=1 -f ../OBRS-backend-wt-$SLUG/migrations/<file>.sql
   ```
4. Verify the change landed (`\d <table>` or a `SELECT`). Apply the migration **before** the deploy in Step 5 so the new code meets the new schema.

---

## Step 5 — Commit in the worktree → deploy the fix branch to SIT
The fix lives on `sit/$SLUG` in the worktree. **Commit it there, then deploy that branch to SIT for verification** (Step 6). The merge back to `dev` happens only **after** verify passes (Step 7).

1. **Pre-flight locally** so a red CI doesn't leave SIT un-deployed: `./mvnw -B compile test` in `../OBRS-backend-wt-$SLUG` (run `verify` too if the fix touches integration paths). Fix any failure before pushing.
   - **The unit suite is the local gate — Docker-absent integration failures are NOT a regression.** This dev box has no Docker, so the Testcontainers integration tests (the `com.example.demo.it.*IT` classes) error during pre-flight with `Could not find a valid Docker environment`. That is environmental, not your change. Before pushing, confirm the **only** failures are in the `it` package with that Docker cause (e.g. `grep -l "valid Docker environment" ../OBRS-backend-wt-$SLUG/target/surefire-reports/*.it.*` and check the failure summary) — any failure outside `it`, or any assertion failure, blocks the push. CI's `integration-tests` job runs the `*IT` suite *with* Docker, so it's still covered there. To skip them locally and get a clean unit signal: `./mvnw -B test -Dtest='!*IT'`.
2. Commit on `sit/$SLUG`: `git -C ../OBRS-backend-wt-$SLUG add -A && git -C ../OBRS-backend-wt-$SLUG commit -m "fix(sit): <summary>"`.
3. **Deploy the branch to SIT** by pushing it onto the `sit` ref (Koyeb deploys from `sit`): `git -C ../OBRS-backend-wt-$SLUG push origin sit/$SLUG:sit`.
   - If rejected as non-fast-forward (the live `sit` carries commits not in your branch), rebase your branch onto the current `sit` first: `git -C ../OBRS-backend-wt-$SLUG fetch origin sit && git -C ../OBRS-backend-wt-$SLUG rebase origin/sit` (or merge), then push again. Never blind `--force` the shared `sit`.
4. **Watch CI** (it gates deploy) — grab the run this push triggered and block on its result:
   ```bash
   for i in $(seq 1 10); do RUN=$(gh run list --repo th-peeranut/OBRS-backend --branch sit -L1 --json databaseId -q '.[0].databaseId'); [ -n "$RUN" ] && break; sleep 2; done   # poll until the run registers instead of a fixed wait
   gh run watch "$RUN" --repo th-peeranut/OBRS-backend --exit-status
   ```
   The pipeline is `unit-tests` + `integration-tests` → `deploy` (Koyeb redeploy, `sit` only) → `smoke-tests`.
   - If `unit-tests`/`integration-tests` fail → **no deploy happened**. Loop back to Step 2 with the CI failure.
   - If `deploy` succeeds → SIT is live with the fix branch; proceed to verify.

**Frontend fix:** there is no Koyeb deploy or CI gate (the frontend runs locally), so nothing is pushed here — just commit in the worktree and verify locally (Step 6) from `../OBRS-frontend-wt-$SLUG`:
```bash
git -C ../OBRS-frontend-wt-$SLUG add -A && git -C ../OBRS-frontend-wt-$SLUG commit -m "fix(sit): <summary>"
```
The push to `origin/dev` happens at Step 7 after verification passes.

---

## Step 6 — Verify on live SIT
1. **Re-run the exact repro from Step 1** against `https://sit-obrs-backend.koyeb.app` (and/or the local frontend). Use `$SIT_ADMIN_EMAIL`/`$SIT_ADMIN_PASSWORD` for admin-gated flows. This is the direct proof the bug is fixed.
   - **For UI/frontend fixes, verify live in the browser on a free non-default port.** Don't hardcode the port — pick the **first free port at/above 4201** (staying off 4200 avoids IPv4/IPv6 shadowing, where a stale or sibling-worktree server on 4200 hides the sit server and you chase a phantom bug):
     ```powershell
     $port = 4201; while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }
     npx ng serve --configuration sit --port $port   # run from ../OBRS-frontend-wt-$SLUG; serves the SIT config at http://localhost:$port
     ```
     An alt port needs the cross-origin browser workaround in the `verify-sit-fix-alt-port-cors` memory (SIT CORS is pinned to `http://localhost:4200`, else 403 preflight). Confirm the fix with DOM inspection or a screenshot, not just a passing API/test result — and confirm the server you're hitting is *your* worktree on the picked port, not a leftover on 4200.
   - **For i18n/language-dependent fixes specifically, verify a cold page load *and* a live in-app language switch (click the actual switcher UI, no reload) as two separate cases** — a fix that only reads a stored preference at load time can silently miss the live-switch path (a third-party embedded widget, a value cached at mount, etc.), and a cold-load-only test won't catch that (see `gis-button-locale-script-src-only` memory).
2. **Run control cases too** — confirm you didn't break adjacent behavior: the path that already worked (e.g. the valid input, or the neighbouring rule you kept) should still behave as before. A fix that flips the bug *and* a control is not done.
3. Confirm CI's `smoke-tests` job passed (health check + booking smoke) as a regression guard.
4. If the repro still fails → loop back to Step 2. If it passes → resolved: transition the Jira card to In Review (see Jira tracking) and **stop** — report to the user and wait for them to move the card to Done. Do not proceed to Step 7 in the same turn.

---

## Step 7 — Promote to `dev` & remove the worktree
Run this **only after** (a) verification passes (Step 6) **and** (b) the user has moved the Jira card to **Done**. The fix has proven itself on SIT and been reviewed; now land it on `dev` and clean up.

- **Backend fix** — merge `sit/$SLUG` into `dev`, then push to **`origin/dev` and `origin/sit`** (the latter keeps `sit` exactly at the merged `dev` tip; Koyeb is already running this commit from Step 5):
  ```bash
  git -C ../OBRS-backend checkout dev
  git -C ../OBRS-backend pull --ff-only origin dev
  git -C ../OBRS-backend merge --no-ff sit/$SLUG -m "fix(sit): <summary>"
  git -C ../OBRS-backend push origin dev
  git -C ../OBRS-backend push origin dev:sit          # re-point sit at the merged dev tip (fast-forward)
  ```
- **Frontend fix** — merge `sit/$SLUG` into `dev`, then push to **`origin/dev` only** (no deploy). The standing `Bash(git -C ../OBRS-frontend …)` allow rule covers these from this orchestration repo:
  ```bash
  git -C ../OBRS-frontend checkout dev
  git -C ../OBRS-frontend pull --ff-only origin dev
  git -C ../OBRS-frontend merge --no-ff sit/$SLUG -m "fix(sit): <summary>"
  git -C ../OBRS-frontend push origin dev
  ```
- **Remove the worktree** once the merge is pushed — never leave one behind:
  ```bash
  git -C ../OBRS-<repo> worktree remove ../OBRS-<repo>-wt-$SLUG && git -C ../OBRS-<repo> branch -d sit/$SLUG
  ```
  If `worktree remove` reports residual changes, commit/merge them first — do **not** `--force` work away.

The Jira card is already at Done (the user set it, which is what unblocked this step) — no further transition needed here.

If verification **failed**, do not run this step: leave the worktree in place with its work committed, loop back to Step 2, and resolve before promoting to `dev`. The Jira card stays at In Progress.

---

## Step 8 — Report & record
1. **Retrospective (durable knowledge — reuse agent-office's home, the sole tracker for this loop):** write
   `.claude/agent-office/memory/archive/<YYYY-MM-DD>-sit-<slug>.md` with: symptom & where it occurred, repro, root cause, fix (files + commit), DB migration (if any), SIT deploy commit, the `dev` merge commit (Step 7), and verification result. Add the run to `.claude/agent-office/MEMORY.md`.
2. **Recurring patterns:** if this root cause has appeared 2+ times, promote a lesson to `.claude/agent-office/memory/CORE.md` (read by `obrs-pm`/devs to prevent recurrence).
3. **Commit and push the run memory in this (orchestration) repo** — the retrospective, the `MEMORY.md` index line, and any `CORE.md` change are the only files this loop commits here. Commit on the current branch (don't switch branches), then **push immediately**:
   ```bash
   git add .claude/agent-office/memory/archive/<file>.md .claude/agent-office/MEMORY.md .claude/agent-office/memory/CORE.md
   git commit -m "docs(agent-office): retrospective for sit hotfix <slug>"
   git push
   ```
4. **Tell the user:** root cause, fix commit, the `dev` merge commit + push targets (backend: `origin/dev` + `origin/sit`; frontend: `origin/dev`), deploy status, DB change (if any), verification outcome, that the worktree was removed, and the Jira card key (now Done, as they set it).

Then **await the next reported issue** (this skill is re-invoked per issue; it does not poll).

---

## Notes
- **Never push/deploy `main`** — only `dev` and `sit` (see Scope guardrails / Step 7 for the per-repo push targets). Only the backend **deploys** (Koyeb from `sit`); the frontend and this orchestration repo are pushed for remote sync, never deployed.
- **Never commit `secrets.local.env`** or print its values.
- **DDL on port 5432 only.** App traffic uses 6543; schema changes use 5432 session mode.
- This loop owns the worktree lifecycle, push/deploy/DB, and the `dev` merge; `agent-office` runs the same worktree model but never deploys to SIT mid-pipeline. Don't cross-wire them.
