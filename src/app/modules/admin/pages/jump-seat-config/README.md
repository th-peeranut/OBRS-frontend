# Jump Seat Config (OBRS-358)

Admin toggle for the jump-seat (walk-in-only seat channel, e.g. minibus seat 1)
— `GET`/`PUT /api/private/admin/configs/jump-seat`, ADMIN-only.

## UI conventions reused (no new pattern)

This page is a byte-for-byte structural mirror of
`../reminder-config/reminder-config-page.component.ts` (see that file's own
header comment) — same SWR store base (`AdminCollectionStore`), same
pristine-only patch-on-later-emission form contract, same `save()` shape.
Nothing here is a new design-system pattern:

- **Shell**: `admin-page-intro` (error/refreshing banner) + `admin-card` +
  `admin-form-grid`, identical to every other singleton-config admin page.
- **Control**: a single `p-inputSwitch` bound via `formControlName="enabled"`
  — the same PrimeNG component already used by
  `notification-preference-row.component.html` (design-system.md §3). No
  hand-rolled toggle.
- **Button**: one primary (`admin-btn admin-btn-primary`) Save, disabled while
  saving or pristine — design-system.md §4 (one primary action per screen).
- **Title**: rendered once, inside the `admin-card-head` — which since OBRS-702
  doubles as the tab's own heading. The shell topbar renders the route
  `data.titleKey`/`subtitleKey`, now `ADMIN.PAGES.SYSTEM_SETTINGS` /
  `ADMIN.JUMP_SEAT_CONFIG.SUBTITLE` (design-system.md §7).
- **Route / nav (OBRS-702)**: not a standalone page any more. It is a tab of
  `/admin/settings` (`settings/jump-seat`; the old `/admin/jump-seat-config`
  redirects there), declared in `../system-settings/system-settings-tabs.ts`.
  It keeps its own `requiredRoles: ['admin']` there, verbatim. Note that this
  does **not** mean admin-only on the frontend: `AuthService.ROLE_GRANTS` grants
  `admin` to `owner` as well as the reverse, so an owner reached this page
  before OBRS-702 and sees this tab after it. The value is recorded intent for
  the day owner-scoping lands, in the same standing as settlements' `['owner']`
  (OBRS-446) — not a narrower gate today.

## Why a config toggle at all

Product decision (OBRS-358 card): the jump seat is a backrest-free reserve
seat sold at staff discretion once normal seats are full. This toggle is the
"flip a setting, not code" kill-switch — disabling it makes every walk-in
jump-seat sale attempt fail server-side (`BOOKING_ERROR_JUMPSEAT_DISABLED`,
mapped in `sell-page.component.ts`'s `mapJumpSeatErrorMessage()`), with **no
effect on the online channel**, which never offers this seat regardless of
this flag.
