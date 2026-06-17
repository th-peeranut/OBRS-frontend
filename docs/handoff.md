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
