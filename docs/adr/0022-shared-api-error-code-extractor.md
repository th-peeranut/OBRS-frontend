# 22. Shared `extractApiErrorCode()` — and why two call sites keep their own

Date: 2026-07-16
Status: Accepted
Card: OBRS-413 (returned by `obrs-scrutinize` on OBRS-376's FE)

## Context

Twelve `extract*ErrorCode()` helpers had accumulated, each re-implementing the same
read of `error.error.errorCode`. OBRS-413 asked to consolidate "the duplicated
helpers" into one shared util.

They are not all duplicates. Normalizing away the name and the return-type cast, the
twelve fall into three groups:

| Family | Guard | Fallback | Members |
|---|---|---|---|
| A | `instanceof HttpErrorResponse` | `'GENERIC'` | 7, in `shared/lib/` |
| B | `instanceof HttpErrorResponse` | `null` | `extractScheduleErrorCode`, `extractUsabilityReportErrorCode` |
| C | **none** — duck-typed cast | `null` / `''` | `settlements-page`, `sell-page` |

Six of Family A hash byte-identical; the seventh (`extractScheduleStatusErrorCode`)
differs only by returning `string` with no cast. Both of Family B hash identical.

Family C is the interesting one. It never checks `instanceof` — it duck-types
`(err as { error?: { errorCode?: string } })?.error?.errorCode`. That is not a
stylistic difference, it is a different contract, and **its specs depend on it**:
they throw plain object literals (`{ error: { errorCode } }`), which are not
`instanceof HttpErrorResponse`. Family A/B's specs assert the mirror image —
`extractChangeStopErrorCode(new Error('boom'))` must be `'GENERIC'`.

## Decision

Add `shared/lib/api-error-code.ts` exporting `extractApiErrorCode(error, fallback)`,
keeping the `instanceof HttpErrorResponse` guard and taking the fallback as a
parameter — the one axis Families A and B actually vary on. Migrate those **nine**
helpers to one-line delegations. Each keeps its own name, return type, and cast, so
call sites and type-safety are untouched.

**Do not migrate Family C's two helpers.** Moving them onto the guarded util would
change their behavior for non-`HttpErrorResponse` input, and the only way to make
their existing specs pass again would be to rewrite the fixtures to construct real
`HttpErrorResponse` objects — i.e. editing tests to match changed behavior, which is
precisely the signal that a behavior-preserving refactor has stopped preserving
behavior. Their duplication is the cheaper problem.

## Consequences

- One place defines how an API error code is read; nine helpers delegate. −72/+18 lines.
- Parity proven: **2529/2529 tests pass, identical to the pre-change baseline on the
  same commit, with zero spec files edited.**
- Two call sites still read the field themselves. This is deliberate and documented
  here so the next reader doesn't "finish the job" and silently break them.
- If Family C should converge, it is a separate, behavior-changing task: first decide
  whether a non-HTTP error carrying `.error.errorCode` should yield the code or the
  fallback, then change the tests deliberately under that decision.

## Correction — 2026-07-21 (re-surveyed while closing OBRS-413)

The Decision above stands unchanged. Two of the counts do not.

**Family C is four named helpers, not two.** The original survey named `settlements-page`
and `sell-page`; re-grepping for the cast itself (`error?: { errorCode`) rather than for
helper *names* also finds `settlements.store.ts:83` and `reports.store.ts:91` — both
`private static extractErrorCode(): string | null`, both byte-identical to the
`settlements-page.component.ts:358` body, both unguarded. `reports.store` predates this
ADR (OBRS-40, 2026-07-09), so it was missed, not added since.

**And the field is read inline in five more files the survey never covered**, because it
only looked for *helpers*: `login.component.ts:162`, `verify-email.component.ts:51,97`,
`change-email-dialog.component.ts:159,189`, `change-email-confirm.component.ts:58`,
`report-usability-fab.component.ts:191` — seven sites that duck-type the same read
straight inside a `.catch()` and branch on the code. Same contract as Family C, no helper
to migrate.

So "Two call sites still read the field themselves" understates the remaining surface by
an order of magnitude: **11 sites across 8 files**. The consequence that matters is
unchanged — none of them may be moved onto `extractApiErrorCode` without deciding the
non-HTTP question first — but a reader planning that task should size it from this
number, not from the one above.

**The delegation count is now ten, not nine**, and that is the healthy direction: OBRS-576
(2026-07-20) added `extractConfigHistoryErrorCode` and it delegated on the first write.
The consolidation is holding for new code; nothing enforces it, so that is convention, not
a guarantee.
