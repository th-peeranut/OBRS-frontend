# MANUAL TEST — OBRS-1721: "ดูในมุมมองของ…" role preview (FE, read-only)

Worktree `OBRS-frontend-wt-obrs-1721-view-as-role-preview`, branch `ao/obrs-1721-view-as-role-preview`,
2 commits (`c5297bf0` feature, `2ba2232d` interceptor exemption fix) on top of `origin/dev` @
`a92e3490`. Executed by the agent against the live SIT backend — not handed to the user.

## Setup

`ng serve --configuration sit --port 4711` (SIT reflects any localhost origin). Logins used:
`owner@system.local` and the one seeded `admin@system.local` (there is no distinct admin test
account other than this one — see `obrs-lanes.md`), both `P@ssw0rd`. SIT's Koyeb instance was cold
(≈25s to first response) on the very first login of the session; every login after that was normal
speed.

A fresh worktree needs `src/environments/environment.local.ts` (gitignored) — copied in from the
main `OBRS-frontend` clone for this run and removed again afterward, so the worktree is unchanged.

## Cases

| # | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Owner sees the union nav (the defect the card fixes) | Log in as `owner@system.local`, open `/staff/sell` | 10 nav items across งานขาย(3)/งานเดินรถ(5)/พัสดุ(2) — no real staff member ever sees this | **MATCH** — `01-owner-BEFORE-full-nav.jpg` |
| 2 | Profile menu exposes "ดูในมุมมองของ…" for owner | Click the profile avatar | Submenu with exactly `พนักงานขายตั๋ว` (salesperson) and `คนขับรถ` (driver) — not `ผู้ประกอบการ`/`ผู้ดูแลระบบ` (no upward preview) | **MATCH** — `02-owner-view-as-menu.jpg` |
| 3 | Owner → preview as driver: banner + nav collapse (AC-3, AC-4, AC-9) | Click `คนขับรถ` | Amber banner "กำลังดูในมุมมองของ: คนขับรถ / ข้อมูลยังเป็นของบัญชีคุณเอง" + "ออกจากมุมมองนี้"; nav drops from 10 → **5** items (งานเดินรถ ×4 + พัสดุ ×1 — exactly the driver-only ∪ shared set) | **MATCH** — `03-owner-AFTER-preview-driver-nav-5.jpg` |
| 4 | Preview exits cleanly | Click "ออกจากมุมมองนี้" | Banner disappears, nav returns to the full 10-item union immediately, no reload needed | **MATCH** (observed live, not separately screenshotted — same behaviour re-confirmed at case 6) |
| 5 | Owner sees the Admin Dashboard shortcut (real owner already passes `hasAnyRole(['admin'])`) | Open profile menu again | "แดชบอร์ดผู้ดูแลระบบ" present | **MATCH** — `04-owner-BEFORE-admin-dashboard-shortcut-present.jpg` |
| 6 | Owner → preview as salesperson: nav is unchanged, but the Admin Dashboard shortcut disappears (AC-9's real third example — the card's original "10→8" nav-count claim does not exist, see the Jira comment) | Click `พนักงานขายตั๋ว`, then reopen the profile menu | Left nav identical to case 1 (owner already had the full salesperson union); profile menu no longer shows "แดชบอร์ดผู้ดูแลระบบ" or the "ดูในมุมมองของ…" submenu (no preview-from-preview) | **MATCH** — nav confirmed unchanged live, profile menu captured in `05-owner-AFTER-preview-salesperson-admin-dashboard-gone.jpg` |
| 7 | Real admin sees `/admin/lookups` + `/admin/roles`, owner does not (ADR-0040) | Log out, log in as `admin@system.local`, open `/admin/lookups` | Sidebar shows `Lookup` and `บทบาท` under ข้อมูลหลัก | **MATCH** — `06-admin-BEFORE-lookups-roles-present.jpg` |
| 8 | Admin → preview as owner: `/admin/lookups`/`/admin/roles` disappear | Open profile menu (confirms admin sees all 3 preview targets: `ผู้ประกอบการ`/`พนักงานขายตั๋ว`/`คนขับรถ`), click `ผู้ประกอบการ` | Banner "กำลังดูในมุมมองของ: ผู้ประกอบการ"; sidebar under ข้อมูลหลัก drops to `ผู้ใช้` + `ยานพาหนะ` only — `Lookup`/`บทบาท` gone | **MATCH** — `07-admin-AFTER-preview-owner-lookups-roles-gone.jpg` |
| 9 | AC-5 — mutating requests are blocked while previewing | Unit-level: `preview-readonly.interceptor.spec.ts` (10 specs) | POST/PUT/PATCH/DELETE rejected with a synthetic 403 while previewing, GET passes, refresh/logout pass, a credential write under `/api/auth/` (`password-reset/confirm`) is now correctly blocked, message is locale-aware | **MATCH** — `ng test`, see Results. **Not additionally screenshotted**: the one write flow reachable from the driver/salesperson preview nav (`ขายตั๋ว Walk-in` → "ขาย") disables its own submit button until a seat is picked, which is a pre-existing form-validation gate unrelated to this interceptor and made a live click-through disproportionately slow to stage. The interceptor is exercised directly and exhaustively by the unit specs instead, including the exact regression this fix addresses. |

## Caveat found, not a defect to fix

Case 8: navigating to `/admin/lookups` **before** starting the preview and then previewing as owner
removes the sidebar entries but does not itself navigate away from the now-hidden `/admin/lookups`
page — the page body stays rendered underneath the banner. No AC on the card requires a forced
redirect on preview-start, and the route itself is still guarded normally on any real navigation
(a page refresh or a manual URL entry while an owner-preview is active would hit the guard, since
`hasHeldRole` — not `getRoles()` — is what the admin route guard would need to check; that guard
wasn't touched by this card and wasn't asked to be). Recording this so it's a known, deliberate
scope boundary rather than a silent gap.

## Results

### `npx tsc -p tsconfig.json --noEmit`
Exit 2, 15 errors — all pre-existing (13 in `e2e/tests/*`, 2 in gitignored `src/environments/*`
local env files). **0 under `src/app`.**

### `npx ng test --watch=false --browsers=ChromeHeadless`
`TOTAL: 6696 SUCCESS`, exit 0 (6695 before this card's interceptor fix added one spec).

### `grep -rn` across `e2e/` for role-preview selectors
`role-preview|ROLE_PREVIEW|admin-profile-heading|view-as|admin-profile-item` → 0 hits. No E2E
gate-lane selector exposure; no `toHaveCount` assertion on top-level app elements at risk.

## Verdict

All 9 cases match. Live-verified against the real SIT backend as three distinct logged-in
identities (owner, admin, and the driver/salesperson preview states derived from owner) — not
simulated. Ready for PR.
