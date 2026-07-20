# Booking Policy Config (OBRS-564)

Admin config for the two real booking-policy numbers — advance-booking cap
(days) and minutes-before-departure cutoff — `GET`/`PUT
/api/private/admin/configs/booking-policy` (backend guard `hasRole('OWNER')`;
`ROLE_GRANTS` admits ADMIN automatically, per the OBRS-446 comment on
`AuthService`).

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
- **Title**: rendered once, inside the `admin-card-head` — the shell topbar
  additionally renders the route `data.titleKey`/`subtitleKey`
  (`ADMIN.PAGES.BOOKING_POLICY_CONFIG` / `ADMIN.BOOKING_POLICY_CONFIG.SUBTITLE`),
  same as every other admin page (design-system.md §7).
- **Nav**: gated on `authService.hasAnyRole(['admin', 'owner'])` in
  `admin-layout.component.ts`, section `'system'`, icon `event_available` —
  the nav gate matches the route's `requiredRoles: ['admin', 'owner']`
  exactly, so there is no dead menu entry.

## Side effects an owner should know about (see i18n helper copy)

- **Walk-in counter sales are exempt from both limits** — only the online
  booking flow is gated by `maxAdvanceDays`/`cutoffMinutes`.
- **`cutoffMinutes` also drives the "near-full seat" alert** threshold — it is
  not a booking-policy-only knob.
