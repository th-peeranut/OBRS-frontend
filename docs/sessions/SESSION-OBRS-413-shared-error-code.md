# SESSION — OBRS-413 · Consolidate duplicated extract*ErrorCode helpers

**Card:** [OBRS-413](https://nj-phuyaipu.atlassian.net/browse/OBRS-413)
**Branch:** `imp/obrs-413-shared-error-code` · worktree `../OBRS-frontend-wt-obrs-413-shared-error-code`
**Lane:** Z4 (Admin FE + FE tech-debt) · obrs-improve · FE-only · verification **local**

## What this session found

**The card's work was already delivered** — commit `c89f9fb refactor(shared): extract one
extractApiErrorCode() util (OBRS-413)` landed 2026-07-16, the same day the card was filed,
together with `docs/adr/0022-shared-api-error-code-extractor.md`. The card was never
transitioned off Backlog, so the board and the checklist both still listed it as open work.

Every AC verified on `origin/dev` `373cfba`:

- one shared helper in `src/app/shared/lib/api-error-code.ts` ✅
- all three call sites named on the card delegate to it (`extractScheduleErrorCode`,
  `extractBoardingActionErrorCode`, `extractUsabilityReportErrorCode`) ✅
- ten helpers delegate in total; ADR-0022 recorded nine, because OBRS-576 (2026-07-20)
  added `extractConfigHistoryErrorCode` afterwards and it delegated on the first write ✅

## What this session changed

Only `docs/adr/0022-shared-api-error-code-extractor.md` — a dated **Correction** section.
The Decision stands; two of its counts did not survive a re-survey:

| ADR said | Actually |
|---|---|
| Family C = 2 call sites | **11 sites across 8 files** |
| nine helpers delegate | ten |

The ADR surveyed *named helpers*, so it never saw the seven inline `.catch()` reads
(`login`, `verify-email` ×2, `change-email-dialog` ×2, `change-email-confirm`,
`report-usability-fab`), and it also missed two named ones (`settlements.store.ts:83`,
`reports.store.ts:91`) that are byte-identical to the member it did name. `reports.store`
predates the ADR (OBRS-40, 2026-07-09) — missed, not added since.

That understatement is the part worth correcting: a reader planning the convergence would
have sized it at two call sites.

## Follow-up opened

[OBRS-609](https://nj-phuyaipu.atlassian.net/browse/OBRS-609) — decide the
non-`HttpErrorResponse` contract, then converge the 11. **obrs-build lane, not improve**:
ADR-0022 spells out that moving Family C onto the guarded util changes behavior for
non-`HttpErrorResponse` input, and that their specs throw plain object literals which the
guard rejects. Converging them means editing tests to match changed behavior — the exact
signal that a behavior-preserving refactor has stopped preserving behavior.

## Status

Verification: `ng test` on the merge-base tree (the ADR edit cannot affect it).
`npm ci` was required first — the fresh worktree had no `node_modules`, and `ng test`
exited **0** while reporting only "Could not find the builder's node package".

---

📍 OBRS-413 · already delivered by `c89f9fb`; this run verified it, corrected ADR-0022's
census, and spun off OBRS-609.
