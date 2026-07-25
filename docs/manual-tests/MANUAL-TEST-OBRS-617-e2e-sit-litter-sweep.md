# MANUAL TEST — OBRS-617 · E2E SIT litter sweep + narrow isTestRoute guard

**Type:** obrs-improve parity checklist (behavior-preserving). The only user-observable
surface is the public `/home` **direction selector** (route dropdown). Its behavior must be
**identical** before and after this change. The rest of the change is test-infra + a doc/ADR.

## Setup
- Serve the frontend against SIT: `npm run start:local` won't reach SIT routes; for this
  parity check serve the SIT config or just point a browser at the deployed SIT frontend.
  Direction data comes from `GET /api/routes` on the live SIT backend.
- SIT admin login (only needed to reproduce the sweep, not for the parity check):
  `admin@system.local` / `P@ssw0rd`.
- Check light **and** dark mode where the selector renders.

## Parity checks (must behave EXACTLY as before)

1. **Public direction selector shows only real routes.**
   Open `/home` (anonymous). The direction/route selector lists the two real routes
   (`chonburi_bangkok`, `bangkok_chonburi`) and **no** `TEST-` route.
   → Same as before. The narrowed guard `/^TEST-/` still hides any `TEST-` fixture.

2. **A real route whose slug merely contains `e2e` is NOT hidden (the fix).**
   This is the one intended difference, and it only affects hypothetical real data — there
   is no such route on SIT today, so `/home` looks unchanged. Covered by the unit test
   `route-map.service.spec.ts` → "hides only ^TEST- slugs, not real slugs containing e2e".

3. **First-active-route resolution unchanged.**
   Any surface that auto-selects the first active route still lands on `chonburi_bangkok`
   (order preserved; only `TEST-` filtered).

## Sweep behavior (test-infra, not user-facing) — optional reproduction
4. Run the SIT-LIVE proof spec: it seeds a `TEST-` route + ScheduleSet on SIT, runs
   `sweepSitTestLitter`, and asserts both are gone. It is self-cleaning.
   `npx playwright test e2e/tests/obrs-617-sit-sweep.spec.ts`
5. After running `admin-critical-paths.spec.ts`, `GET https://sit-obrs-backend.koyeb.app/api/routes`
   returns **only** the two real routes (no `TEST-e2e-schedules-route` left behind).

## Evidence
- Live SIT probe 2026-07-24: old regex vs `/^TEST-/` on all 3 real routes = **NO DIFF**
  (test route stays hidden, both real routes stay visible).
- AC-1 executed: ScheduleSet id=1 + route id=3 deleted; SIT now 2 routes / 0 scheduleSets.
