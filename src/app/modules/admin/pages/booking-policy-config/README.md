# Booking Policy Config (OBRS-564)

Config for the two real booking-policy numbers — advance-booking cap (days)
and minutes-before-departure cutoff.

**Two backend surfaces, chosen by the role actually held (OBRS-1454):**

| signed in as | endpoint | what the save writes |
| --- | --- | --- |
| OWNER | `GET`/`PUT /api/private/owner/configs/booking-policy` | this operator's override |
| ADMIN | `GET`/`PUT /api/private/admin/configs/booking-policy` | the platform default |

⛔ This page used to call the admin pair for everybody, and this file used to
say its guard was `hasRole('OWNER')`. Both were wrong from OBRS-825 onwards,
which narrowed that endpoint to `hasRole('ADMIN')` — so an owner filling in the
form got a **403 on Save**. The backend's role hierarchy runs one way
(ADMIN > OWNER); this frontend's `ROLE_GRANTS` is symmetric, which is why
`hasAnyRole` cannot be used to pick the surface (see
`booking-policy-config.store.ts`).

## Why this card exists

A usability report against `/business-policy` found the page claiming "ซื้อ
ล่วงหน้าได้ 60 วัน / ต้องซื้อก่อนออก 12 ชั่วโมง" — **neither number was real**:
there was no advance-booking cap in the code at all, and the actual cutoff was
20 minutes, hardcoded in i18n. This page makes both numbers real, owner
-editable at runtime, and the public policy page (and `home-booking`'s
date-picker `maxDate`) now render them from `GET /api/booking-policy` (public,
`BookingPolicyService`) instead of ever hardcoding them in `public/i18n/*.json`
again.

## UI conventions reused (no new pattern)

This page is a structural mirror of `../reminder-config/reminder-config-page.component.ts`
(see that file's own header comment) — same SWR store base
(`AdminCollectionStore`), same pristine-only patch-on-later-emission form
contract, same `save()` shape. Two deliberate differences, both called out in
the component's own header comment:

- **Validator has a closed range, not just "positive"**: `integerRangeValidator(min, max)`
  (`booking-policy-config-page.validators.ts`) returns `{required}` /
  `{notInteger}` / `{outOfRange:{min,max}}` — `maxAdvanceDays` is `(1, 365)`,
  `cutoffMinutes` is `(1, 1440)`, matching the backend's own bounds.
- **Focus management on a failed submit**: `markAllAsTouched()` then move
  focus to the first invalid control — `reminder-config` doesn't do this;
  adding it here is deliberate (UX spec).

Nothing else here is a new design-system pattern:

- **Shell**: `admin-page-intro` (with `app-admin-refresh-hint`) + `admin-card`
  + `admin-form-grid`, identical to every other singleton-config admin page.
- **Control**: native `<input type="number">` (`admin-field`), same as every
  sibling config page — **not** `p-inputNumber`; introducing a third control
  look for "integer in a config form" has no justification.
- **Button**: one primary (`admin-btn admin-btn-primary`) Save, disabled while
  saving, invalid, or pristine — design-system.md §4.
- **Title**: rendered once, inside the `admin-card-head` — which since OBRS-702
  doubles as the tab's own heading. The shell topbar renders the route
  `data.titleKey`/`subtitleKey`, now `ADMIN.PAGES.SYSTEM_SETTINGS` /
  `ADMIN.BOOKING_POLICY_CONFIG.SUBTITLE` (design-system.md §7).
- **Route / nav (OBRS-702)**: not a standalone page any more. It is the FIRST
  tab of `/admin/settings` (`settings/booking-policy`; the old
  `/admin/booking-policy-config` redirects there), declared in
  `../system-settings/system-settings-tabs.ts` — which is also where its
  `requiredRoles: ['admin', 'owner']` lives, single-sourced for the child route
  AND the rendered tab so the two cannot drift. There is no sidebar entry of its
  own; one "System settings" entry covers every tab. Being FIRST is
  load-bearing: `/admin/settings` redirects its empty path here, so this tab's
  roles must admit everyone the shell admits.

## Side effects an owner should know about (see i18n helper copy)

- **Walk-in counter sales are exempt from both limits** — only the online
  booking flow is gated by `maxAdvanceDays`/`cutoffMinutes`.
- **`cutoffMinutes` also drives the "near-full seat" alert** threshold — it is
  not a booking-policy-only knob.
