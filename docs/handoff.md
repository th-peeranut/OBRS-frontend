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

_No pending changes. All documented endpoints in `../OBRS-backend/docs/api/` are current._

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
