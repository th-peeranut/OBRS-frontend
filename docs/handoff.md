# Backend ↔ Frontend Handoff

This file is the two-way coordination channel between the backend and frontend repositories.

- **Backend → Frontend** (Pending Changes): written by the backend after any R0 or R1 contract change. Read
  this before working on any feature that consumes a new or changed endpoint.
- **Frontend → Backend** (Contract Requests): written by the frontend AI when it discovers the contract is
  missing a field, endpoint, or has an incorrect shape. The backend checks this section before closing any
  task that touches related endpoints.

Full contract reference: `../OBRS-backend/docs/api/`

---

## Pending Changes (Backend → Frontend)

## [Backend] 2026-07-08 — `rescheduleCount` added to `GET /api/private/bookings/me` (`BookingRespDto`)
**Risk level**: R1 (additive)
**Triggered by**: OBRS-83 — surfacing the reschedule flow in the customer My Bookings page needed up-front, no-fetch eligibility gating (don't wait for a `RESCHEDULE_ERROR_MAX_COUNT` response to know a booking can't be rescheduled again).

### What changed in the contract
| Endpoint | Change type | Detail |
|---|---|---|
| `GET /api/private/bookings/me` | Field added | `BookingRespDto.rescheduleCount` (int, `0` or `1`) — number of times the booking has been rescheduled; max one reschedule per booking |

### Response shapes before / after
- **Before**: `{ "id": 7, "bookingNumber": "...", "status": "confirmed", ... }` (no `rescheduleCount`)
- **After**: `{ "id": 7, "bookingNumber": "...", "status": "confirmed", "rescheduleCount": 0, ... }`

### Action required in frontend
- [x] Add `rescheduleCount?: number` to `MyBookingDto` (`shared/interfaces/my-booking.interface.ts`)
- [x] Gate the Reschedule card action on `rescheduleCount >= 1` as one of four up-front eligibility checks (`MyBookingsComponent.computeRescheduleEligibility`)

### Still unfinished on backend
- None — see `../OBRS-backend/docs/api/booking.md` `GET /bookings/me`.

---

## [Backend] 2026-06-15 — `payment.status` value renamed from `"success"` to `"paid"`
**Risk level**: R0 (breaking)
**Triggered by**: Terminology alignment — `"success"` described an operation outcome; `"paid"` describes the object's state, consistent with `booking.status = "confirmed"` and `ticket.status = "confirmed"`.

### What changed in the contract
| Endpoint | Change type | Detail |
|---|---|---|
| All endpoints returning `PaymentRespDto` | Field value renamed | `status` field value `"success"` → `"paid"` |
| `POST /api/private/payments` | Value in response | `status` now returns `"paid"` for a successful synchronous charge |
| `POST /api/private/payments/walk-in` | Value in response | `status` now returns `"paid"` |
| `POST /api/webhook/omise` | Side-effect | Terminal-status idempotency guard now checks `"paid"` instead of `"success"` |
| `GET /api/private/bookings/{id}/payments` | Value in list | Payment entries with `status = "success"` are now `"paid"` |

### Response shapes before / after
- **Before**: `{ "status": "success", ... }`
- **After**: `{ "status": "paid", ... }`

The DB `Lookup` slug and all i18n translations (EN: `Paid`, TH: `ชำระแล้ว`, ZH: `已支付`) have been updated. All other status values (`pending`, `failed`, `cancelled`, `expired`, `refunded`, `manual_refund_required`) are unchanged.

### Action required in frontend
- [x] Update any `PaymentStatus` enum / type that has a `SUCCESS = "success"` entry → `PAID = "paid"` — `PaymentStatus` union in `shared/interfaces/payment.interface.ts` now uses `'paid'` (OBRS-177).
- [x] Update display strings / badge labels that check `status === "success"` — badge/label sites (`admin/pages/bookings/bookings-page.component.ts`, `admin/pages/dashboard/*`) already normalized to `'PAID'`; no `success`-keyed labels remained.
- [x] Update any filter/query params that send `status=success` → `status=paid` — none existed (full `src/` sweep; only the Omise mock-scenario header `X-Omise-Mock-Scenario: success` uses the word, and that is a gateway simulation knob, not a status filter — left as-is).
- [x] Search for hardcoded string `"success"` in payment-status contexts — three broken sites fixed via an `isPaidStatus()` predicate (accepts `'paid'`+`'success'`, case-insensitive, mirroring `payment-qrcode.component.ts`'s `isSuccessStatus()`): `payment-creditcard.component.ts` `handlePaymentResponse()`+`isPaymentConfirmed()`, `payment-result.component.ts` `isPaymentConfirmed()`. `payment-qrcode.component.ts` already accepted `'paid'`.

**Resolved 2026-07-09 (OBRS-177).** Verified live: SIT `GET /api/private/bookings/{id}/payments` returns `txn.status = "paid"`, which the fixed predicate now matches (old `=== 'success'` survived only via the `summaryStatus === 'fully_paid'` fallback). 7 new regression specs; full FE suite green.

### Still unfinished on backend
- None — all source, SQL seeds, and API docs are updated.

---

## Contract Requests (Frontend → Backend)

### [Frontend] 2026-08-02 — Driver-cash daily-return close endpoints (OBRS-960): RESOLVED

<!-- contract-request
card: OBRS-960
status: resolved
resolved: 2026-08-02 (backend reconciliation against ao/obrs-960-driver-cash afb440d4)
-->

**RESOLVED.** The coordinator reconciled the frontend against the real `DriverCashController` and its
DTOs. Findings, all fixed in the frontend commit that follows this entry:

1. **Every staff driver-cash URL had the segment order inverted.** The real base is
   `/api/private/driver-cash` with `schedules/{scheduleId}` as a sub-resource (`GET .../day`,
   `POST .../advance`, `POST .../per-head`, `POST .../expense-paid` — note `expense-paid`, not
   `expense`), not `/api/private/schedules/{scheduleId}/driver-cash/...` as first built. Verified
   against `DriverCashController.java:30,36,45,55`.
2. **The owner days endpoints were guessed under `/owner/driver-cash/days/...`.** The real base is
   `/api/private/driver-cash/days/...` — owner-gated by ROLE, not by URL prefix. Verified against
   `DriverCashController.java:65,74,81`.
3. **This card's one genuine SA contract gap** — no list endpoint for the owner's daily-return close
   (surface 3) was ever specified — is now filled: `GET /api/private/driver-cash/days?from=&to=&status=`
   (OWNER-gated, `from`/`to` required `LocalDate`, `status` optional `OPEN`|`RETURNED`), returning a
   **flat** `List<DriverCashDaySummaryRespDto>` (`dayId, driverId, driverName, businessDate, vehicleId,
   vehiclePlate, status, expectedReturnAmount, returnedAmount, discrepancy, hasUnmappedSalesPointRemit`)
   — a list row, not the full day detail, and NOT wrapped in a `{range, items}` page object.
4. **`DriverCashDayRespDto` is flat**, not the nested-`summary` shape the frontend invented: `dayId,
   driverId, driverName, businessDate, vehicleId, status, entries[], advanceTotal, perHeadTotal,
   expensePaidTotal, parcelRemitTotal, expectedReturnAmount, returnedAmount, returnedAt,
   returnedByUserId, returnedByName, discrepancy, discrepancyReason, perHeadRates[],
   hasUnmappedSalesPointRemit`. All four driver-cash POSTs return this SAME DTO — there is no separate
   per-action response type.
5. **No `currency` field anywhere in this feature's DTOs.**
6. **`DriverCashEntryRespDto` (`entries[]` above) had NO `label` field** — the first reconciliation pass
   (item 4 above) still guessed one. The real fields, confirmed field-for-field against source, are:
   `id, type, amount, scheduleId, stopId, headCount, expenseCategory, expenseId, note,
   fromUnmappedSalesPoint, createdAt`. `type` is one of `ADVANCE`/`PER_HEAD`/`EXPENSE_PAID`/`RETURN`
   (the backend's `ck_driver_cash_entries_type` CHECK constraint — `PARCEL_SHARE` was deliberately
   removed and never appears). There is no display label on the wire at all: the frontend now derives
   one from `type` (+ `expenseCategory` for `EXPENSE_PAID`, reusing the existing
   `ADMIN.EXPENSES.CATEGORIES.*` i18n keys) — see
   `DriverCashDayReturnModalComponent.entryTypeLabel()`. This field shape is now confirmed and settled;
   nothing about `DriverCashEntryRespDto` remains open.

Fixed in `src/app/shared/interfaces/driver-cash.interface.ts`, `staff-api.service.ts`,
`admin-api.service.ts`, `driver-cash-day-return-modal.component.ts/.html`, and every other driver-cash
component/store that read the wrong shape. New `HttpTestingController`-based specs in
`staff-api.service.spec.ts` / `admin-api.service.spec.ts` now assert the literal corrected URLs — the
original gap was that every driver-cash spec mocked the service layer instead of asserting the real HTTP
call, so the wrong URLs compiled and tested green. A separate new spec block in
`driver-cash-day-return-modal.component.spec.ts` builds its entry fixture from the backend's own field
names and asserts the rendered row text, so a future missing/renamed field shows up as empty/`"undefined"`
rendered output rather than a silently-typed `undefined` a mocked-interface fixture could never catch.

**Also RESOLVED**: the stop-lookup source for `DriverCashRatesPageComponent`'s add-rate dropdown.
`DriverCashRatesStore` originally filtered `GET /private/lookups` to `category === 'stop'` — confirmed
**wrong**: `LookupCategoryConstant.java` has no `stop` category (only `stop_status`/`stop_type`; stops
are their own entity, never inserted into the generic Lookup table), so that filter would always have
resolved to an empty array. Switched to `StationService.getAll()` (`GET /api/stops`, public/no-auth,
already used by every customer-facing stop picker in this repo) — confirmed via a repo-wide search: no
admin/owner page had a WORKING flat all-stops mechanism before this fix.

### [Frontend] 2026-07-24 — Deep revenue analytics endpoint (OBRS-151): new `GET /reports/revenue-analytics`

<!-- contract-request
card: OBRS-151
status: partially-resolved
resolved: 2026-07-24 (foundation increment)
absent: byRoute :: src/main/java/com/example/demo/dto/response/business/*RevenueAnalytics*.java
absent: byPaymentMethod :: src/main/java/com/example/demo/dto/response/business/*RevenueAnalytics*.java
note: absent: added 2026-08-01 (OBRS-936). Written before the gate accepted this status, so for a week the entry declared nothing checkable and the two breakdowns went unverified. Re-measured against origin/dev that day: 0 hits for either name in the RevenueAnalytics DTO. The foundation (totals + daily trend + period-over-period) IS shipped - that asymmetry is what partially-resolved means.
-->

> **PARTIALLY RESOLVED 2026-07-24.** The **foundation** of this endpoint now exists and is documented:
> backend `ao/obrs-151-revenue-analytics` `57a7cea6` ships `GET /api/private/admin/reports/revenue-analytics`
> with **totals + daily net-revenue trend + period-over-period** (server-computed `netBarPct`/`netChangePct`),
> built on the already-IT-covered `findDailyRevenue` query (ReportService +5 unit tests, 49/49 green). The
> frontend page consuming it shipped on `ao/revenue-analytics-obrs151` (interface/service/store/page/chart/
> i18n/route/nav + specs; ci-smoke green). **Still OPEN:** the **by-route** and **by-payment-method**
> breakdowns below — they need their own native aggregation queries and are the next increment.

**Affected endpoint**: `GET /api/private/admin/reports/revenue-analytics?from&to` — **NEW, does not exist yet.**

**Request type**: new read-only aggregation endpoint (R1 additive; no change to any existing endpoint).

**Why this is a contract request and not FE code**: OBRS-151 ("Revenue analytics and reporting", the *deep*
version of the Lane-A reporting layer) needs server-side revenue breakdowns the existing
`GET /reports/summary` does not provide (per-route, per-payment-method across a range, and
period-over-period). Two house rules forbid faking it on the FE: (1) *"Do not call an endpoint not yet
documented in `../OBRS-backend/docs/api/`"* and (2) money fields are **decimal strings** and *"never do
arithmetic on them client-side"* — so the chart scaling / shares / deltas must be **computed server-side**,
not derived in the browser. Hence this spec instead of a guessed FE implementation.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| New endpoint `GET /reports/revenue-analytics?from&to` | `AdminReportController` | Backs a new "Revenue Analytics" admin page (deep revenue view) |
| `@PreAuthorize("hasAnyRole('ADMIN','OWNER')")`, revenue fields `@JsonInclude(NON_NULL)` | same | Mirror `/summary`'s role model exactly (OBRS-129 revenue-withholding pattern) |
| **Server-computed** `sharePct` / `netChangePct` / `netBarPct` (numbers, 0–100 or signed %) | response DTO | So the FE renders bars, shares and the period delta **without** any money arithmetic — it only formats the decimal-string money for display |

### Proposed response shape (all money = decimal strings, same as `/summary`)
```json
{
  "range":   { "from": "2026-07-01", "to": "2026-07-31", "timezone": "Asia/Bangkok" },
  "totals":  { "net": "125400.00", "paid": "131400.00", "refunded": "6000.00", "currency": "THB" },
  "previousPeriod": {
    "range":  { "from": "2026-06-01", "to": "2026-06-30" },
    "totals": { "net": "110000.00", "paid": "114000.00", "refunded": "4000.00", "currency": "THB" },
    "netChangePct": 14.0
  },
  "byRoute": [
    { "routeId": 3, "routeName": "Bangkok → Chiang Mai", "ticketsSold": 210,
      "revenue": { "net": "84000.00", "paid": "88000.00", "refunded": "4000.00", "currency": "THB" }, "sharePct": 67.0 }
  ],
  "byPaymentMethod": [
    { "method": "credit_card", "count": 180, "revenue": { "net": "90000.00", "paid": "94000.00", "refunded": "4000.00", "currency": "THB" }, "sharePct": 71.8 },
    { "method": "cash",        "count": 60,  "revenue": { "net": "35400.00", "paid": "37400.00", "refunded": "2000.00", "currency": "THB" }, "sharePct": 28.2 }
  ],
  "dailyTrend": [
    { "date": "2026-07-01", "net": "4200.00", "paid": "4200.00", "refunded": "0.00", "currency": "THB", "netBarPct": 34.0 }
  ]
}
```
Semantics to match `/summary` exactly (docs/api/reports.md): `net = paid − refunded`; revenue = Payments
against CONFIRMED bookings bucketed by booking-created-date; `paid` counts `paid` + `manual_refund_required`
(`EPaymentStatus.countsAsPaid`); `refunded` counts `refunded`. `byRoute` ordered by `revenue.net` desc,
`byPaymentMethod` mirrors `/eod-salesperson`'s method vocabulary. `netBarPct` = each day's net as a % of the
max daily net in-range (0–100), `sharePct` = row net / totals net × 100, `netChangePct` = (net − prevNet) /
prevNet × 100 — **all computed on the server** in `BigDecimal`.

### Frontend plan (built once the endpoint is documented — NOT before, per §13)
New `/admin/revenue-analytics` page (or a tab on `reports`), owner/revenue-gated off field presence like
`reports-page`: totals KPI tiles + a period-over-period delta chip (`netChangePct`), an inline-SVG daily
net-revenue trend chart (heights from `netBarPct`), a by-route bar list (`sharePct`), and a by-payment-method
breakdown. Reuses `ReportsMoneyDto`/`formatMoney`, the `p-calendar` range filter, and an export twin
(`revenue-analytics` dataset) matching the on-screen table (ADR-0084).

### Impact if not addressed
OBRS-151's page cannot be built — there is no endpoint to consume, and the deep breakdowns/shares/deltas
cannot be computed client-side without violating the decimal-string-money rule. The follow-on sequence
(OBRS-152 booking-trend, OBRS-153 route-performance, OBRS-154 customer-behavior, OBRS-155 ops-efficiency)
each needs its own analogous aggregation endpoint and will file the same way. **Note:** the SIT/local
environment currently has ~no booking traffic (`dont-extrapolate-metrics-from-a-no-traffic-env`), so these
endpoints should be verified against seeded/synthetic data, and the analytics interpreted with that caveat.

---


### [Frontend] 2026-07-24 — Booking trend analysis endpoint (OBRS-152): new `GET /reports/booking-trend`

<!-- contract-request
card: OBRS-152
status: partially-resolved
resolved: 2026-07-24 (daily increment)
absent: granularity :: src/main/java/com/example/demo/dto/response/business/*BookingTrend*.java
note: absent: added 2026-08-01 (OBRS-936). Daily series + 7-day moving average + day-of-week seasonality + period-over-period + peak are shipped; week/month bucketing is not. Re-measured against origin/dev: 0 hits across all 5 BookingTrend DTOs.
-->

> **PARTIALLY RESOLVED 2026-07-24.** `GET /api/private/admin/reports/booking-trend` now exists (backend
> `ao/obrs-152-booking-trend` `cefc2894`, off the 151 branch — sequential lane) with the **daily** series +
> 7-day moving average + day-of-week seasonality + period-over-period + peak, on the already-IT-covered
> `findDailyVolume` query (ReportService +6 unit tests, 55/55 green). Frontend page on
> `ao/booking-trend-obrs152` (interface/service/store/page/2 charts/i18n/route/nav + specs; ci-smoke green).
> **Still OPEN:** `week`/`month` **granularity** bucketing — this increment is daily only.

**Affected endpoint**: `GET /api/private/admin/reports/booking-trend?from&to&granularity=day|week|month` — **NEW.**
**Request type**: new read-only aggregation (R1 additive). Depends on OBRS-151 lane landing first (sequential).
**Auth**: `hasAnyRole('ADMIN','OWNER')` (no revenue in this endpoint → no role-withholding needed).

Deep version of `/summary`'s daily `bookingCount`. Adds trend decomposition the FE must not compute itself
(counts are cheap ints, but the moving average / growth % / day-of-week seasonality are analytics the
server should own for consistency with the query layer):
```json
{
  "range": { "from": "2026-07-01", "to": "2026-07-31", "timezone": "Asia/Bangkok" },
  "granularity": "day",
  "series": [ { "bucket": "2026-07-01", "bookingCount": 42, "ticketsSold": 61, "movingAvg7": 39.5, "barPct": 88.0 } ],
  "previousPeriod": { "totalBookings": 980, "changePct": 12.4 },
  "byDayOfWeek": [ { "dow": 1, "bookingCount": 210, "sharePct": 18.0 } ],
  "peak": { "bucket": "2026-07-14", "bookingCount": 73 }
}
```
Server-computed: `movingAvg7`, `barPct` (bucket count / max bucket count × 100), `sharePct`, `changePct`.
**FE plan** (built once documented): `/admin/booking-trend` page — granularity toggle, inline-SVG trend line
(heights from `barPct`), a day-of-week bar strip (`sharePct`), and a period-over-period delta chip.
**Impact if not addressed**: OBRS-152 page cannot be built (no endpoint). No-traffic caveat applies.

---

### [Frontend] 2026-07-24 — Route performance metrics endpoint (OBRS-153): new `GET /reports/route-performance`

<!-- contract-request
card: OBRS-153
status: partially-resolved
resolved: 2026-07-24 (ticket-grained increment)
absent: loadFactor :: src/main/java/com/example/demo/dto/response/business/*RoutePerformance*.java
note: absent: added 2026-08-01 (OBRS-936). Departures + tickets sold + net revenue + revenueSharePct are shipped, ticket-grained; seat-level load factor / occupancy is not. Re-measured against origin/dev: 0 hits across the 3 RoutePerformance DTOs.
-->

> **PARTIALLY RESOLVED 2026-07-24.** `GET /api/private/admin/reports/route-performance` now exists
> (backend `ao/obrs-153-route-performance` `551e1930`, off the 152 branch) with per-route **departures +
> tickets sold + net revenue + revenueSharePct**, ticket-grained (each ticket carries route_id +
> net_price_snapshot → revenue attributes unambiguously). Validated by a **real Testcontainers IT**
> (`RoutePerformanceIT`, 4/4 against postgres:17-alpine) + ReportServiceTest +3. Frontend page on
> `ao/route-performance-obrs153` (table + revenue-share bars + tiles; 7 specs, ci-smoke green).
> **Still OPEN:** seat-level **load-factor / occupancy** — needs the seat-map + jump-seat + OPEN/ASSIGNED
> semantics the /summary occupancy query carries.

**Affected endpoint**: `GET /api/private/admin/reports/route-performance?from&to` — **NEW.**
**Request type**: new read-only aggregation (R1 additive). Sequential after OBRS-152.
**Auth**: `hasAnyRole('ADMIN','OWNER')`; revenue fields `@JsonInclude(NON_NULL)` (OBRS-129 withholding pattern).

Per-route performance the existing reports don't break out. Load factor / share are server-computed:
```json
{
  "range": { "from": "2026-07-01", "to": "2026-07-31", "timezone": "Asia/Bangkok" },
  "routes": [
    { "routeId": 3, "routeName": "Bangkok → Chiang Mai", "departures": 62,
      "seatsSold": 1240, "seatCapacity": 1860, "loadFactorPct": 66.7,
      "cancelledDepartures": 1, "cancellationRatePct": 1.6,
      "revenue": { "net": "84000.00", "paid": "88000.00", "refunded": "4000.00", "currency": "THB" },
      "revenueSharePct": 41.0 }
  ],
  "totals": { "seatsSold": 3020, "seatCapacity": 4800, "loadFactorPct": 62.9,
              "revenue": { "net": "205000.00", "paid": "215000.00", "refunded": "10000.00", "currency": "THB" } }
}
```
Occupancy/`loadFactorPct` follows `/summary`'s occupancy semantics (bucketed by departure date). Ordering:
`revenue.net` desc, then `loadFactorPct` desc. Server-computed: `loadFactorPct`, `cancellationRatePct`,
`revenueSharePct`. **FE plan**: `/admin/route-performance` sortable table + a load-factor bar column +
top-N-routes-by-revenue bar list. **Impact**: OBRS-153 page cannot be built. No-traffic caveat applies.

---

### [Frontend] 2026-07-24 — Customer behavior analysis endpoint (OBRS-154): new `GET /reports/customer-behavior`

<!-- contract-request
card: OBRS-154
status: partially-resolved
resolved: 2026-07-24 (counts-only increment)
absent: leadTime :: src/main/java/com/example/demo/dto/response/business/*CustomerBehavior*.java
note: absent: added 2026-08-01 (OBRS-936). Aggregate counts (distinct/returning, channel split, repeat histogram) are shipped; booking lead-time percentiles are not - PERCENTILE_CONT has 0 hits anywhere in backend src/main, and leadTime has 0 across the 3 CustomerBehavior DTOs. Re-measured against origin/dev.
-->

> **PARTIALLY RESOLVED 2026-07-24.** `GET /api/private/admin/reports/customer-behavior` now exists
> (backend `ao/obrs-154-customer-behavior` `ecacdcd6`, off the 153 branch) — aggregate-only (no PII):
> total bookings, distinct/returning customers + rate, avg per customer, channel split, repeat
> histogram. Two new native GROUP-BY queries; validated by a **real Testcontainers IT**
> (`CustomerBehaviorIT`, 2/2 against postgres:17-alpine) + ReportServiceTest +4. Frontend on
> `ao/customer-behavior-obrs154` (tiles + channel + repeat bars; 7 specs, ci-smoke green).
> **Still OPEN:** booking **lead-time percentiles** (p50/p90) — needs a PERCENTILE_CONT aggregate.

**Affected endpoint**: `GET /api/private/admin/reports/customer-behavior?from&to` — **NEW.**
**Request type**: new read-only aggregation (R1 additive). Sequential after OBRS-153.
**Auth**: `hasAnyRole('ADMIN','OWNER')`. PII: return **aggregates only** — no per-customer rows, no names/emails.

```json
{
  "range": { "from": "2026-07-01", "to": "2026-07-31", "timezone": "Asia/Bangkok" },
  "totalCustomers": 640, "newCustomers": 210, "returningCustomers": 430, "returningRatePct": 67.2,
  "avgBookingsPerCustomer": 1.8,
  "leadTimeDays": { "p50": 3, "p90": 12, "avg": 5.4 },
  "cancellationRatePct": 4.1,
  "bookingsByChannel": [ { "channel": "web", "bookingCount": 820, "sharePct": 71.0 }, { "channel": "walk_in", "bookingCount": 335, "sharePct": 29.0 } ],
  "repeatDistribution": [ { "bookings": 1, "customers": 430, "sharePct": 67.2 }, { "bookings": 2, "customers": 150, "sharePct": 23.4 } ]
}
```
Server-computed: every `*Pct`, the percentiles, and `avgBookingsPerCustomer`. **FE plan**:
`/admin/customer-behavior` page — new-vs-returning donut/bar, lead-time distribution, channel split
(`sharePct`), repeat-frequency histogram. **PII note**: strictly aggregate; no drill-down to individuals.
**Impact**: OBRS-154 page cannot be built. No-traffic caveat applies.

---

### [Frontend] 2026-07-24 — Operational efficiency reports endpoint (OBRS-155): new `GET /reports/ops-efficiency`

<!-- contract-request
card: OBRS-155
status: partially-resolved
resolved: 2026-07-24 (departures + seat-fill increment)
absent: vehicleUtilization :: src/main/java/com/example/demo/dto/response/business/*OpsEfficiency*.java
absent: refundRate :: src/main/java/com/example/demo/dto/response/business/*OpsEfficiency*.java
note: absent: added 2026-08-01 (OBRS-936). Departure completion + seat fill + per-vehicle-type breakdown are shipped; fleet-vehicle utilization and refund rate are not. Re-measured against origin/dev: 0 hits for either in the OpsEfficiency DTO.
-->

> **PARTIALLY RESOLVED 2026-07-24.** `GET /api/private/admin/reports/ops-efficiency` now exists
> (backend `ao/obrs-155-ops-efficiency` `0488907e`, off the 154 branch) — departure completion
> (scheduled/completed/cancelled) + seat fill (sold/capacity) + per-vehicle-type breakdown. Two new
> native queries merged by vehicle type; validated by a **real Testcontainers IT** (`OpsEfficiencyIT`,
> 2/2 against postgres:17-alpine) + ReportServiceTest +3. Frontend on `ao/ops-efficiency-obrs155`
> (tiles + per-type fill-rate table; 7 specs, ci-smoke green). **Still OPEN:** fleet-vehicle
> **utilization** (utilized vs active vehicles) and **refund rate** — separate aggregates.

**Affected endpoint**: `GET /api/private/admin/reports/ops-efficiency?from&to` — **NEW.**
**Request type**: new read-only aggregation (R1 additive). Sequential after OBRS-154; last in the lane.
**Auth**: `hasAnyRole('ADMIN','OWNER')`.

Fleet/utilization efficiency across the range, aggregating schedules/departures/vehicles:
```json
{
  "range": { "from": "2026-07-01", "to": "2026-07-31", "timezone": "Asia/Bangkok" },
  "fleet": { "activeVehicles": 12, "utilizedVehicles": 11, "utilizationPct": 91.7 },
  "departures": { "scheduled": 340, "completed": 332, "cancelled": 8, "completionRatePct": 97.6 },
  "seatUtilization": { "seatsSold": 3020, "seatCapacity": 4800, "fillRatePct": 62.9 },
  "refunds": { "count": 41, "grossRefunded": "10000.00", "currency": "THB", "refundRatePct": 3.4 },
  "byVehicleType": [ { "vehicleType": "van_13", "departures": 210, "fillRatePct": 58.0, "sharePct": 63.0 } ]
}
```
Server-computed: all `*Pct` / `*Rate`. Money (`grossRefunded`) stays a decimal string. Reuse `/refund-void`'s
refund semantics where they overlap. **FE plan**: `/admin/ops-efficiency` KPI tiles (utilization, completion,
fill rate, refund rate) + a per-vehicle-type fill-rate bar list. **Impact**: OBRS-155 page cannot be built.
No-traffic caveat applies.

---

### [Frontend] 2026-07-19 — `code` optional/server-generated on inspection-item create (OBRS-529): built ahead of the paired backend worktree

<!-- contract-request
card: OBRS-529
status: resolved
resolved: 2026-07-19
-->

**Affected endpoint**: `POST /api/private/vehicle-inspection-items` (`VehicleInspectionItemReqDto.code`).

**Request type**: relax an existing required field (additive-safe from the FE's side — R1).

**Status at time of writing**: built per the OBRS-529 task brief, which states the backend half of this
same card is making `code` server-generated and optional on create. Checked the paired backend worktree
(`OBRS-backend-wt-obrs-529-inspection-label-th-only`) directly — at time of writing it is still at
`origin/dev` HEAD (`VehicleInspectionItemReqDto.code` is still `@NotBlank`). This is the same parallel-lane
build pattern already used for OBRS-96/OBRS-129/OBRS-305/etc. above, not an assumption that the relaxed
contract already exists.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `code` becomes optional (no `@NotBlank`) on `POST /api/private/vehicle-inspection-items`, server-generates a value when omitted | `VehicleInspectionItemReqDto` | The admin create/edit modal no longer has a `code` input at all (OBRS-529 card, item 3) — there is nothing left in the FE to source a value from on create |

### What the frontend implemented (additive-safe)
- The create/edit modal's `code` `FormControl` and its three validators (`required`/`maxLength`/`pattern`) are removed entirely — `code` is never rendered or collected in the UI anymore.
- `InspectionItemPayload.code` (`admin-api.service.ts`) is now optional (`code?: string`). **CREATE** omits the field from the request body entirely (`InspectionItemsPageComponent.toPayload()`). **EDIT** still forwards the item's existing, unchanged `code` (read from the row, not a control) so the update path keeps working regardless of whether the backend has relaxed the constraint yet.
- `resolveInspectionItemLabel()`'s raw-`code` last-resort fallback (OBRS-529 item 1) is unaffected — it still reads `code` from the GET response, which the backend continues to return either way. (The list table's `code` **column** was subsequently removed too — owner decision, later the same day: with `code` server-generated the owner has no reason to read it, and keeping a column while collapsing three label lines to one would have kept the scanning cost this card exists to cut.)

### Impact if not addressed
CREATE will 400 with a bean-validation error on the now-always-absent `code` field until the backend relaxes `@NotBlank`/server-generates it. EDIT is unaffected either way (it still sends the item's real code). Do not merge/deploy the frontend half until the backend confirms `code` is optional on create — track against the paired backend worktree `OBRS-backend-wt-obrs-529-inspection-label-th-only`.

### RESOLVED 2026-07-19
The backend half landed in the paired worktree as `929fbe8a`: `code` is gone from
`VehicleInspectionItemReqDto` entirely (a client still sending it is silently ignored, matching how
`displayOrder` already behaves), server-generated on CREATE by slugifying the EN label — falling back to
the TH label — and deliberately never regenerated on UPDATE. `mvn clean verify` green: surefire 2330 /
failsafe 646, 0 failures. Nothing is pending on this request; both halves merge together.

---

### ✅ RESOLVED — [Frontend] 2026-07-14 — Parcel consigned intake + delivery handoff + public tracking (OBRS-305 Card 2): one assumed endpoint + one shape ambiguity

<!-- contract-request
card: OBRS-305
status: resolved
resolved: 2026-07-17 (OBRS-460) - backend commit 55250fd6 feat(OBRS-305), the SAME card's other half, landed the endpoint on 2026-07-14: ScheduleController.getConsignedParcelsForSchedule (@GetMapping PRIVATE_SCHEDULES + "/{id}/parcels/consigned", @PreAuthorize hasRole('DRIVER') exactly as asked) -> ParcelDeliveryService.listConsignedByScheduleId -> ParcelRepository.findByScheduleIdAndParcelTypeOrderByCreatedAtAsc, returning ParcelDeliveryListItemRespDto.
-->

> **RESOLVED 2026-07-17 (OBRS-460).** The "ASSUMED, does not exist yet" endpoint below **exists** — it was
> shipped the same day this entry was written, by the backend half of **this same card** (`55250fd6
> feat(OBRS-305)`), with the exact path and role gate requested. The parallel-lane pattern worked; nobody came
> back to close the note, so the entry kept reading as an open gap. The `pickupStop`/`dropoffStop` shape
> question is still unconfirmed, but `parcelStopLabel()` degrades gracefully by design (worst case a stop
> renders its `code` instead of a name), so it is not a blocker. Entry kept for history.

**Affected endpoint**: `GET /api/private/schedules/{scheduleId}/parcels/consigned` (new, ASSUMED)
**Also affected**: `pickupStop`/`dropoffStop` shape on `ParcelTrackRespDto` (`GET /api/parcels/track/{tn}`) and `WaybillRespDto` (`GET /api/private/parcels/{id}/waybill`)

**Request type**: New endpoint + shape clarification.

**Status at time of writing**: built against
`../OBRS-backend/docs/api/parcels-consigned-delivery.md` for every endpoint it
documents. That doc lists per-parcel action endpoints
(`/load`, `/arrived`, `/collect`, `/waybill`) but no "list consigned parcels
for a schedule" GET, which the delivery-handoff list
(`/staff/parcels/deliveries/:scheduleId`) needs to enumerate rows. See
`docs/adr/0020-parcel-consigned-delivery-frontend.md` Decision 3 — this is the
same parallel-lane build pattern already used for OBRS-96/OBRS-129/OBRS-130
above (see those entries), not an assumption that an undocumented endpoint
already exists.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `GET /api/private/schedules/{scheduleId}/parcels/consigned` → `ParcelDeliveryListItemDto[]` = `{ parcelId, trackingNumber, senderName, senderPhone, recipientName, recipientPhone, pickupStop, dropoffStop, weightKg, deliveryStatus }[]`. Same role gate as `/load`/`/arrived`/`/collect` (`hasRole('DRIVER')`, which the role hierarchy note in the API doc says also admits SALESPERSON/OWNER/ADMIN) | New endpoint | Backs `ParcelDeliveryListPageComponent`'s per-schedule manifest — the row source for the load/arrived/collect action buttons |
| Confirm the exact shape of `pickupStop`/`dropoffStop` on `ParcelTrackRespDto` and `WaybillRespDto` | Existing documented endpoints (`GET /api/parcels/track/{tn}`, `GET /api/private/parcels/{id}/waybill`) | The doc names these fields without specifying their shape beyond the field name. FE modeled `ParcelStopRefDto { code?, slug?, name?, label? }` (a superset of the shapes already used elsewhere in this codebase for a "stop reference" — `SegmentStopRefDto{slug,name}` from the segments endpoint, `RouteStopTimeDto.stop{code}` from route-stops) and resolves a display label via `parcelStopLabel()` (`shared/lib/parcel-stop-label.ts`), which tries `name` → `label` → `code` → `slug` → falls back to `'-'`. This degrades gracefully regardless of which shape the real response uses, but the exact shape should be confirmed and, ideally, made consistent with one of the codebase's existing stop-ref shapes rather than a third variant. |

### What the frontend implemented (additive-safe)
- `StaffApiService.getConsignedParcelsForSchedule()` (new method) and
  `ParcelDeliveryListStore` (component-scoped `AdminCollectionStore`
  subclass) are additive — no existing endpoint or field touched.
- `parcelStopLabel()` is deliberately resilient to shape variance (see above)
  so the delivery-list/waybill/tracking pages don't break on whichever real
  shape the backend returns; only the *label chosen* would differ from the
  intended one if the real shape doesn't match the assumed field-name
  priority.

### Impact if not addressed
The delivery-handoff list (`/staff/parcels/deliveries/:scheduleId`) is
implemented and additive-safe (new route, new nav entry point, no existing
endpoint/field touched), but functionally inert until the backend ships this
endpoint — the list will show its error state and no parcel can be
loaded/marked-arrived/collected from this page. The stop-ref shape gap
degrades gracefully (worst case: a stop renders its `code`/`slug` instead of
a human name) rather than breaking, but should still be confirmed. Do not
merge/deploy until the backend confirms both — track against the paired
backend worktree `OBRS-backend-wt-obrs-305-parcel-consigned-delivery` before
promoting either side.

---

### ✅ RESOLVED — [Frontend] 2026-07-14 — `seatingMode` missing on `GET /api/private/schedules/walk-in` (`WalkInTripRespDto`) (OBRS-324, open-seating epic 318-d)

<!-- contract-request
card: OBRS-324
status: resolved
resolved: 2026-07-16 (OBRS-452) - OBRS-360 shipped WalkInTripRespDto.seatingMode:87; ScheduleWalkInBrowseIT pins per-schedule passthrough. This is the entry whose dead claim had spread into 5 code comments, one of them a passing test's NAME.
-->

> **RESOLVED 2026-07-16 (OBRS-452).** **OBRS-360** shipped exactly what this asked for: `WalkInTripRespDto.seatingMode` exists, `findWalkInSchedulesByDate` selects `s.seating_mode AS seatingMode`, and `ScheduleWalkInBrowseIT` (extended by OBRS-386) pins per-schedule passthrough to the DTO. So the "will not activate for any real trip" and "every walk-in trip reads as ASSIGNED today" claims below are **historical, not current** — OBRS-324's OPEN sell flow is live. Nothing further is needed from the backend; the entry is kept for history.
>
> Nothing grepped this entry when OBRS-360 falsified it, so the same stale claim sat in 5 places across `staff-api.service.ts`, its spec, `sell-page.component.ts` and `walk-in-center-panel.component.ts` for two days — OBRS-452 corrected all of them together.

**Affected endpoint**: `GET /api/private/schedules/walk-in` (`WalkInTripRespDto`, consumed by the staff walk-in/POS sell page).

**Request type**: field addition (additive, R1) — not blocking, worked around for now.

**What I found**: 318-a (OBRS-321) added `schedules.seating_mode` and exposed it as `seatingMode` on `ScheduleRespDto` and `ScheduleSearchRespDto` (see `docs/api/scheduling.md`, and the FE precedent `Schedule.seatingMode` in `shared/interfaces/schedule.interface.ts` added by OBRS-323). `WalkInTripRespDto` (`dto/response/business/WalkInTripRespDto.java`) was **not** touched by 318-a/318-b — `ScheduleService.getWalkInTrips()` builds it via a 13-arg `@AllArgsConstructor` call (`ScheduleService.java`, the `WalkInTripRespDto trip = new WalkInTripRespDto(...)` call) that never reads `schedule.getSeatingMode()`, unlike the sibling `searchSchedules()` method a few dozen lines below it, which does pass `schedule.getSeatingMode()` into `ScheduleSearchRespDto`. Confirmed by reading the backend source directly, not just the docs.

**What I did instead**: added `seatingMode?: 'OPEN' | 'ASSIGNED'` to the FE's `WalkInTripDto` (`services/staff/staff-api.service.ts`) as a verified-passthrough optional field (same pattern as `Schedule.seatingMode` — `getWalkInSchedules()` is a raw `http.get<ResponseAPI<WalkInRouteGroupDto[]>>` passthrough, no manual per-field mapper, so the field will populate automatically the moment the backend adds it, no further FE change needed then). Added `isOpenSeatingTrip(trip)` next to it, which resolves missing/undefined to `false` (ASSIGNED) — the walk-in OPEN-sell UI (passenger-count-only checkout, no seat map) is fully built and tested against this helper, but **will not activate for any real trip until this field is added**, since every walk-in trip reads as ASSIGNED today regardless of its actual `seating_mode`.

**What the frontend needs**: add `schedule.getSeatingMode()` as a 14th constructor argument to the `WalkInTripRespDto` build in `ScheduleService.getWalkInTrips()` (mirroring the `searchSchedules()` call), plus the matching field + Lombok `@Data` getter on `WalkInTripRespDto` itself. Until this ships, walk-in OPEN-seating schedules are still sold through the ASSIGNED (seat-map) flow in the POS, same as before this card.
### ✅ RESOLVED — [Frontend] 2026-07-14 — Advanced-booking passenger preferences (OBRS-361/362): built against the contract described in the task brief, not yet confirmed in `docs/api/`

<!-- contract-request
card: OBRS-361/362
status: resolved
resolved: 2026-07-17 (OBRS-460) - all four fields exist AND the shapes match what the FE assumed. seatPreference/seatRequirement: PassengerReqDto:35,44 ("window"|"aisle" / "wheelchair"|"extra_legroom", case-insensitive, lenient) from da4689d2 feat(OBRS-134) 2026-07-13. isWheelchairAccessible/isExtraLegroom: SeatMapRespDto:14,16 from 4e38419a feat(OBRS-362) 2026-07-14 - this card's own backend half.
-->

> **RESOLVED 2026-07-17 (OBRS-460).** The claim below that a grep "found **zero** mentions" of these four
> fields is **dead — and two of the four were already live when it was written**: `seatPreference` /
> `seatRequirement` shipped the day before (`da4689d2 feat(OBRS-134)`), and `isWheelchairAccessible` /
> `isExtraLegroom` landed the same day via `4e38419a feat(OBRS-362)`, the backend half of **this same card**.
> The grep that returned zero was run against `docs/api/*.md` — **the docs were the stale thing, not the
> backend.** Grepping the contract docs is not grepping the contract.
>
> **Shape verified, not just the field names** (2026-07-17): the FE's assumed lowercase `'window'|'aisle'` and
> `'wheelchair'|'extra_legroom'` match the backend exactly — it compares case-insensitively and is lenient by
> design (an unknown or blank value means "no preference" and never rejects a booking), and both seat-map flags
> are `Boolean`. Nothing to change on either side. Entry kept for history.

**Affected endpoints**: `POST /api/private/bookings` (`BookingScheduleReqDto.passengers[]`) and `GET /api/schedules/{id}/seats` (`SeatMapRespDto`).

**Request type**: field addition confirmation (additive, R1) — built per an explicit contract description from the UX/task brief; grepped `docs/api/booking.md` and `docs/api/scheduling.md` before starting and found **zero** mentions of `seatPreference`/`seatRequirement`/`isWheelchairAccessible`/`isExtraLegroom` — these are assumed to be landing in parallel, not yet documented.

**What the frontend built against**:
| Field | Location | Assumed shape |
|---|---|---|
| `seatPreference` | `POST /api/private/bookings` request, per passenger | `'window' \| 'aisle' \| null`, lowercase, optional, best-effort |
| `seatRequirement` | same | `'wheelchair' \| 'extra_legroom' \| null`, lowercase, optional, best-effort |
| `isWheelchairAccessible` | `GET /api/schedules/{id}/seats` response (`SeatMapRespDto`) | `boolean`, optional |
| `isExtraLegroom` | same | `boolean`, optional |
| `seatNumber` | same | confirmed already documented (plain numeric string, `'1'..'21'`) — no change, just confirming the FE's `normalizeSeatNumber()` util keys off it correctly |

**What the frontend did to stay safe against an unconfirmed contract**: every field above is optional/nullable in the FE's own types (`PassengerInfo.seatPreference?`, `SeatMapRespDto.isWheelchairAccessible?`, etc.) — if the backend ships a different field name or doesn't ship at all yet, the booking payload still validates (fields just serialize as `null`/absent) and the seat-map fetch degrades to zero badges via `catchError(() => of({}))` (never blocks a booking, never alerts). `AC-361.5` (never attach a preference to an OPEN leg) is enforced entirely client-side regardless of what the backend does with the field.

### Impact if not addressed
If the backend lands under different field names, `seatPreference`/`seatRequirement` will silently no-op (backend ignores unknown fields per its usual permissive-decoder behavior elsewhere in this contract) and the wheelchair/extra-legroom badges will simply never render (both booleans read `undefined`, falsy) — no error, no crash, just missing functionality until the FE interfaces are corrected to match the real field names.

---

### [Frontend] 2026-07-14 — `seatingMode` not exposed on any FE-reachable read DTO (OBRS-325, open-seating epic 318-e)

<!-- contract-request
card: OBRS-325
status: open
absent: seatingMode :: src/main/java/com/example/demo/dto/response/business/*Ticket*.java
note: RE-VERIFIED 2026-07-17 (OBRS-460) - still genuinely open, the only one of the 14 that is. seatingMode exists on exactly 3 backend DTOs (ScheduleRespDto:18, ScheduleSearchRespDto:26, WalkInTripRespDto:87) and no ticket DTO (BookingTicketResponse, JourneyTicketResponse, TicketDetailResponse, UnboardTicketResponse). The glob covers all 4 - if a ticket DTO is renamed the ls-tree check fails loudly rather than passing vacuously.
note: the entry's SECOND ask ("and to Schedule") is already satisfied - ScheduleSearchRespDto carries seatingMode (OBRS-321) and the FE's Schedule.seatingMode was added by OBRS-323. Only the ticket-DTO half below is still open.
-->

> **Scope narrowed 2026-07-17 (OBRS-460).** Half of this entry is already done: the "add `seatingMode` … to
> `Schedule`" ask was satisfied by OBRS-321 (backend `ScheduleSearchRespDto`) + OBRS-323 (FE
> `Schedule.seatingMode`). **What is still genuinely open is the ticket half** — no ticket DTO carries the
> field, so the e-ticket surfaces still infer OPEN from a null `seatNumber`. Re-verified against backend
> source, not docs.

**Affected endpoints**: `GET /api/private/bookings/{id}/tickets` (`BookingTicketsData.journeys[].tickets[]`, consumed by both e-ticket surfaces) and, if a search-list "Open seating" badge is ever wanted, the schedule search endpoint behind `Schedule` (`shared/interfaces/schedule.interface.ts`).

**Request type**: field addition (additive, R1) — not blocking, worked around for now.

**What I found**: 318-a (OBRS-321, merged to `origin/dev`) added `schedules.seating_mode` (`OPEN`/`ASSIGNED`) and made `tickets.seat_number` nullable on the backend. I grepped the whole FE tree for `seatingMode`/`seating_mode`/`SeatingMode` before starting this card — **zero matches**. Neither `BookingTicketItem` (`shared/interfaces/booking-ticket.interface.ts`) nor `Schedule` (`shared/interfaces/schedule.interface.ts`) carries the field; `BookingTicketItem.seatNumber` is already `string | undefined`, so the nullability change passed through silently with no FE-visible signal beyond "the value can be missing."

**What I did instead**: derived OPEN purely from `ticket.seatNumber` being null/blank (`isJourneyOpenSeating()` in `shared/lib/booking-ticket-view.ts`, mirrored in `modules/e-ticket/e-ticket.component.ts`'s `buildPassengersFromApi`). This works because every ticket on a leg shares one schedule, so either all its `seatNumber`s are null (OPEN) or none are (ASSIGNED) — there's no per-ticket ambiguity today. It's a client-side inference, not a real read of `seating_mode`, so it would misfire if a future case ever left a single ASSIGNED-schedule ticket with a null seat for an unrelated reason (data issue, cancelled leg, etc.) — that ticket would read as "open seating" instead of "no seat assigned."

**What the frontend needs (not urgent, no current UI depends on it)**: if/when a customer-facing surface wants to render seating mode as its own concept rather than inferring it from nullability (e.g. a search-result "Open seating" badge, since `Schedule` today only exposes `availableSeats`/`availableSeatNumbers`, never a seat number, so there's nothing to derive from at that layer) — add `seatingMode: 'OPEN' | 'ASSIGNED'` directly to `BookingTicketItem`/`BookingTicketJourney` and to `Schedule`. Until then the null-seat inference above is sufficient and I did not add speculative UI to the search-result list (`schedule-booking-list.component.html`) since it has no reliable signal to key off.

---

### ✅ RESOLVED — [Frontend] 2026-07-11 — Per-round revenue settlement + owner cash-handover sign-off (OBRS-196): endpoints not yet in contract

<!-- contract-request
card: OBRS-196
status: resolved
resolved: 2026-07-11 (self-marked, see the blockquote below) - backend landed at 037cdb1; two contract breaks were found and fixed against the real SettlementController. Re-confirmed 2026-07-17 (OBRS-460).
-->

> **RESOLVED 2026-07-11** — backend landed (commit `037cdb1`). Two contract breaks were found and fixed against the real
> `SettlementController`/`docs/api/settlements.md`:
> 1. **URL**: base path is `/api/private/settlements` — **no `/admin/` segment** (`EndpointConstant.PRIVATE_SETTLEMENTS`).
>    Everything below was 404ing against the real backend until `AdminApiService`'s 3 methods were corrected.
> 2. **Settled breakdown is a thinner shape than live**: `settled.byMethod[]`/`settled.byChannel[]` are `{method,amount}` /
>    `{channel,amount}` only (no `ticketCount`, no `remote` — the frozen snapshot only stores amounts), vs. the live
>    breakdown's full `{method,amount,ticketCount}` / `{channel,amount,ticketCount,remote}`. Also reconciled: the pending
>    item has no `status`/`routeLabel`/`totalAmount`/`currency` fields (it's `{scheduleId, originStopId, originStopSlug,
>    departureDateTime, routeSlug, liveTotalAmount, ticketCount}` — every row is definitionally PENDING, so the list's
>    status pill is now a static badge, not a per-item bind), the pending list wraps in `{range, items}` (no
>    `totalElements`), `discrepancy` is `{hasDiscrepancy, settledTotal, liveTotal, deltaAmount}` (not
>    `differenceAmount`), and `settled` carries `{totalAmount, byMethod, byChannel, settledBy, settledByName,
>    settledAt}` (not `acknowledgedTotalAmount`). `SettlementDetailModalComponent` now renders two distinct breakdown
>    table blocks gated on `detail.status` (PENDING → `detail.live.*`, full columns; SETTLED → `detail.settled.*`,
>    amount-only columns) instead of always rendering the live breakdown. All shapes reconciled directly against
>    `SettlementSummaryRespDto`/`SettlementLiveRespDto`/`SettlementSettledRespDto`/`SettlementPendingItemRespDto`/
>    `SettlementPendingListRespDto`/`SettlementDiscrepancyRespDto` in the backend worktree. `shared/interfaces/settlement.interface.ts`,
>    `AdminApiService`, `SettlementsPendingStore`, `SettlementsPageComponent`, `SettlementsListComponent`, and
>    `SettlementDetailModalComponent` were all updated; i18n untouched (no key renames needed). Regression-locked with
>    new `HttpTestingController` tests in `admin-api.service.spec.ts` asserting the exact corrected URLs (mirrors the
>    OBRS-85 precedent above), plus spec coverage for the thin settled-breakdown shape.
>
> Original entry kept below for history.

**Affected endpoints**:
- `GET /api/private/settlements/pending?from=&to=` (new)
- `GET /api/private/settlements/schedules/{scheduleId}` (new)
- `POST /api/private/settlements/schedules/{scheduleId}/confirm` (new)

**Request type**: New endpoints (all three).

**Status at time of writing**: this frontend work (branch `ao/revenue-settlement`) was built against the OBRS-196 contract given directly by the task orchestrator (route paths, DTO shapes, and the exact `errorCode` set) in parallel with the paired backend worktree `OBRS-backend-wt-revenue-settlement` — checked and confirmed clean/unstarted there at time of writing (no `Settlement*` controller/service/DTO exists yet). Same parallel-lane pattern already used for OBRS-129/OBRS-96/OBRS-110 above, not an assumption that an undocumented endpoint already exists.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `GET /api/private/admin/settlements/pending?from&to` → `{ items: [{ scheduleId, routeLabel, departureDateTime, status: 'PENDING'\|'SETTLED', totalAmount, currency, ticketCount }], totalElements }` | New endpoint, OWNER scope (route `requiredRoles: ['owner']`; ADMIN admitted via `ROLE_GRANTS['admin']` including `'owner'`) | Backs the settlements list/date-range filter (`SettlementsPendingStore`, mirrors `ReportsStore`'s OBRS-40 range-cache pattern) |
| `GET /api/private/admin/settlements/schedules/{scheduleId}` → `{ scheduleId, routeLabel, departureDateTime, status, currency: 'THB', live: { totalAmount, onSiteTotal, agencyTotal, passengerCount, ticketCount, byMethod: [{method, amount, ticketCount}], byChannel: [{channel, amount, ticketCount, remote}] }, settled: { settledByName, settledAt, acknowledgedTotalAmount } \| null, discrepancy: { hasDiscrepancy, differenceAmount } \| null }` | New endpoint | Backs the detail modal's breakdown tables + settled/discrepancy info card |
| `POST /api/private/admin/settlements/schedules/{scheduleId}/confirm` — body `{ acknowledgedTotalAmount }` (the FE always sends it, sourced from `detail.live.totalAmount`) → same shape as the GET detail (status flips to `SETTLED`) | New endpoint | Owner cash-handover sign-off; FE removes the row optimistically on success (`store.mutate`) since `SETTLED` rows are assumed excluded from the pending list server-side |
| `errorCode` values `SETTLEMENT_ALREADY_SETTLED`, `SETTLEMENT_AMOUNT_MISMATCH`, `SETTLEMENT_SCOPE_FORBIDDEN`, `SETTLEMENT_ROUND_NOT_DEPARTED`, `SETTLEMENT_SCHEDULE_NOT_FOUND` on the confirm endpoint's error response | Confirm endpoint's error contract | FE branches on each (never the localized message) — `ALREADY_SETTLED` refetches + swaps to the settled view (not an error toast), `AMOUNT_MISMATCH` forces a fresh GET instead of resubmitting the stale amount, the rest close the modal + refresh the list |
| `method` values match `EPaymentMethod` 1:1 (`cash`, `card`, `bank_transfer`, `qr_promptpay`, `truemoney`, `shopeepay`, `rabbit_linepay`, `other`); `channel` values match `EBookingChannel` 1:1 (`online`, `walk_in`, `agent`, `kiosk`) | `byMethod[].method` / `byChannel[].channel` | Confirmed directly against `OBRS-backend/src/main/java/com/example/demo/enums/{EPaymentMethod,EBookingChannel}.java` (8 / 4 values respectively) — FE i18n keys (`ADMIN.SETTLEMENTS.METHOD.*` / `.CHANNEL.*`) are a 1:1 map of these exact slugs, including `METHOD.OTHER` for the backend's untracked-method bucket |

### What the frontend implemented (additive-safe, new page)
- `SettlementsPendingStore` (`modules/admin/pages/settlements/settlements.store.ts`, root-scoped SWR, mirrors `ReportsStore`), `SettlementsPageComponent` (smart), `SettlementsListComponent`/`SettlementDetailModalComponent` (dumb), 3 new `AdminApiService` methods, `shared/interfaces/settlement.interface.ts`, the `/admin/settlements` route (`requiredRoles: ['owner']`) and a role-gated sidebar nav item (`AdminLayoutComponent.buildNavItems()`, mirroring `StaffLayoutComponent`'s existing role-gated nav pattern).

### Impact if not addressed
The settlements page is implemented and additive-safe (new route, new nav item, no existing endpoint/field touched), but functionally inert until the backend ships these three endpoints — the list will show the error state, and no round can be settled. Do not merge to `dev`/`sit` until the backend implements this feature (or confirms a shape/errorCode mismatch requiring a frontend follow-up) — track against the paired backend worktree `OBRS-backend-wt-revenue-settlement` before promoting either side.

> **⭐ RECONCILIATION — 2026-07-09 (FE↔BE handoff-gap sweep):** every Contract Request below has since **landed on `origin/dev` on both sides and is live on SIT** — verified end-to-end. These entries are kept for history; none is still open.
> - **Promo code system (OBRS-109 / #37)** — RESOLVED. Backend `PromotionController` (`POST /api/private/promotions/validate`), `AdminPromotionCrudController` (full CRUD under `/api/private/admin/promotions`), `PromotionCodeService`, and the `promotionCode` booking field are all on `origin/dev`. FE `promotion.service.ts` + `promo-code-field.component` match (path + `PROMO_CODE_*` errorCodes). Live SIT: `validate` bogus code → `404 {errorCode: PROMO_CODE_NOT_FOUND}`; `GET /admin/promotions` → `403` for customer (exists + role-gated).
> - **Usability report reporter email (OBRS-108)** — RESOLVED. Backend `reporterEmail` on `UsabilityReportController`/`UsabilityReportDetailRespDto`/model + `UsabilityReportSubmitReporterEmailIT`; FE UI (`report-usability-fab`, admin detail row) on `origin/dev`.
> - **Change seat (OBRS-110)** — RESOLVED. Backend `ChangeSeatService` + `ChangeSeatReqDto`/`ChangeSeatAvailabilityRespDto`/`ChangeSeatException` on `origin/dev`; FE consumed it, and the label→numeric seat-number contract mismatch was fixed live under **OBRS-171** (`shared/lib/seat-number.ts`).
> - **Usability Report triage workflow (OBRS-86)** — RESOLVED. Backend `EUsabilityReportStatus` (incl. `accepted`), `UpdateUsabilityReportStatusReqDto` (`triageNote`), `triagedBy`/`triagedAt`/`jiraIssueKey` on `UsabilityReportDetailRespDto` + `UsabilityReportTriageIT`; FE triage UI on `origin/dev` (see also OBRS-174).
> - **Round-trip promotion admin endpoints (OBRS-85), incl. the OWNER/ADMIN access gap** — RESOLVED. Backend keeps `@PreAuthorize("hasRole('OWNER')")` but the `RoleHierarchyImpl` (`ROLE_ADMIN > ROLE_OWNER > …`) lets ADMIN satisfy it; FE **OBRS-176** made `owner` an all-access superset that can reach `/admin`. Live SIT: **both** owner and admin get `200` on `/admin/promotions` and `/admin/promotions/round-trip`.

### ✅ RESOLVED — [Frontend] 2026-07-10 — Staff pre-departure boarding management (OBRS-130): board/unboard endpoints + manifest field not yet in contract

<!-- contract-request
card: OBRS-130
status: resolved
resolved: 2026-07-17 (OBRS-460) - BoardingListItemResponse:27 carries boardedByName (its javadoc cites OBRS-130), and BoardingManifestExportService consumes it. This entry was the ONLY one below the 2026-07-09 reconciliation line with no update note of its own, so it was verified against source rather than trusted by position.
-->
**Affected endpoints/fields**:
- `POST /api/private/tickets/{id}/board` (new — staff/operator manual board action, replaces `check-in` on this flow)
- `POST /api/private/tickets/{id}/unboard` (new — salesperson/admin-only reversal of a boarding stamp)
- `boardedBy` / `boardedByName` added to `BoardingListItemResponse` (`GET /api/private/schedules/{id}/boarding-list`)

**Request type**: New endpoints + additive response fields.

**Status at time of writing**: built against the locked OBRS-130 UX spec in parallel with the paired backend worktree `OBRS-backend-wt-obrs-130-boarding` — checked and confirmed still WIP there at time of writing (`TicketController` has `check-in`/`boarding-token`/`boarding-scan` only, no `board`/`unboard` mapping; `BoardingListItemResponse` has no `boardedBy`/`boardedByName` field; `Ticket.boardedBy` (a bare `Long` id) already exists from OBRS-96 but nothing resolves it to a display name yet). This is the same parallel-lane build pattern already used for OBRS-96/OBRS-129 below, not an assumption that an undocumented endpoint already exists.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `POST /api/private/tickets/{id}/board` → `204`/empty `data` on success; `409 {errorCode: ALREADY_BOARDED}`, `409 {errorCode: TICKET_NOT_CONFIRMED}`, `400 {errorCode: BOARDING_WINDOW_NOT_OPEN}`, `404 {errorCode: TICKET_ERROR_ID_NOT_FOUND}` on failure | New endpoint | Manual "Board" button per manifest row (retires the `check-in` action from this flow — `checkIn()` has no other frontend consumer, removed from `staff-api.service.ts`) |
| `POST /api/private/tickets/{id}/unboard` → same success shape; `409 {errorCode: NOT_BOARDED}` plus the same set as `board` | New endpoint, **salesperson/admin only** (`@PreAuthorize`) | "Un-board" button, hidden client-side for `driver` via `authService.hasAnyRole(['salesperson'])` — the backend role check is still the actual authority, FE gating is UX-only |
| `boardedBy: number \| null`, `boardedByName: string \| null` added to each `BoardingListItemResponse` row | `GET /api/private/schedules/{id}/boarding-list` | Backend-resolved display name survives a refresh; FE only self-seeds a display name (`authService.getUsername()`) on the one row *this* operator just boarded via an optimistic update, never on a pre-existing boarded row (that was flagged as a misattribution risk during scrutinize) |
| Both `board`/`unboard` never return a bare `401` for a domain-rejected action (mirrors the `boarding-scan` contract, OBRS-187 trap) | Error contract | FE sets `SKIP_AUTH_LOGOUT` on both calls as defense-in-depth regardless, per the existing `boarding-scan`/`booking.service.ts`/`promotion.service.ts` precedent |

### What the frontend implemented (additive-safe)
- `StaffApiService.board()`/`unboard()` (new methods) and `BoardingListItemDto.boardedBy`/`boardedByName` (new optional fields) are additive — no existing endpoint or field was changed. `checkIn()` and its `/check-in` call were removed (dead code — confirmed no other consumer in the frontend).
- `BoardingListComponent` (`shared/components/boarding-list/`) treats `boardedAt != null` as the boarded signal (status-neutral, matching the backend's OBRS-96 `docs/adr/0030-boarding-state-model.md` design) and is additive-safe against both mount points: the existing `/staff/boarding/:scheduleId` route (unchanged guard/roles) and the new Sell Tab-3 mount in `walk-in-center-panel.component`.

### Impact if not addressed
The boarding manifest's Board/Un-board buttons will both fail with a `404`/whatever the router returns for an unmapped path (degrades gracefully — the button re-enables and the optimistic stamp reverts, no broken UI), and every row's "Boarded by" line will stay blank until the backend adds `boardedByName`. Do not merge to `dev`/`sit` until the backend implements `board`/`unboard` and the manifest field — track against the paired backend worktree before promoting either side.

### ✅ RESOLVED — [Frontend] 2026-07-10 — Starter operational dashboard (OBRS-129): endpoint not yet in `docs/api/`

<!-- contract-request
card: OBRS-129
status: resolved
resolved: 2026-07-10 (see the update note below); re-confirmed 2026-07-17 (OBRS-460) - DashboardService + DashboardTodayRespDto + DepartureRespDto all cite GET /api/private/admin/dashboard/today.
-->
**Affected endpoint**: `GET /api/private/admin/dashboard/today` (new)

**Request type**: New endpoint. Built against the contract given directly in the locked OBRS-129 UX spec (mirroring the OBRS-40 `reports/summary` shape) — `../OBRS-backend/docs/api/` has no `dashboard.md` at time of writing, and the paired backend worktree (`OBRS-backend-wt-starter-dashboards`) has no `Dashboard*` controller/service class yet, only planning-doc commits. Per `CLAUDE.md`'s R0 rule this would normally block, but the contract was supplied explicitly by the task orchestrator as already-locked, so the frontend proceeded — flagging here per the same rule's "coordinate with the backend first" spirit.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `GET /api/private/admin/dashboard/today` → `{ date, timezone, basis: { volume, revenue, occupancy }, tiles: { departuresCount, occupancyRatePct, bookingCount, revenue? }, departures: [{ scheduleId, routeLabel, departureTime, seatsSold, capacity, occupancyRatePct }] }` | New endpoint, ADMIN/OWNER scope (same as `/admin` shell guard) | Backs the rebuilt `/admin/dashboard` KPI tiles + today's-departures table (`src/app/shared/interfaces/dashboard-today.interface.ts`) |
| `tiles.revenue` omitted entirely (not zeroed/null) for a viewer without revenue visibility | Response shape | Forward-compat for a future salesperson role; FE already renders the Revenue tile off the field's presence (`showRevenue`), never a role check |
| `occupancyRatePct` as a JSON number (1dp), `revenue.net/paid/refunded` as decimal strings | Response shape | Matches the `ReportsSummaryDto` convention already established by OBRS-40 — FE formats via `Number()`→`Intl.NumberFormat`, never arithmetic on the string |
| `departures` pre-sorted by `departureTime` ascending | Response shape | FE trusts server order and does not re-sort |

### Impact if not addressed
The rebuilt dashboard page is implemented and additive-safe against the admin shell (route/guard/nav unchanged), but is functionally inert until the backend ships this endpoint — every load will show the error state (`ADMIN.DASHBOARD.LOAD_FAILED`) with a 404/whatever the router returns for an unmapped path. Do not merge to `dev`/`sit` until the backend implements `GET /api/private/admin/dashboard/today` (or confirms a shape mismatch requiring a frontend follow-up) — this is the counterpart change to `IMPLEMENTATION_CHECKLIST.md` entry `#44` (OBRS-129) in the backend repo, which was "claimed"/in-progress at the time this frontend work landed.

> **Update 2026-07-10:** both sides landed — `GET /api/private/admin/dashboard/today` is on `origin/dev` (backend OBRS-129 merge `2d9b4cd`) and this FE consumes it. Entry kept for history.

### ✅ RESOLVED — [Frontend] 2026-07-10 — Digital e-ticket QR + manual boarding-scan (OBRS-96): endpoints not yet in contract

<!-- contract-request
card: OBRS-96
status: resolved
resolved: 2026-07-10 (see the update note below) - both sides landed together on origin/dev (backend merge 34fd611).
-->
**Affected endpoints**:
- `GET /api/private/tickets/{id}/boarding-token` (new — customer-facing, per-ticket signed QR payload)
- `POST /api/private/tickets/boarding-scan` (new — staff/operator-facing manual token validation + boarding)

**Request type**: New endpoints (both).

**Status at time of writing**: this frontend work (branch `ao/obrs-96-eticket-qr`) was built against the SA/UX-locked OBRS-96 spec in parallel with the paired backend worktree `OBRS-backend-wt-obrs-96-eticket-qr` (same branch name, same story) — checked and confirmed still WIP there (`IMPLEMENTATION_CHECKLIST.md` lists `[#52] OBRS-96` as 🔒 in-progress, no boarding-token/boarding-scan controller/service/DTO exists yet in that worktree's `src/` at time of writing). This is the standard parallel-lane build pattern for this codebase (see the promo-code / OBRS-109 entry below for precedent), not an assumption that an undocumented endpoint already exists.

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `GET /api/private/tickets/{id}/boarding-token` → `{ ticketId, ticketNumber, boardingToken, expiresAt }` | New endpoint | One QR per ticket on the customer e-ticket page, encoding the signed `boardingToken` (not the human-readable ticket number) — see `docs/adr/0013-per-ticket-qr-eticket-and-boarding-scan.md` |
| `POST /api/private/tickets/boarding-scan` — body `{ token, scheduleId }`, success (200) `{ ticketId, ticketNumber, passengerName, seatNumber, boardedAt }` | New endpoint | Staff/operator manual boarding validation box on the boarding-list page |
| `errorCode` values `INVALID_TICKET_TOKEN` (400), `EXPIRED_TICKET_TOKEN` (400), `WRONG_SCHEDULE_TICKET` (400), `BOARDING_WINDOW_NOT_OPEN` (400), `TICKET_NOT_CONFIRMED` (409), `ALREADY_BOARDED` (409), `TICKET_ERROR_ID_NOT_FOUND` (404 — kept exactly, not tidied to `TICKET_NOT_FOUND`) | `boarding-scan`'s error response | Frontend maps each to a `STAFF.BOARDING.SCAN.ERROR.*` i18n key + severity + icon via `shared/lib/boarding-scan-error.ts`, mirroring `reschedule-error.ts`; assumed names per the locked UX spec, not yet confirmed against a real `deriveErrorCode()` output |

### What the frontend implemented (additive-safe)
- `TicketService.getBoardingToken()` (new service, `src/app/services/ticket/ticket.service.ts`) and `StaffApiService.boardingScan()` (added method) are additive — no existing endpoint or field was changed.
- E-ticket page: per-ticket QR cards render a placeholder (`E_TICKET.QR_UNAVAILABLE`) instead of blanking when a ticket's `boarding-token` GET fails for any reason (409/404/network) — `forkJoin` with a per-inner `catchError` isolates one ticket's failure from the rest (ADR 0013, Decision 2).
- Boarding-list page: the scan box is additive UI inside the already-guarded `staff/boarding/:scheduleId` route (`requiredRoles: ['driver','salesperson']`, hierarchy covers OWNER/ADMIN) — no change to the existing `checkIn()` button/flow.

### Impact if not addressed
The e-ticket page will show every ticket's QR as the "unavailable" placeholder (a 404 on every `boarding-token` GET), and the boarding-list scan box will show the `GENERIC` error on every validation attempt (a 404 on `boarding-scan`) — both degrade gracefully (no broken UI, no blank page) but are functionally inert until the backend lands. Do not merge to `dev`/`sit` until the backend implements this feature (or an explicit decision accepts the temporary contract drift), per `CLAUDE.md`'s R0 rule for undocumented endpoints — track against the paired backend worktree before promoting either side.

> **Update 2026-07-10:** both sides landed together on `origin/dev` (FE merge + backend OBRS-96 merge `34fd611`); the SIT Supabase `boarded_at`/`boarded_by` migration is applied and `TICKET_TOKEN_SECRET_KEY` is set in Koyeb. Entry kept for history.

### ✅ RESOLVED — [Frontend] 2026-07-08 — Promo code system (OBRS-109 / #37): endpoints not yet in contract

<!-- contract-request
card: OBRS-109
status: resolved
resolved: 2026-07-09 (the RECONCILIATION sweep above) - PromotionController + AdminPromotionCrudController + the promotionCode booking field are all on origin/dev and verified live on SIT.
-->
**Affected endpoints**:
- `POST /api/private/promotions/validate` (new — customer-facing preview, no auth-scoped side effects)
- `GET /api/private/admin/promotions` (new — full list, all promotions including the round-trip singleton row)
- `GET /api/private/admin/promotions/{id}`, `POST /api/private/admin/promotions`, `PUT /api/private/admin/promotions/{id}`, `DELETE /api/private/admin/promotions/{id}` (new — full CRUD)
- `POST /api/private/bookings` — new optional request field `promotionCode`

**Request type**: New endpoints + new request field. `docs/api/admin.md`'s `AdminPromotionController` section explicitly scopes itself to the round-trip singleton only and calls out "full promotion CRUD across every promotion is a separate, not-yet-built feature (#37)" — this is that feature. Checked `OBRS-backend-wt-promo-codes` (the paired backend worktree): still at `origin/dev` HEAD, no promo-code commits yet, so none of this exists server-side at time of writing.
### ✅ RESOLVED — [Frontend] 2026-07-08 — Usability report submit: optional reporter email (OBRS-108): field not yet in contract

<!-- contract-request
card: OBRS-108
status: resolved
resolved: 2026-07-09 (the RECONCILIATION sweep above); re-confirmed 2026-07-17 (OBRS-460) - UsabilityReportController:45 accepts the reporterEmail request param.
-->
**Affected endpoints**:
- `POST /api/usability-reports`
- `GET /api/private/admin/usability-reports/{id}`

**Request type**: Add field

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `POST /api/private/promotions/validate` — body `{ code, amount }`, response `{ code, discountAmount, netAmount, label? }` or a `PROMO_CODE_*` errorCode | New endpoint | Customer-facing instant preview before submitting the booking — see AGENT_MEMORY.md's OBRS-109 UX finding for why apply-at-submit alone is worse UX |
| `errorCode` values `PROMO_CODE_NOT_FOUND`, `PROMO_CODE_INACTIVE`, `PROMO_CODE_EXPIRED`, `PROMO_CODE_NOT_YET_ACTIVE`, `PROMO_CODE_MIN_AMOUNT_NOT_MET`, `PROMO_CODE_USAGE_LIMIT_REACHED` | Validate endpoint's error response, and `POST /api/private/bookings`'s error response when a `promotionCode` was submitted | Frontend maps each to a `PROMO_CODE.ERROR.*` i18n key per `CLAUDE.md`'s errorCode-not-message rule; assumed names, not confirmed against a real `deriveErrorCode()` output |
| `promotionCode` (string, optional, nullable) | Request body of `POST /api/private/bookings` | Only sent when the customer confirmed a typed code via the preview; lets the backend re-validate and apply it atomically at booking-creation time (closing the preview→submit race) |
| `GET /api/private/admin/promotions` → `PromotionRespDto[]` (same shape as the existing round-trip `PromotionRespDto`, plus `translations`) | New endpoint | Backs the new admin promotions list table (all rows, not just `round_trip`) |
| `GET/POST/PUT/DELETE /api/private/admin/promotions/{id}` | New endpoints | Full CRUD for admin-managed promotion codes. `PUT` assumed full-replace (not the round-trip endpoint's partial-PATCH contract) per the UX spec; `DELETE` assumed **soft**-delete (flips `status` to `inactive`, row is not removed) |

### Suggested contract change
- `PromotionReqDto` (request body for `POST`/`PUT`): `slug`, `code`, `discountType` ('percentage'\|'fixed_amount'), `discountValue`, `maxDiscountAmount` (nullable, percentage-only), `minBookingAmount`, `startDateTime`/`endDateTime`, `usageLimit`, `status`, `autoApply` (boolean), `translations: AdminTranslationReqDto[]` (reusing the existing DTO already used by lookups/roles/routes).
- `DELETE` should look up the promotion, set `status='inactive'`, and return success — never hard-delete the row (usage history / bookings may reference it via `promotionId`).

### Impact if not addressed
The frontend UI (customer promo-code field + admin list/CRUD) is implemented and additive-safe, but functionally inert against the current backend until these land — the customer field will show a generic apply-failed error on every attempt, and the admin list/create/edit/delete calls will 404. Do not merge to `dev`/`sit` until the backend implements this feature (or an explicit decision accepts the temporary contract drift), per `CLAUDE.md`'s R0 rule for undocumented endpoints.
| `reporterEmail` (text, optional) | Multipart form part on `POST /api/usability-reports` | Lets a reporter optionally leave contact info while the submission stays anonymous when blank |
| `reporterEmail` (string, nullable) | Response body of `GET /api/private/admin/usability-reports/{id}` | Admin detail modal displays it (only when present) so triage can follow up |

### What the frontend implemented (additive-safe)
- `ReportUsabilityFabComponent` adds an optional email input; client-side validation only blocks submit on a non-empty, malformed value — empty always submits (anonymous stays supported).
- `formData.append('reporterEmail', reporterEmail)` is always sent (trimmed value; empty string when left blank) alongside the existing `category`/`description`/`routeUrl` parts.
- `UsabilityReportDetail.reporterEmail: string | null` added to the shared interface; the admin detail modal renders it as a new `.ur-detail-row` (reusing `.ur-detail-label`) near "User ID", gated on `*ngIf="detailReport.reporterEmail"` so it degrades gracefully (no broken UI) until the backend returns the field.

### Suggested contract change
- Accept an optional `reporterEmail` multipart text part on `POST /api/usability-reports` (blank/absent → store `null`, matching how `userId` is already nullable for anonymous submissions).
- Add a nullable `reporter_email` column to the usability_report table, returned as `reporterEmail` in the admin detail GET response. No new endpoint needed — this is additive to the existing shapes documented in `usability-reports.md`.

### Impact if not addressed
The email field renders and validates client-side regardless, but the value is dropped: the backend will silently ignore the unknown `reporterEmail` form part (or reject the request, depending on parser strictness) until the endpoint accepts it, and the admin detail row will always stay hidden (conditionally rendered on null/undefined, so no broken UI — just missing data) until the GET response includes it.

**Classification**: per `CLAUDE.md` cross-repo governance, this is R1 (additive, nullable field) — proceeding with the frontend implementation per that rule, flagging here so the backend implementation (if not already in flight on a paired branch) closes the loop before this branch merges to `dev`/`sit`.

---

### ✅ RESOLVED — [Frontend] 2026-07-08 — Change seat (OBRS-110, wave 1): built against a not-yet-documented backend contract, please verify on merge

<!-- contract-request
card: OBRS-110
status: resolved
resolved: 2026-07-09 (the RECONCILIATION sweep above) - ChangeSeatService + DTOs on origin/dev; the label-vs-numeric seat-number mismatch this entry asked to "verify on merge" was found and fixed under OBRS-171. Re-confirmed 2026-07-17 (OBRS-460): BookingRespDto:28 carries seatChangeCount.
-->
**Affected endpoints**:
- `GET /api/private/bookings/me` (`BookingRespDto.seatChangeCount`)
- `GET /api/private/bookings/{id}/change-seat/availability` (new)
- `POST /api/private/bookings/{id}/change-seat` (new)

**Request type**: New endpoints + additive field (contract built in parallel by the backend track; not yet present in `../OBRS-backend/docs/api/booking.md` at the time this branch was implemented)

### What the frontend coded against
| Shape | Assumed contract |
|---|---|
| `BookingRespDto.seatChangeCount` | `int`, `0` or `1` — mirrors `rescheduleCount`'s "max one per booking" gating pattern above |
| `BookingRespDto.stopChangeCount` | `int` — carried on `MyBookingDto` for shape parity only; **not yet consumed** by any frontend logic (a future wave) |
| `GET .../change-seat/availability` → `ChangeSeatAvailabilityRespDto` | `{ scheduleId, vehicleType, fromStopId, toStopId, seats: [{seatNumber, rowIndex, columnIndex}], occupiedSeatNumbers: string[], currentSeatNumbers: string[] }` — only `vehicleType`/`occupiedSeatNumbers`/`currentSeatNumbers` are consumed client-side (the seat components are fixed-layout by `vehicleType`, not row/column-driven; see `docs/adr/0009-change-seat-dialog.md` Decision 2) |
| `POST .../change-seat` body `{ seatAssignments: { [ticketId:number]: string } }` → `ChangeSeatBookingRespDto { bookingId, bookingNumber, status:"CONFIRMED", paymentIntentId:null }` — always `CONFIRMED`, no payment step |
| Error codes | `CHANGE_SEAT_ERROR_{NOT_CONFIRMED,MAX_COUNT,WINDOW_CLOSED,SEAT_UNAVAILABLE,NO_SEATS,SEAT_NOT_IN_MAP,TICKET_MISMATCH,MULTI_LEG_NOT_SUPPORTED,UNAUTHORIZED,BOOKING_NOT_FOUND}` on `error.error.errorCode` |

### What the frontend implemented
- `MyBookingDto.seatChangeCount?: number` / `.stopChangeCount?: number` added (`shared/interfaces/my-booking.interface.ts`), mirroring `rescheduleCount`.
- `shared/interfaces/change-seat.interface.ts`, `shared/lib/change-seat-error.ts`, `BookingService.getChangeSeatAvailability()`/`.confirmChangeSeat()`, the `ChangeSeatEffect`/reducer/selectors, and `ChangeSeatDialogComponent`/`ChangeSeatMapComponent` (`src/app/modules/my-bookings/components/change-seat-dialog/`) — full detail in `docs/adr/0009-change-seat-dialog.md`.
- `MyBookingsComponent.computeChangeSeatEligibility()` gates the card action the same way `computeRescheduleEligibility()` does (first-failing-wins: not confirmed → not one-way → `seatChangeCount >= 1` → inside the 4h window), so the action is never presented as available when the server would reject it.

### Impact if not addressed
Everything above degrades gracefully if the live contract differs in shape (TypeScript interfaces just won't match at runtime — no compile-time coupling to the backend), but functionally: a shape mismatch on `GET .../change-seat/availability` would surface as the dialog's `step: 'error'` card (a real HTTP/parse failure), and a mismatch on `POST .../change-seat`'s response would surface as a generic `confirmChangeSeatFailure({errorCode: 'GENERIC'})`. Please cross-check this section against the landed `OBRS-backend/docs/api/booking.md` change-seat entry once merged, and flag any divergence back here.

**Classification**: per `CLAUDE.md` cross-repo governance, this would ordinarily be R0 ("call an endpoint not yet documented") — proceeding anyway because this branch was explicitly tasked to build against this contract in parallel with the backend track (same OBRS-110 wave), per the assigning agent's instruction. Flagging here per the R1 "update shared interfaces after a backend contract change" notification duty so the two sides reconcile before this branch merges to `dev`/`sit`.

---

### ✅ RESOLVED — [Frontend] 2026-07-08 — Usability Report triage workflow (OBRS-86): status/fields not yet in contract

<!-- contract-request
card: OBRS-86
status: resolved
resolved: 2026-07-09 (the RECONCILIATION sweep above); re-confirmed 2026-07-17 (OBRS-460) - UpdateUsabilityReportStatusReqDto:15 carries triageNote and SetUsabilityReportJiraKeyReqDto:12 carries jiraIssueKey.
-->
**Affected endpoints**:
- `PUT /api/private/admin/usability-reports/{id}/status`
- `GET /api/private/admin/usability-reports/{id}`

**Request type**: Add field / Add enum value

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `accepted` status value | Both endpoints — status enum (currently `new`, `in_review`, `resolved`, `wont_fix`) | New triage state between `in_review` and `resolved` |
| `triageNote` (string, nullable) | Request body of the `PUT .../status` endpoint | Admin-entered free-text note captured alongside a status change |
| `triageNote` (string, nullable) | Response body of `GET .../{id}` (and the `PUT .../status` response, which per the current doc mirrors the GET shape) | So a reopened/refetched detail modal can show the previously saved note |
| `triagedBy` (integer, nullable — admin user id) | Response body of `GET .../{id}` | Displayed as "Triaged By" in the detail modal |
| `triagedAt` (string/ISO-8601, nullable) | Response body of `GET .../{id}` | Displayed as "Triaged At" in the detail modal |
| `jiraIssueKey` (string, nullable) | Response body of `GET .../{id}` | Frontend renders a display-only deep link to `https://nj-phuyaipu.atlassian.net/browse/{key}`; frontend never creates/writes this field |

### Suggested contract change
- Extend the status enum/DB check-constraint with `accepted` (see the existing ADR `0020-usability-report-status-as-varchar-check-enum.md` for the pattern used when `wont_fix`/etc. were added).
- Add `triage_note`, `triaged_by`, `triaged_at` columns to the usability_report table (or equivalent), populated when the `PUT .../status` endpoint is called with a non-null `triageNote`. `triaged_by`/`triaged_at` should be set server-side from the authenticated admin + current time whenever a status-updating PUT is accepted, not client-supplied.
- Add `jira_issue_key` as a nullable column, presumably populated by an out-of-band integration — the frontend only reads and links to it, no write path is being requested here.

### Impact if not addressed
The frontend UI for OBRS-86 (triage note textarea, Triaged By/At rows, Jira link, "Accepted" status pill/filter) is implemented and additive-safe (new nullable fields, no existing behavior removed), but functionally inert against the current backend:
- Saving a triage note will PUT `{ status, triageNote }` — the backend will silently ignore the unknown `triageNote` field (or reject it, depending on DTO strictness) until the request DTO is extended.
- Selecting `accepted` as a status will likely be rejected with `REPORT_INVALID_STATUS` until the enum is extended.
- `triagedBy`, `triagedAt`, `jiraIssueKey` will always render as absent (their UI rows are conditionally hidden on null/undefined, so this degrades gracefully — no broken UI, just missing data) until the backend returns them.

**Classification**: per `CLAUDE.md` cross-repo governance, assuming an undocumented field/enum value is R0. This entry exists so the backend implementation (or an explicit decision to change the frontend spec) happens before this branch is merged/deployed — do not merge to `dev`/`sit` until this is resolved or a maintainer explicitly accepts the temporary contract drift.
### ✅ RESOLVED — [Frontend] 2026-07-08 — Round-trip promotion admin endpoints (OBRS-85) — RESOLVED after Scrutinize

<!-- contract-request
card: OBRS-85
status: resolved
resolved: 2026-07-09 (the RECONCILIATION sweep above) - the two contract breaks were fixed at the time, and the OWNER/ADMIN role-guard gap this entry flagged as "separate, still-open" was closed by OBRS-176 (owner is now an all-access superset) - verified live on SIT, both roles get 200.
-->
**Affected endpoint**: `GET /api/private/admin/promotions/round-trip`, `PATCH /api/private/admin/promotions/round-trip`
**Request type**: Corrected the frontend's assumed contract to match the real backend implementation (`AdminPromotionController`, `RoundTripPromotionReqDto`, `PromotionRespDto` — found in `OBRS-backend-wt-round-trip-discount`, which had landed since this entry was first written).

Scrutinize caught two contract breaks against the real backend and both are now fixed:
1. **URL was missing `/admin`.** The frontend called `/api/private/promotions/round-trip`; the real path (per `EndpointConstant.PRIVATE_ADMIN_PROMOTIONS_ROUND_TRIP`) is `/api/private/admin/promotions/round-trip`. Fixed in `AdminApiService.getRoundTripPromotion()`/`updateRoundTripPromotion()`.
2. **PATCH body sent `status: string`; the real `RoundTripPromotionReqDto` reads `active: Boolean`.** Spring silently drops unknown JSON fields, so the Status toggle was a no-op despite a success toast. Fixed: `UpdateRoundTripPromotionPayload.status` → `.active: boolean`; `promotions-page.component.ts` translates the Status dropdown's string value to a boolean at the wire boundary, and translates it back (`active` → `'active'|'inactive'`) only for the local optimistic `store.mutate` (the store's `PromotionRespDto` still models `status` as a string).

**Also confirmed from the real backend (not yet acted on — flagging for awareness):**
- `AdminPromotionController` guards both GET and PATCH with `@PreAuthorize("hasRole('OWNER')")` — **ADMIN cannot call this endpoint, only OWNER can.** Combined with the frontend's Finding 4 (the `/admin` route guard only admits `requiredRoles: ['admin']`, and role-hierarchy expansion only goes *downward* from admin, not up from owner to admin), **no session can currently reach a working `/admin/promotions` page**: an ADMIN session can open the page but every save gets a 403; an OWNER session can't open `/admin` at all. This is a real end-to-end gap, not just the two items Scrutinize flagged — recommend the SA/PM decide whether the route guard should admit `owner` for this page, or the backend should also allow `ADMIN`.
- `PromotionRespDto` (backend, actual): `status` and `discountType` are plain `String`, not `{slug, translations}` objects as this frontend's `PromotionRespDto` type optimistically allowed for (`string | AdminStatusDto` — the union still works at runtime via `parseAdminStatus`, so no frontend change was needed here). The backend response also carries `maxDiscountAmount` and `autoApply`, which this frontend does not read (not required by the UX spec's field list).

### Impact if not addressed
The two Scrutinize-flagged breaks made `/admin/promotions` completely non-functional end-to-end (wrong URL = 404 on load; wrong PATCH field = silent no-op save) — both are now fixed and covered by `admin-api.service.spec.ts` (exact URL + exact PATCH body assertions). The OWNER/ADMIN role-guard mismatch above is a separate, still-open gap.

---

### ✅ RESOLVED — [Frontend] 2026-06-15 — Admin booking list endpoint missing from API docs

<!-- contract-request
card: OBRS-none (pre-dates the Jira board; 2026-06-15 admin-bookings)
status: resolved
resolved: 2026-07-17 (OBRS-460) - AdminBookingController exists and is mapped to EndpointConstant.PRIVATE_ADMIN_BOOKINGS ("/api/private/admin/bookings"); AuditRouteResolver registers its /{id}/cancel + /{id}/reschedule routes. The endpoint the entry feared might not exist has been real for some time.
-->
**Affected endpoint**: `GET /api/private/admin/bookings`
**Request type**: New endpoint (or documentation of existing endpoint)

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `GET /api/private/admin/bookings` paginated list | New or undocumented endpoint | Admin booking management page lists all bookings; currently calls this undocumented path |

### Suggested contract change
The response should be a `Page<BookingRespDto>` (same shape as `GET /api/private/bookings/me`) but unscoped — returning all bookings across all users, accessible to `ADMIN` only.

Suggested query params: `page`, `size`, `sort` (standard Pageable), plus optional filter params such as `status`, `bookingNumber`.

### Impact if not addressed
The admin bookings page (`/admin/bookings`) currently calls `GET /api/private/admin/bookings`. If the endpoint does not exist, the page returns a 404 and admins cannot view the booking list.

---

<!--
=== TEMPLATES — copy the relevant block; newest entries at the top of each section ===

── Backend → Frontend (Pending Changes) ──────────────────────────────────────────

## [Backend] YYYY-MM-DD — <short description>
**Risk level**: R0 (breaking) / R1 (additive)
**Triggered by**: [brief description of backend change]

### What changed in the contract
| Endpoint | Change type | Detail |
|---|---|---|
| `POST /api/private/bookings` | Field renamed | `departureTime` → `departureAt` |

### Response shapes before / after
_Only for R0 (breaking) changes._
- **Before**: `{ departureTime: string, ... }`
- **After**: `{ departureAt: string, ... }`

### Action required in frontend
- [ ] Update `XxxInterface` in `shared/interfaces/`
- [ ] Update NgRx reducer/selector if shape changed
- [ ] Search templates for renamed/removed fields

### Still unfinished on backend
- [list endpoints not yet ready, or "none"]


── Frontend → Backend (Contract Requests) ────────────────────────────────────────

## [Frontend] YYYY-MM-DD — <short description>
**Affected endpoint**: `METHOD /path`
**Request type**: Add field / Remove field / New endpoint / Other

### What the frontend needs
| Field / Change | Location | Reason |
|---|---|---|
| `estimatedDuration` (integer, minutes) | `GET /api/private/bookings` response | Needed for booking summary card display |

### Suggested contract change
_Optional — describe what the response/request shape should look like after the change._

### Impact if not addressed
_What the frontend cannot do or must work around until this is resolved._
-->
