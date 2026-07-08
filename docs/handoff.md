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
- [ ] Update any `PaymentStatus` enum / type that has a `SUCCESS = "success"` entry → `PAID = "paid"`
- [ ] Update display strings / badge labels that check `status === "success"`
- [ ] Update any filter/query params that send `status=success` → `status=paid`
- [ ] Search for hardcoded string `"success"` in payment-status contexts

### Still unfinished on backend
- None — all source, SQL seeds, and API docs are updated.

---

## Contract Requests (Frontend → Backend)

### [Frontend] 2026-07-08 — Usability Report triage workflow (OBRS-86): status/fields not yet in contract
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
### [Frontend] 2026-07-08 — Round-trip promotion admin endpoints (OBRS-85) — RESOLVED after Scrutinize
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

### [Frontend] 2026-06-15 — Admin booking list endpoint missing from API docs
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
