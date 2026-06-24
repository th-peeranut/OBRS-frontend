# Walk-in sell page is a single-screen POS, not a wizard

The staff walk-in sell page (`/staff/sell`, `modules/staff/pages/sell/SellPageComponent`) was a 5-step wizard
(search → seats → passengers → payment → ticket). It is now a single-screen, three-column point-of-sale layout
modelled on a physical counter terminal: a date-driven trip browser on the left, the seat map and trip tabs in the
centre, and the customer form plus payment on the right. The wizard is fully replaced — `SellPageComponent` is
rewritten in place and the old step flow is no longer reachable.

The page is decomposed as a **smart parent + three dumb children** (all under `modules/staff/`):

- `WalkInTripBrowserComponent` (left) — `p-calendar` date picker; on date change emits to the parent, which calls
  `StaffApiService.getWalkInSchedules(date)` → `GET /api/private/schedules/walk-in`. Renders route-grouped trip rows,
  each with plate, driver (em-dash when null), and three availability badges (available / reserved-unpaid /
  sold-paid). Empty day → empty state, never an error.
- `WalkInCenterPanelComponent` (centre) — `p-tabView` (Ticket Sales / Trip Details / Boarding), trip headline,
  from/to stop times, passenger-type avatars, and the seat map. Reuses `app-passenger-seat-bus` /
  `app-passenger-seat-van`; BUS is fed `[takenSeats]` (complement of `availableSeatNumbers`), VAN
  `[availableSeatNumbers]`; both get `[gender]="'MALE'"` purely to bypass the components' empty-gender click gate.
- `WalkInCheckoutComponent` (right) — lean reactive form, payment tiles, cash/change, gated Sell button.

`SellPageComponent` owns all cross-column state (selected date/trip/seats, booking ids, idempotency key) and
orchestrates `createWalkInBooking` → `payWalkIn` → badge refresh → navigate to `/e-ticket`. No new NgRx slice; the
existing `invokeSetBookingApi` action is reused for the e-ticket hand-off.

Two product decisions are baked into the UI and documented backend-side in
`../OBRS-backend/docs/adr/0013-lean-walk-in-customer-fields.md` and `0014-walk-in-cash-only-v1.md`:

- **Lean fields** — only contact title + first/last name + phone are required; ID card and email are optional; there
  is no per-passenger identity and no `gender` field (the `STAFF.SELL.GENDER_*` i18n keys were removed). The booking
  payload omits `gender` and omits ID/email when blank.
- **Cash-only v1** — the Cash tile is active and reuses the unchanged `payWalkIn` flow; PromptPay and Credit-card
  tiles render disabled (`aria-disabled`, `tabindex="-1"`, "coming soon") with no Omise code path. The Sell button is
  gated on a valid contact, ≥1 seat, and `cashReceived >= total > 0`, with live change-due.

## Considered Options

- **Keep the 5-step wizard, relax fields only** — smallest change. Rejected: the wizard's step-by-step data entry is
  the dominant source of counter friction during peak season; the redesign exists to remove it, not just trim fields.
- **One monolithic `SellPageComponent`** (no child components) — fewer files. Rejected: the three columns have
  genuinely independent concerns (data list / seat map+tabs / form+payment); the smart-parent/dumb-child split keeps
  state ownership in one place while isolating each pane's template and interactions.
- **A second page alongside the wizard** — lower risk, no rewrite. Rejected: two parallel sell flows to maintain and
  to keep in i18n/contract sync; the wizard offered nothing the POS does not.

## Contract dependency

The page depends on `GET /api/private/schedules/walk-in?date=YYYY-MM-DD` (date-browse, whole-trip badge counts,
plate/driver, `availableSeatNumbers`). The booking and cash-payment endpoints (`POST /api/private/bookings`,
`POST /api/private/payments/walk-in`) are reused unchanged. See `../OBRS-backend/docs/api/scheduling.md`.
