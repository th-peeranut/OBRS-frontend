import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import {
  PageResponse,
  PaymentResponse,
  PendingRefund,
} from '../../shared/interfaces/payment.interface';
import {
  UsabilityReportDetail,
  UsabilityReportPage,
  UsabilityReportStatus,
} from '../../shared/interfaces/usability-report.interface';
import { ReportsSummaryDto } from '../../shared/interfaces/reports-summary.interface';
import { RevenueAnalyticsDto } from '../../shared/interfaces/revenue-analytics.interface';
import { BookingTrendDto } from '../../shared/interfaces/booking-trend.interface';
import { RoutePerformanceDto } from '../../shared/interfaces/route-performance.interface';
import { CustomerBehaviorDto } from '../../shared/interfaces/customer-behavior.interface';
import { OpsEfficiencyDto } from '../../shared/interfaces/ops-efficiency.interface';
import { EodSalesReportDto } from '../../shared/interfaces/eod-sales-report.interface';
import { RefundVoidReportDto } from '../../shared/interfaces/refund-void-report.interface';
import { CashOnlineReconciliationReportDto } from '../../shared/interfaces/cash-online-reconciliation-report.interface';
import { DashboardTodayDto } from '../../shared/interfaces/dashboard-today.interface';
import {
  SettlementConfirmPayload,
  SettlementPendingPageDto,
  SettlementScheduleDetailDto,
} from '../../shared/interfaces/settlement.interface';
import { ConfigHistoryRow } from '../../shared/interfaces/config-history.interface';
import { RefundDestinationReqDto } from '../../shared/interfaces/refund-destination.interface';
import {
  CancelBookingResult,
  CashRefundApprovalCode,
  CashRefundApprovalRequest,
} from '../../shared/interfaces/my-booking.interface';
import {
  ParcelClaimApproveReqDto,
  ParcelClaimRespDto,
} from '../../shared/interfaces/parcel-claim.interface';
import {
  DriverCashDayRespDto,
  DriverCashDayReturnReqDto,
  DriverCashDayStatus,
  DriverCashDaySummaryRespDto,
  DriverCashRateReqDto,
  SalesPointOptionDto,
  DriverCashRateRowDto,
  DriverWageRateReqDto,
  DriverWageRateRowDto,
  PerHeadEarningsGranularity,
  PerHeadEarningsRespDto,
} from '../../shared/interfaces/driver-cash.interface';
import {
  CreditPreviewReqDto,
  NotificationMessageLocale,
  NotificationMessageReviewDetailDto,
  OverridableMessageKeyDto,
  PendingReviewRowDto,
  RejectNotificationMessageReviewPayload,
  SmsCreditEstimateDto,
  SubmitNotificationMessagePayload,
  SubmitNotificationMessageRespDto,
} from '../../shared/interfaces/notification-message-override.interface';

export interface AdminTranslationDto {
  locale?: string;
  label?: string;
  description?: string;
}

export type AdminTranslationCollection =
  | AdminTranslationDto[]
  | Record<string, AdminTranslationDto | null | undefined>;

export interface AdminTranslationReqDto {
  locale: string;
  label: string;
  description?: string;
}

export interface AdminStatusDto {
  code?: string;
  slug?: string;
  name?: string;
  label?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminLookupDto {
  id: number;
  category: string;
  slug: string;
  translations: AdminTranslationCollection;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminRoleDto {
  id?: number;
  slug: string;
  name?: string;
  description?: string;
  status?: string | AdminStatusDto;
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
  translations?: AdminTranslationCollection;
}

export interface AdminUserDto {
  id: number;
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  username?: string;
  preferredLocale?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  // OBRS-182: real last-login timestamp (set by the backend on successful
  // authentication), distinct from updatedAt/createdAt which only reflect the
  // record's last edit. Null/absent = the user has never signed in.
  lastLoginAt?: string | null;
  roles: Array<string | AdminRoleDto>;
  locked?: boolean;
  accountLockedUntil?: string | null;
  // OBRS-1258: replaces `salesPointStop` (removed from the backend entirely).
  // `salesPointCodes` is the full set of sales points this salesperson may sell
  // from; `activeSalesPointCode` is the one currently in effect (must be a
  // member of `salesPointCodes`, or `null` = none set). The walk-in sell page's
  // default-pickup mechanism moved server-side to `RouteStopsDto.defaultPickupStopSlug`.
  salesPointCodes?: string[];
  activeSalesPointCode?: string | null;
  // OBRS-1230 / ADR-0123: true for a guest shadow user (created from a
  // walk-in/offline booking, never authenticates, carries zero roles by
  // design). Sent by GET /private/users (UserSummaryResponse) — NOT by
  // GET /private/users/{id}, whose UserDetailResponse has no such field.
  // Corrected OBRS-1255, having read both records: the modal must therefore
  // read `UserRow.guest` (the list row), never `userDetail.guest`, which is
  // always undefined and would have made every guest row look like a normal
  // one the moment the detail patch landed.
  guest?: boolean;
}

/** A single seat on a vehicle type's seat map, as the backend actually returns it
 * (record `LayoutResponse`: `seatNumber`, `rowIndex`, `columnIndex`). There is no
 * seat-map-TEMPLATE entity on the backend — this is one seat's position, the same
 * record shape `ChangeSeatAvailabilityRespDto` exposes under the field name `seats`. */
export interface LayoutResponse {
  seatNumber: string;
  rowIndex: number;
  columnIndex: number;
}

export interface AdminVehicleTypeDto {
  id: number;
  slug: string;
  code?: string;
  totalSeats?: number;
  /** OBRS-1477 (ADR-0137): the vehicle type's standing commercial cap — how many of
   * its `totalSeats` may actually be sold. `null`/absent = no cap. NOT interchangeable
   * with `totalSeats`, which stays the physical seat map and is what a per-trip
   * override is validated against. */
  sellableSeats?: number | null;
  status?: string | AdminStatusDto;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
  /** The vehicle type's individual seats — only present on the vehicle-type
   * detail endpoint. Each entry is one physical seat (`seatNumber`,
   * `rowIndex`, `columnIndex`); there is no seat-map-template entity to pick
   * from (OBRS-517 removed the FE control that once assumed one existed). */
  seatMaps?: LayoutResponse[];
  /** OBRS-508: parcel cargo quota for this vehicle type, in kg. `null` = not
   * configured — effective capacity falls back to the per-schedule override
   * only; if BOTH are null, parcel booking is refused
   * (409 PARCEL_CARGO_CAPACITY_NOT_CONFIGURED). */
  cargoCapacityKg?: number | null;
}

/** OBRS-508: `PATCH /vehicle-types/{id}/cargo-capacity` request body — the
 * ONLY field this endpoint accepts. Replaces an earlier full-replace-PUT
 * design (which required forwarding every vehicle-type field to avoid
 * wiping the seat map/translations); the backend now exposes this narrow
 * PATCH instead, so the hazard doesn't apply here. */
export interface UpdateVehicleTypeCargoCapacityPayload {
  cargoCapacityKg: number | null;
}

export interface AdminVehicleDto {
  id: number;
  numberPlate?: string;
  vehicleNumber?: string;
  status?: string | AdminStatusDto;
  vehicleType?: AdminVehicleTypeDto;
  createdAt?: string;
  updatedAt?: string;
  /** OBRS-316 Gap 1: vehicle detail attributes, all optional/nullable on the backend. */
  brand?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
  colour?: string | null;
  engineCc?: number | null;
  chassisNumber?: string | null;
  note?: string | null;
  /**
   * OBRS-835: the vehicle's Thaistar GPS tracker. Present ONLY on the single-vehicle
   * detail read (`GET /vehicles/{id}`) — the backend's `toDetailDto` deliberately leaves
   * it off the fleet list and off the copy nested in a schedule, which drivers can read.
   * So a `VehicleRow` built from the list never carries it, and a form seeded from that
   * row has nothing to echo back.
   */
  gpsImei?: string | null;
  /**
   * OBRS-1332: the driver who normally drives this vehicle, `null` for none. Rides the
   * same detail-only narrowing as `gpsImei` above — the fleet list does not carry it and
   * neither does the copy nested in a schedule, so a form seeded from a row has nothing
   * to echo back until the detail fetch lands.
   */
  assignedDriverId?: number | null;
}

/** OBRS-209: a single vehicle-maintenance record (backend OBRS-102).
 * `maintenanceStatus` is a flat `maintenance_status` Lookup **slug string**
 * (e.g. "scheduled"), NOT a Lookup object — mirrors `AdminVehicleDto.status`'s
 * plain-string shape, confirmed against the live `VehicleMaintenanceRespDto`. */
export interface AdminVehicleMaintenanceDto {
  id: number;
  vehicleId: number;
  reason: string;
  startDate: string;
  endDate?: string | null;
  nextDueDate?: string | null;
  maintenanceStatus: string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** OBRS-312: `GET /api/private/vehicles/{vehicleId}/inspections` list-row
 * shape (owner/admin read-only history), newest first. `pendingMaintenance`
 * drives the row's pending-review indicator and the default 2-week filter —
 * see `vehicle-inspection.mappers.ts`. */
export interface VehicleInspectionListItemDto {
  id: number;
  inspectedAt: string;
  inspectedByName: string;
  odometerKm: number;
  defectCount: number;
  pendingMaintenance: boolean;
}

/** OBRS-312: one checklist row in `GET
 * /api/private/vehicles/{vehicleId}/inspections/{id}`. `itemLabelSnapshot` is
 * the label AS INSPECTED (immutable history) — distinct from
 * `VehicleInspectionItemDto.label`, which reflects the master list's CURRENT
 * label and may have since changed/been retired.
 *
 * OBRS-553: `categorySnapshot` (stable enum CODE, e.g. `'TIRES'`) and
 * `categoryOrder` (1-based, the backend enum's declaration order at SUBMIT
 * time) join `itemLabelSnapshot` as the frozen-at-submit set — a later
 * re-group of the master checklist must not reshuffle a sheet a driver
 * already signed. The backend orders the response by
 * `(categorySnapshot's declaration order, displayOrderSnapshot, id)`
 * server-side; the FE never re-derives group order from the string, it only
 * cuts contiguous runs on `categorySnapshot` — see `groupDetailRowsByCategory`
 * in `vehicle-inspection.mappers.ts`. (`groupRowsByCategory` is the driver
 * form's sibling caller of the same shared walk, in
 * `staff/pages/inspection/inspection-page.mappers.ts` — not this surface.)
 *
 * `categoryOrder` is currently informational on this side: the FE deliberately
 * does NOT sort, so nothing reads it. It is on the wire so that any future
 * client-side ordering has the declaration order available and can never be
 * tempted to alphabetise `categorySnapshot`. */
export interface VehicleInspectionDetailItemDto {
  itemId: number;
  itemLabelSnapshot: string;
  verdict: 'ok' | 'needs_repair';
  note: string;
  categorySnapshot: string;
  categoryOrder: number;
}

/** OBRS-312: `GET /api/private/vehicles/{vehicleId}/inspections/{id}` —
 * the list-row header fields plus the ordered checklist. */
export interface VehicleInspectionDetailDto extends VehicleInspectionListItemDto {
  items: VehicleInspectionDetailItemDto[];
}

/** OBRS-509: one locale row on the inspection-item master list's admin
 * editor (`GET /manage`, POST/PUT request+response) — distinct from the
 * driver-facing `VehicleInspectionDetailItemDto` above (which carries a
 * single locale-resolved `itemLabelSnapshot`, not raw per-locale rows). */
export interface AdminInspectionItemTranslationDto {
  locale: string;
  label: string;
  description?: string | null;
}

/** OBRS-509: one row of the vehicle-inspection checklist MASTER LIST, as
 * seen by the owner/admin editor (`GET /manage`) — distinct from
 * `getVehicleInspections()`/`getVehicleInspectionById()` above, which are the
 * per-vehicle inspection HISTORY (read-only). `id` is a JSON **number**
 * (BIGSERIAL), never a string (the OBRS-376 defect). `translations` always
 * carries all 3 locale rows, sorted en/th/zh by the backend mapper.
 *
 * OBRS-530: `category` (stable enum CODE, e.g. `'TIRES'`) and `categoryOrder`
 * (1-based, the backend enum's declaration order) group the checklist by
 * vehicle zone — see `VehicleInspectionItemDto` in staff-api.service.ts for
 * the driver-facing twin of these same two fields. */
export interface AdminInspectionItemDto {
  id: number;
  code: string;
  displayOrder: number;
  active: boolean;
  category: string;
  categoryOrder: number;
  translations: AdminInspectionItemTranslationDto[];
}

/** OBRS-509: POST/PUT request body — identical shape for create and edit
 * (SPEC §3.3/§3.4). `displayOrder` is deliberately NOT a field here — it is
 * server-owned, assigned `max+1` on create and mutated only via `/reorder`.
 * OBRS-529: `code` is now optional — the backend generates it server-side on
 * create, so the FE omits it entirely there (nothing to send: there is no
 * form field for it anymore); an edit still forwards the item's existing,
 * unchanged code.
 * OBRS-530: `category` is required on BOTH create and update (mirrors the
 * backend's `@NotNull` on `VehicleInspectionItemReqDto.category`) — unlike
 * `active`'s nullable carry-forward, editing `category` IS the cross-group
 * move mechanism, so an edit must always REPLACE it, never omit it. */
export interface InspectionItemPayload {
  code?: string;
  active: boolean;
  category: string;
  translations: AdminInspectionItemTranslationDto[];
}

/** OBRS-509: `PUT /vehicle-inspection-items/reorder` request body — the
 * WHOLE table, every row including retired ones (display_order is unique
 * table-wide, SPEC §3.5). */
export interface InspectionItemReorderReqDto {
  items: { id: number; displayOrder: number }[];
}

export interface AdminRouteDto {
  id: number;
  slug: string;
  code?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminStopDto {
  id?: number;
  slug?: string;
  code?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

// ── OBRS-1022: the owner-facing stop management shapes ────────────────────────
// Distinct from AdminStopDto above, which is the thin nested shape a route-stop
// row carries. These mirror StopSummaryResponse / StopDetailResponse, the two
// payloads the stop endpoints actually return.

/** A lookup as the stop endpoints return it: slug + per-locale label/description. */
export interface AdminStopLookupDto {
  id?: number;
  slug?: string;
  translations?: AdminTranslationCollection;
}

export interface AdminStopSummaryDto {
  id: number;
  slug: string;
  status?: AdminStopLookupDto;
  stopType?: AdminStopLookupDto;
  translations?: AdminTranslationCollection;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminStopDetailDto {
  id: number;
  slug: string;
  status?: AdminStopLookupDto;
  stopType?: AdminStopLookupDto;
  province?: AdminStopLookupDto;
  translations?: AdminTranslationCollection;
  latitude?: number | string | null;
  longitude?: number | string | null;
  primaryPhotoUrl?: string | null;
  /** locale -> address; a locale with no address is absent, not null. */
  addresses?: Record<string, string> | null;
}

/**
 * The body of `PUT /api/private/stops/{id}`.
 *
 * <p>`primaryPhotoUrl` is deliberately ABSENT from this type — not optional,
 * absent. The server preserves the stored photo exactly when the key does not
 * appear, so making the field un-sendable is what stops a form save from ever
 * wiping an uploaded photo (OBRS-580). The photo has its own two endpoints.
 */
export interface AdminStopUpdatePayload {
  slug: string;
  province: string;
  status: string;
  stopType: string;
  latitude: number | null;
  longitude: number | null;
  addresses: Record<string, string>;
  translations: AdminTranslationReqDto[];
}

export interface AdminStopPhotoDto {
  primaryPhotoUrl: string;
}

export interface AdminStopOrderDto {
  stopOrder: number;
  distanceKmFromOrigin?: number | string;
  offsetMinutesFromOrigin?: number;
  stop?: AdminStopDto;
}

export interface AdminRouteStopDto {
  route?: AdminRouteDto;
  stops: AdminStopOrderDto[];
}

export interface AdminNewTranslationDto {
  slug?: string;
  name?: string;
}

export interface AdminStopPairDto {
  segmentId?: number;
  fromStop?: AdminNewTranslationDto;
  toStop?: AdminNewTranslationDto;
  vehicleType?: AdminNewTranslationDto;
  fare?: string;
  estimatedDurationMinutes?: number;
}

export interface AdminSegmentDto {
  route?: AdminNewTranslationDto;
  stopPairs: AdminStopPairDto[];
}

export interface AdminStopPairReqDto {
  fromStop: string;
  toStop: string;
  fare: number;
  estimatedDurationMinutes?: number;
}

export interface AdminSegmentReqDto {
  route: string;
  vehicleType: string;
  stopPairs: AdminStopPairReqDto[];
}

export interface AdminScheduleSetDto {
  id: number;
  startDate?: string;
  endDate?: string;
  departureTimes: string[];
  frequency?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  route?: AdminRouteDto;
  vehicleType?: AdminVehicleTypeDto;
}

export interface AdminDriverInfoDto {
  id?: number;
  fullName?: string;
  phoneNumber?: string;
}

export interface AdminScheduleDto {
  id: number;
  scheduleSetId?: number | null;
  departureDateTime?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  route?: AdminRouteDto;
  vehicle?: AdminVehicleDto;
  vehicleType?: AdminVehicleTypeDto;
  driver?: AdminDriverInfoDto;
  /** Overridden seating capacity; null means use vehicleType.totalSeats as the effective value. */
  seatingCapacity?: number | null;
  /** OBRS-272: set once staff marks the trip delayed via
   * `PATCH /api/private/schedules/{id}/delay` — `status` STAYS `scheduled`;
   * "delayed" is a derived UI state off these two fields, never a status code
   * (see `BoardingListComponent.isScheduleDelayed`). `null`/absent = not delayed. */
  delayedDepartureDateTime?: string | null;
  delayReason?: string | null;
  // OBRS-283: whether this trip can still be hard-DELETEd (no booking history
  // referencing it). `false` means the delete button must instead soft-cancel
  // via `POST /schedules/{id}/cancel` — see shared/lib/schedule-delete-mode.ts.
  // Optional/undefined on a cached row predating this field, or on a Schedule
  // Set row (a different endpoint/DTO — sets never carry this field).
  deletable?: boolean;
  /** OBRS-283: count of CONFIRMED bookings affected by cancelling this trip
   * (drives the refund vs. no-refund confirm-dialog copy). */
  confirmedBookingCount?: number;
  /** OBRS-508: per-trip cargo quota override, in kg. `null`/absent = inherit
   * from `vehicleType.cargoCapacityKg`. */
  cargoCapacityKg?: number | null;
  /** OBRS-451: `true` when the backend resolves the CURRENT session as
   * assigned to this schedule (a driver's own trip). The backend is the sole
   * owner of this predicate — the frontend must never derive it from a
   * client-held id (see `BoardingListComponent.canShowScheduleStatusAction`).
   *
   * The value for a NON-driver session (salesperson/admin/owner, where
   * "assignment" doesn't apply) is deliberately unspecified here and MUST NOT
   * be relied on: `canShowScheduleStatusAction` short-circuits `true` for any
   * session that isn't a pure driver, so it never reads this field for them.
   * Whether the backend answers `true` or `false` there is its own choice.
   *
   * Optional/undefined on a cached row predating this field — consumers must
   * treat absent as NOT assigned (`=== true`), never as "unknown, so allow". */
  assignedToMe?: boolean;
}

// OBRS-283: response of POST /api/private/schedules/{id}/cancel (soft-cancel —
// flips status to CANCELLED; affected CONFIRMED bookings are refunded async).
export interface CancelScheduleRespDto {
  scheduleId: number;
  status: string;
  affectedBookingCount: number;
}

export interface AdminPersonDto {
  name?: string;
  fullName?: string;
}

export interface AdminBookingStopDto {
  code?: string;
  slug?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminBookingScheduleDto {
  fromStop?: AdminBookingStopDto;
  toStop?: AdminBookingStopDto;
  departureDateTime?: string;
  arrivalDateTime?: string;
}

export interface AdminBookingJourneyDto {
  fromStop?: AdminBookingStopDto;
  toStop?: AdminBookingStopDto;
  departureDateTime?: string;
  arrivalDateTime?: string;
}

export interface AdminPriceSummaryDto {
  basePrice?: string;
  discount?: string;
  fee?: string;
  netAmount?: string;
  currency?: string;
}

export interface AdminBookingDto {
  id: number;
  bookingNumber?: string;
  totalAmount?: number | string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  contact?: AdminPersonDto;
  actor?: AdminPersonDto;
  bookingSchedules?: AdminBookingScheduleDto[];
  journeys?: AdminBookingJourneyDto[];
  pricing?: AdminPriceSummaryDto;
  payment?: AdminPaymentSummaryDto;
}

export interface AdminPaymentSummaryDto {
  overallPaymentStatus?: string;
  totalAmount?: string;
  paidAmount?: string;
  outstandingAmount?: string;
  refundedAmount?: string;
  currency?: string;
  status?: string;
}

export interface AdminPaymentByBookingIdDto {
  bookingId: number;
  paymentSummary?: AdminPaymentSummaryDto;
  transactions?: AdminPaymentTransactionDto[];
}

export interface AdminPaymentTransactionDto {
  transactionId?: string;
  paymentMethod?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  gatewayResponse?: string;
  paidAt?: string;
  remark?: string;
}

// OBRS-280: GET /api/private/bookings/{id} (admin booking detail dialog).
// Shape verified against the live backend record types (not guessed):
// `BookingDetailResponse.java` + its nested `business`/`business.localized`
// records. Booking/ticket `status`, `bookingType`, `passengerType`, and the
// journey `fromStop`/`toStop` all come back as `{code, label}`
// (`LocalizedResponse` implementations) — structurally a subset of the
// existing `AdminStatusDto`, so they're typed with it here rather than a new
// interface (reuses `parseAdminStatus`/`getAdminLookupLabel` too).
export interface AdminBookingTicketDto {
  id?: number;
  ticketNumber?: string;
  passengerType?: AdminStatusDto;
  passengerName?: string;
  seatNumber?: string;
  // Ticket status is included for EVERY ticket on the booking, including
  // CANCELLED/REFUNDED legs — the detail dialog must not filter them out.
  status?: string | AdminStatusDto;
}

export interface AdminBookingDetailJourneyDto {
  legType?: AdminStatusDto;
  fromStop?: AdminStatusDto;
  toStop?: AdminStatusDto;
  departureDateTime?: string;
  arrivalDateTime?: string;
  tickets?: AdminBookingTicketDto[];
}

export interface AdminBookingActorDetailDto {
  id?: number;
  name?: string;
  type?: string;
  channel?: string;
  officeName?: string;
}

export interface AdminBookingContactDetailDto {
  fullName?: string;
  phoneNumber?: string;
}

// OBRS-690 / OBRS-661 AC9: request body for the OWNER override-cancel endpoint.
// `rateChoice` is a closed two-value enum — POLICY (refund the normal
// window-based rate) or FULL (100% refund) — deliberately NOT a free BigDecimal
// (ADR-0103: the numeric field is the fraud vector). Both fields are optional on
// the wire (a bare POST = POLICY, no reason); `reason` becomes mandatory on the
// backend only when a rule is broken.
export type OverrideRefundRateChoice = 'POLICY' | 'FULL';

export interface OverrideCancelReqDto {
  rateChoice?: OverrideRefundRateChoice;
  reason?: string;
  /** OBRS-286 — required by the backend for a non-cash manual refund, optional
   * for the cash share (ADR-0109). Mirrors `CancelBookingReqDto` (customer
   * path) exactly — same request field, same SA contract shape. */
  refundDestination?: RefundDestinationReqDto;
}

// OBRS-286 SA contract #5 — GET /private/admin/bookings/{id}/refund-method.
// `destinationRequired` is the SERVER's own answer to the exact predicate
// `resolveRefundDestination` applies at submit time — the FE reads it
// directly and never re-derives it from `refundMethod` (that re-derivation is
// the specific defect this endpoint exists to eliminate; see Flow A3 in the
// UI spec). `refundMethod` is carried for display/debugging only.
export interface AdminBookingRefundMethodDto {
  refundMethod: string;
  destinationRequired: boolean;
  /**
   * OBRS-699 — the instant self-service cancellation closes for THIS booking,
   * `earliestDeparture - cancel_window_hours` under the operator selling the
   * trip. It rides on this response and not on the cancel quote because
   * `getCancellationPolicy` throws `cancel.error.window-closed` once the window
   * has passed — a 400 in precisely the state the override modal exists for.
   * This endpoint never window-gates, and the modal already calls it on open.
   *
   * Absent/null means the backend could not resolve a governing operator, never
   * "use the platform window": the modal states no deadline rather than one
   * that may belong to a different operator.
   */
  cancellationDeadline?: string | null;
  /**
   * OBRS-699 — the two window-based refund rates this endpoint already computes with
   * (`resolveRefundRate`, under the same operator), as 0.0–1.0 rates. The override modal
   * states them under the POLICY choice; they used to be typed into the i18n bundle as
   * "(80% / 50%)", which is the PLATFORM pair and therefore wrong for any owner who sets
   * their own.
   *
   * Unlike `cancellationDeadline` these are never null: an unresolved operator degrades to
   * the platform read, and that is the number this endpoint itself refunds by — so there is
   * no "no data" state to render, only a not-yet-fetched one.
   */
  policyRefundRateEarly?: number;
  policyRefundRateLate?: number;
}

// OBRS-286 SA contract #4 — POST /private/payments/{id}/manual-refund.
// `amountTransferred` is an OPTIONAL soft confirmation for a normal row (the
// backend already has the persisted `amount_owed`); it is REQUIRED only on
// the legacy no-mrr-row path (SA rule 3). The FE never decides which case it
// is — it always sends whatever the operator typed (pre-filled from
// `amountOwed`) and lets the backend 400 if that turns out to be the wrong
// case for this row.
export interface MarkPaymentManualRefundReqDto {
  transferReference: string;
  amountTransferred?: number;
}

export interface AdminBookingDetailDto {
  id: number;
  bookingNumber?: string;
  bookingType?: AdminStatusDto;
  status?: string | AdminStatusDto;
  createdAt?: string;
  expiredAt?: string;
  actor?: AdminBookingActorDetailDto;
  contact?: AdminBookingContactDetailDto;
  journeys?: AdminBookingDetailJourneyDto[];
  // Reuses the existing list-endpoint DTOs — `PriceSummaryResponse`/
  // `PaymentSummaryResponse` on the backend match these field-for-field.
  pricing?: AdminPriceSummaryDto;
  payment?: AdminPaymentSummaryDto;
}

export function getAdminTranslationLabel(
  translations: AdminTranslationCollection | null | undefined,
  locale?: string
): string | null {
  const translation = getAdminTranslation(translations, locale);
  return translation?.label ?? null;
}

export function getAdminTranslationDescription(
  translations: AdminTranslationCollection | null | undefined,
  locale?: string
): string | null {
  const translation = getAdminTranslation(translations, locale);
  return translation?.description ?? null;
}

export function parseAdminStatus(
  value: string | AdminStatusDto | null | undefined,
  locale?: string
): { code: string; name: string } {
  if (typeof value === 'string') {
    const code = value.trim().toLowerCase();
    return {
      code,
      name: code.replace(/_/g, ' ').toUpperCase(),
    };
  }

  const code = String(value?.code ?? value?.slug ?? 'unknown').trim().toLowerCase();
  const fallbackName = code.replace(/_/g, ' ').toUpperCase();
  const localizedLabel =
    getAdminTranslationLabel(value?.display, locale) ??
    getAdminTranslationLabel(value?.display, 'en') ??
    getAdminTranslationLabel(value?.translations, locale) ??
    getAdminTranslationLabel(value?.translations, 'en');

  return {
    code,
    name: String(value?.name ?? value?.label ?? localizedLabel ?? fallbackName),
  };
}

export function getAdminLookupCode(
  value: { code?: string; slug?: string } | null | undefined
): string {
  return String(value?.slug ?? value?.code ?? '').trim();
}

export function getAdminLookupLabel(
  value:
    | {
        code?: string;
        slug?: string;
        display?: AdminTranslationCollection;
        translations?: AdminTranslationCollection;
        name?: string;
        label?: string;
      }
    | null
    | undefined,
  locale?: string
): string | null {
  const fallbackCode = getAdminLookupCode(value);

  return (
    value?.name ??
    value?.label ??
    getAdminTranslationLabel(value?.display, locale) ??
    getAdminTranslationLabel(value?.display, 'en') ??
    getAdminTranslationLabel(value?.translations, locale) ??
    getAdminTranslationLabel(value?.translations, 'en') ??
    (fallbackCode || null)
  );
}

function getAdminTranslation(
  translations: AdminTranslationCollection | null | undefined,
  locale?: string
): AdminTranslationDto | null {
  if (!translations) {
    return null;
  }

  if (Array.isArray(translations)) {
    if (translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label || translation?.description) {
        return translation;
      }
    }

    return translations.find((item) => item.label || item.description) ?? null;
  }

  const normalizedLocale = locale?.toLowerCase();
  if (normalizedLocale) {
    const translation = translations[normalizedLocale];
    if (translation?.label || translation?.description) {
      return translation;
    }
  }

  const fallbackTranslation = Object.values(translations).find(
    (translation) => translation?.label || translation?.description
  );
  return fallbackTranslation ?? null;
}

export interface CreateLookupPayload {
  category: string;
  slug: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateRolePayload {
  slug: string;
  status: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateUserPayload {
  // OBRS-1231: omitted when blank. `@Size(min = 2)` on the DTO skips a null but NOT an
  // empty string, so sending "" for "no title" would 400 even with @NotBlank gone.
  title?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  preferredLocale: string;
  status: string;
  roles: string[];
  pdpaConsent: boolean;
}

export interface UpdateUserPayload {
  // OBRS-1231: omitted when blank - see CreateUserPayload.title.
  title?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  // OBRS-1255: the three keys a guest shadow row omits entirely (AC2 / owner's option C). Optional
  // in the TYPE so omitting them is a legal shape rather than a cast — and optional on the server
  // only under `UserUpdateReqDto.FullAccount`, a validation group it runs after loading the row.
  // Any row that is not `auth_provider = 'GUEST'` still requires all three; the decision is made
  // from the stored row, never from which keys arrived. See toUpdateUserPayload.
  email?: string;
  phoneNumber: string;
  isPhoneNumberVerify?: boolean;
  preferredLocale: string;
  status: string;
  roles?: string[];
}

// OBRS-1258: `PUT /api/private/users/{id}/sales-points` is a dedicated endpoint,
// always a full replace of both fields — `UserUpdateReqDto` (UpdateUserPayload
// above) cannot touch sales points by construction.
export interface UpdateUserSalesPointsPayload {
  salesPointCodes: string[];
  activeSalesPointCode: string | null;
}

// OBRS-316 Gap 1: PUT /api/private/vehicles/{id} is a full-replace, so the form
// MUST send all 7 attribute fields on every submit (create AND edit) — they are
// non-optional KEYS here (always serialized), even though each value is nullable.
export interface CreateVehiclePayload {
  vehicleType: string;
  numberPlate: string;
  // OBRS-842: nullable — a `retired` vehicle has handed its หมายเลขพาหนะ to whichever
  // vehicle replaced it and genuinely holds none (V58 made the column nullable, and
  // VehicleReqDto#isVehicleNumberValid requires it for every OTHER status).
  vehicleNumber: string | null;
  status: string;
  brand: string | null;
  model: string | null;
  manufactureYear: number | null;
  colour: string | null;
  engineCc: number | null;
  chassisNumber: string | null;
  note: string | null;
  /**
   * OBRS-835: the GPS tracker to fit to this vehicle. `null` DETACHES the box; the key
   * being ABSENT would mean "leave whatever is there" on the backend
   * (`VehicleDtoService#applyTo` is conditional on this one field). This form always
   * sends it, because Save is blocked whenever the detail fetch that supplies its
   * current value failed — see the modal's `isEditDetailError` guard.
   */
  gpsImei: string | null;
  /**
   * OBRS-1332: the vehicle's regular driver. `null` UNASSIGNS; an absent key would mean
   * "leave whoever is there" (`applyTo` is conditional on this field too — it is the
   * fourth of that shape). Always sent, for the same reason as `gpsImei` above.
   */
  assignedDriverId: number | null;
}

/** OBRS-209: create/update payload for a vehicle-maintenance record.
 * `maintenanceStatus` is the `maintenance_status` Lookup's **slug string**
 * (e.g. "scheduled") — same shape as `CreateVehiclePayload.status`, matching
 * the live backend `VehicleMaintenanceReqDto` (`@NotBlank String maintenanceStatus`). */
export interface CreateVehicleMaintenancePayload {
  reason: string;
  startDate: string;
  endDate?: string | null;
  nextDueDate?: string | null;
  maintenanceStatus: string;
  notes?: string | null;
}

/**
 * OBRS-1333: one row of a vehicle's preventive-maintenance plan —
 * `GET/POST/PUT /api/private/vehicles/{vehicleId}/maintenance-plans`.
 * `part` is one of the closed `EMaintenancePart` enum codes (a static
 * FE-side list, `MAINTENANCE_PART_CODES` in `vehicle-maintenance-plan.mappers.ts`
 * — NOT a `lookups` category, unlike `AdminVehicleMaintenanceDto.maintenanceStatus`
 * above). `nextDueKm`/`nextDueDate` are backend-derived and read-only — the FE
 * never recomputes them, it only displays whatever the server sent. */
export interface AdminVehicleMaintenancePlanDto {
  id: number;
  vehicleId: number;
  part: string;
  intervalKm?: number | null;
  intervalDays?: number | null;
  lastDoneKm?: number | null;
  lastDoneDate?: string | null;
  active: boolean;
  nextDueKm?: number | null;
  nextDueDate?: string | null;
  createdByName?: string;
  createdAt?: string;
  updatedByName?: string;
  updatedAt?: string;
}

/** OBRS-1333: create/update payload for a vehicle-maintenance-plan record —
 * identical shape for POST and PUT, mirroring `CreateVehicleMaintenancePayload`. */
export interface CreateVehicleMaintenancePlanPayload {
  part: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneKm: number | null;
  lastDoneDate: string | null;
}

/** OBRS-1333: `POST /maintenance-plans` 201 response body. */
export interface CreateVehicleMaintenancePlanRespDto {
  planId: number;
}

/** OBRS-685: `GET /api/private/expenses` / `GET /{id}` response row.
 * `vehicleId` is `null` for a central/not-linked-to-a-vehicle expense — a
 * REAL nullable Long on the wire, distinct from the FE form's own
 * `VEHICLE_CENTRAL_SENTINEL` string, which only exists inside the form
 * control (see `expenses-page.mappers.ts`). `category` is one of the 14
 * fixed enum codes (FUEL/REPAIR/VEHICLE_TAX/ACT/INSURANCE/INSPECTION/TIRE/
 * GPS/TOLL/PERMIT_FEE/DRIVER_WAGE/INSTALMENT/CENTRAL/OTHER — the last four
 * added by OBRS-961; `EXPENSE_CATEGORY_CODES` is the single list to read,
 * this comment is prose that can rot). Audit fields are `@JsonUnwrapped` on the backend DTO —
 * flattened here, read-only, never sent back by the form (§9 of the UX spec). */
export interface AdminExpenseDto {
  id: number;
  /** OBRS-791/808: the operator that BEARS this cost. NOT NULL on the backend
   * since V55, and deliberately NOT derived from `vehicleId` — that one is
   * nullable (a central expense has no vehicle), so an operator's own central
   * costs would otherwise have no route to them at all. Optional here only
   * because the FE cannot make the wire older than it is: a cached response
   * from before V55 has no such key. Only the admin list renders it; an owner
   * sees exclusively their own rows, so naming the operator on every line would
   * be noise. */
  ownerId?: number;
  vehicleId: number | null;
  category: string;
  categoryOtherLabel?: string | null;
  amount: number;
  vatAmount?: number | null;
  expenseDate: string;
  receiptNo?: string | null;
  paidBy?: string | null;
  note?: string | null;
  createdByName?: string;
  createdAt?: string;
  updatedByName?: string;
  updatedAt?: string;
  /**
   * OBRS-960: `'FIELD'` for a row the backend auto-created from a driver's
   * cash-panel expense entry (immutable here — edit/delete are disabled with
   * a reason, design-system §12 "disabled with a reason, not absent");
   * `'MANUAL'` for an admin/owner-entered row (unchanged behavior). Optional
   * so a cached pre-OBRS-960 response (field absent) renders as the existing
   * MANUAL row — same absence-reads-as-normal convention the Vehicle "-"
   * rendering already uses, per the card.
   */
  source?: 'FIELD' | 'MANUAL';
  /**
   * OBRS-1356: the owner's review verdict. Only a `FIELD` row is ever
   * `'PENDING'`; an owner-keyed row is `'APPROVED'` the moment it exists, and
   * so is every row written before this card. Optional for the same
   * absence-reads-as-normal reason as `source` above.
   */
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
}

/** OBRS-685: `ExpenseReqDto` — sent verbatim by the create/edit form
 * (`toExpensePayload()` in `expenses-page.mappers.ts`). Every optional field
 * is an explicit key (`null` when blank), never omitted — same full-replace
 * contract as `CreateVehiclePayload` above, and PUT sends all 9 fields. */
export interface CreateExpensePayload {
  /** OBRS-808: which operator bears the cost. Read by the backend on **POST
   * from an ADMIN only** — for any other caller it is ignored (not rejected:
   * ignoring makes a cross-tenant write unexpressible rather than merely
   * refused), and on PUT it is ignored for everyone, because re-attributing an
   * expense is a delete-and-recreate rather than a field edit. `null` from an
   * admin's POST is the 400 `EXPENSE_OWNER_REQUIRED` this card exists to stop
   * the user ever reaching. */
  ownerId: number | null;
  vehicleId: number | null;
  category: string;
  categoryOtherLabel: string | null;
  amount: number;
  vatAmount: number | null;
  expenseDate: string;
  receiptNo: string | null;
  paidBy: string | null;
  note: string | null;
}

/** OBRS-685: `POST /api/private/expenses` 201 response body. */
export interface CreateExpenseRespDto {
  expenseId: number;
}

/** OBRS-809: one operator, as returned by `GET /api/private/owners`.
 *
 * That endpoint is `@PreAuthorize("hasRole('ADMIN')")` — the reverse of nearly
 * every other admin call in this service, which guards on `OWNER` and lets
 * `ADMIN` in through the role hierarchy. An operator that could enumerate the
 * operator table would learn how many competitors share the platform and what
 * they are called, so **an `owner` caller gets 403 here, by design**. Never
 * call it without checking the role first: a 403 is not a recoverable empty
 * list, it is a caller who should not have asked.
 *
 * No `taxId` — the backend deliberately does not return one (see
 * `docs/api/owners.md`). */
export interface AdminOwnerDto {
  id: number;
  slug: string;
  displayName: string;
  legalName: string;
}

export interface CreateRoutePayload {
  slug: string;
  status: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateScheduleSetPayload {
  startDate: string;
  endDate: string;
  departureTimes: string[];
  frequency?: string;
  status: string;
  route: string;
  vehicleType: string;
}

export interface CreateSchedulePayload {
  departureDateTime: string;
  route: string;
  vehicleType: string;
  vehicleId?: number;
  driverId?: number;
  // OBRS-508: POST and PUT /api/private/schedules share one backend
  // ScheduleReqDto shape (docs/api/scheduling.md), so the per-trip cargo
  // override is valid on create too. Optional/omittable, unlike
  // UpdateSchedulePayload's required field below — a brand-new schedule with
  // no override simply doesn't send the key (null-equivalent on the backend).
  cargoCapacityKg?: number | null;
}

export interface UpdateSchedulePayload {
  route: string;
  vehicleType: string;
  vehicleId: number | null;
  driverId: number | null;
  departureDateTime: string;
  seatingCapacity: number | null;
  /** OBRS-508: per-trip cargo quota override, in kg. `null` = inherit from
   * the vehicle type's own cargoCapacityKg. */
  cargoCapacityKg: number | null;
}

/** OBRS-1471: the two capacity overrides an edit form may have no control for.
 * Because updateSchedule() is a full replace, such a form has to read them off
 * the schedule it opened and send them straight back — see
 * `toScheduleCapacityCarryForward()`. */
export interface ScheduleCapacityCarryForward {
  seatingCapacity: number | null;
  cargoCapacityKg: number | null;
}

/** OBRS-1471: `undefined` (field absent on a cached/fallback DTO) and `null`
 * (override deliberately cleared) both collapse to `null` here, which is what
 * the backend reads as "inherit from the vehicle type". */
export function toScheduleCapacityCarryForward(
  dto: AdminScheduleDto | null | undefined
): ScheduleCapacityCarryForward {
  return {
    seatingCapacity: dto?.seatingCapacity ?? null,
    cargoCapacityKg: dto?.cargoCapacityKg ?? null,
  };
}

export interface DriverDto {
  id: number;
  name: string;
}

// OBRS-85: round-trip discount promotion (a singleton config row, slug
// 'round_trip'). Amount fields come back as BigDecimal on the backend, which
// Jackson can serialize as either a JSON number or a numeric string depending
// on config — typed as `number | string` like AdminBookingDto.totalAmount, and
// coerced with Number(...) by the consuming page.
export interface PromotionRespDto {
  id: number;
  slug?: string;
  code?: string;
  discountType?: string | AdminStatusDto;
  status?: string | AdminStatusDto;
  discountValue?: number | string;
  // OBRS-109 (#37): full CRUD adds these — always present on the general
  // list/detail endpoints, but optional here since the round-trip singleton
  // endpoint (OBRS-85) predates them and this DTO is shared by both.
  maxDiscountAmount?: number | string | null;
  minBookingAmount?: number | string;
  startDateTime?: string | null;
  endDateTime?: string | null;
  usageLimit?: number | null;
  currentUsage?: number;
  autoApply?: boolean;
  translations?: AdminTranslationCollection;
}

// OBRS-109 (#37): full-replace payload for the general promotion CRUD
// endpoints (distinct from UpdateRoundTripPromotionPayload's partial PATCH
// contract, which stays scoped to the round-trip singleton row).
export interface PromotionReqDto {
  slug: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minBookingAmount?: number | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  usageLimit?: number | null;
  status: string;
  autoApply: boolean;
  translations: AdminTranslationReqDto[];
}

// Partial payload — the promotions page only sends fields the admin actually
// changed (design-system.md: don't overwrite fields the user didn't touch).
// NOTE: the backend's RoundTripPromotionReqDto reads `active: boolean`, NOT a
// `status` string — Spring silently drops unknown fields, so this must match
// the wire contract exactly, even though PromotionRespDto (and the store) use
// `status`. The page translates active<->status at its edges.
export interface UpdateRoundTripPromotionPayload {
  discountValue?: number;
  active?: boolean;
  startDateTime?: string | null;
  endDateTime?: string | null;
  minBookingAmount?: number;
}

// OBRS-223: reminder-timing config, a singleton row (like the round-trip
// promotion above) — GET/PUT `/api/private/admin/configs/reminders`, shipped
// backend-only by OBRS-139. Both fields are required positive integers on
// the wire; the backend evicts its cache after PUT (no FE cache concern).
export interface ReminderConfigDto {
  reminderHoursBeforeDeparture: number;
  boardingReminderMinutesBeforeDeparture: number;
}

// OBRS-358: jump-seat (walk-in-only seat channel) toggle, a singleton row —
// same shape/lifecycle as ReminderConfigDto above — GET/PUT
// `/api/private/admin/configs/jump-seat`, ADMIN-only. Disabling blocks staff
// from selling the jump seat entirely (even when normal seats are full); has
// no effect on the online channel, which never offers it.
export interface JumpSeatConfigDto {
  enabled: boolean;
}

// OBRS-564: booking-policy config, a singleton row (same shape/lifecycle as
// ReminderConfigDto/JumpSeatConfigDto above) — GET/PUT
// `/api/private/admin/configs/booking-policy`.
//
// ⛔ OBRS-1454 CORRECTION: the backend guard on that endpoint is
// hasRole('ADMIN'), not hasRole('OWNER'). OBRS-825 narrowed it and this
// comment was never updated, so it described a permission the server had
// already stopped granting. An OWNER is REFUSED there — the backend's role
// hierarchy runs one way (ADMIN > OWNER), unlike this frontend's symmetric
// ROLE_GRANTS. Owners write their own numbers through
// `/api/private/owner/configs/booking-policy` instead (OwnerBookingPolicyDto).
//
// Also backs the PUBLIC, unauthenticated `GET /api/booking-policy` consumed by
// BookingPolicyService (business-policy page + home-booking's date-picker
// maxDate) — same two numbers, two different endpoints (this one read/write +
// admin-gated, that one read-only + public).
export interface BookingPolicyConfigDto {
  maxAdvanceDays: number;
  cutoffMinutes: number;
}

/** `GET`/`PUT /api/private/owner/configs/booking-policy` — OBRS-730's shape,
 * wired up by OBRS-1454. The same two numbers plus an `*Overridden` flag per
 * field, so the page can tell "you customised this" from "you inherit the
 * platform default" when both resolve to the same number. Suffix matches
 * OwnerCancelReschedulePolicyDto below; the PUT body is the two numbers only
 * (`BookingPolicyConfigDto`), no flags. */
export interface OwnerBookingPolicyDto extends BookingPolicyConfigDto {
  maxAdvanceDaysOverridden: boolean;
  cutoffMinutesOverridden: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private readonly baseUrl = `${environment.apiUrl}/api`;

  constructor(private readonly http: HttpClient) {}

  private createAdminContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  private toRequestOptions(
    params?: HttpParams
  ): { context: HttpContext; params?: HttpParams } {
    const context = this.createAdminContext();
    return params ? { context, params } : { context };
  }

  private getRequest<T>(
    url: string,
    params?: HttpParams
  ): Observable<ResponseAPI<T>> {
    return this.http.get<ResponseAPI<T>>(url, this.toRequestOptions(params));
  }

  private postRequest<T>(url: string, payload: unknown): Observable<ResponseAPI<T>> {
    return this.http.post<ResponseAPI<T>>(url, payload, this.toRequestOptions());
  }

  private putRequest<T>(url: string, payload: unknown): Observable<ResponseAPI<T>> {
    return this.http.put<ResponseAPI<T>>(url, payload, this.toRequestOptions());
  }

  private patchRequest<T>(url: string, payload: unknown): Observable<ResponseAPI<T>> {
    return this.http.patch<ResponseAPI<T>>(url, payload, this.toRequestOptions());
  }

  private deleteRequest<T>(url: string): Observable<ResponseAPI<T>> {
    return this.http.delete<ResponseAPI<T>>(url, this.toRequestOptions());
  }

  getLookups(): Observable<ResponseAPI<AdminLookupDto[]>> {
    return this.getRequest<AdminLookupDto[]>(`${this.baseUrl}/private/lookups`);
  }

  createLookup(payload: CreateLookupPayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/lookups`, payload);
  }

  updateLookup(
    category: string,
    slug: string,
    payload: CreateLookupPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/lookups/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`,
      payload
    );
  }

  deleteLookup(category: string, slug: string): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(
      `${this.baseUrl}/private/lookups/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`
    );
  }

  getRoles(): Observable<ResponseAPI<AdminRoleDto[]>> {
    return this.getRequest<AdminRoleDto[]>(`${this.baseUrl}/private/roles`);
  }

  getRoleById(id: number): Observable<ResponseAPI<AdminRoleDto>> {
    return this.getRequest<AdminRoleDto>(`${this.baseUrl}/private/roles/${id}`);
  }

  createRole(payload: CreateRolePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/roles`, payload);
  }

  updateRoleById(id: number, payload: CreateRolePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/roles/${id}`,
      payload
    );
  }

  deleteRoleById(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/roles/${id}`);
  }

  getUsers(
    filters?: Record<string, string | number | boolean>
  ): Observable<ResponseAPI<AdminUserDto[]>> {
    let params = new HttpParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        params = params.set(key, String(value));
      }
    }

    return this.getRequest<AdminUserDto[]>(`${this.baseUrl}/private/users`, params);
  }

  getUserById(id: number): Observable<ResponseAPI<AdminUserDto>> {
    return this.getRequest<AdminUserDto>(`${this.baseUrl}/private/users/${id}`);
  }

  // OBRS-713: `checkUserExistsByUsername` stood here — the admin-side twin of the
  // stub removed from UserService, also hard-coded to "not taken". The admin user
  // form had already dropped its username control (user-form-modal spec asserts it),
  // so this had zero callers; it was deleted with the customer-side one so a future
  // caller cannot wire itself to an answer that is never computed.
  checkUserExistsByEmail(email: string): Observable<ResponseAPI<boolean>> {
    return this.getRequest<boolean>(
      `${this.baseUrl}/users/check-duplicate/email/${encodeURIComponent(email)}`
    );
  }

  checkUserExistsByPhoneNumber(phoneNumber: string): Observable<ResponseAPI<boolean>> {
    return this.getRequest<boolean>(
      `${this.baseUrl}/users/check-duplicate/phoneNumber/${encodeURIComponent(phoneNumber)}`
    );
  }

  createUser(payload: CreateUserPayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/users`, payload);
  }

  updateUser(id: number, payload: UpdateUserPayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/users/${id}`, payload);
  }

  // OBRS-1258: always a full replace — see UpdateUserSalesPointsPayload.
  updateUserSalesPoints(
    id: number,
    payload: UpdateUserSalesPointsPayload
  ): Observable<ResponseAPI<AdminUserDto>> {
    return this.putRequest<AdminUserDto>(`${this.baseUrl}/private/users/${id}/sales-points`, payload);
  }

  deleteUser(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/users/${id}`);
  }

  unlockUser(id: number): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/users/${id}/unlock`, {});
  }

  getVehicles(): Observable<ResponseAPI<AdminVehicleDto[]>> {
    return this.getRequest<AdminVehicleDto[]>(`${this.baseUrl}/private/vehicles`);
  }

  getVehicleById(id: number): Observable<ResponseAPI<AdminVehicleDto>> {
    return this.getRequest<AdminVehicleDto>(`${this.baseUrl}/private/vehicles/${id}`);
  }

  /** OBRS-1332: the assigned-driver picker's source — the same
   * `/private/users/drivers` list the staff schedule page uses. It is
   * SALESPERSON-readable, so an OWNER reaches it through the role hierarchy, and the
   * backend has already confined it to the `driver` role and this operator's payroll
   * (OBRS-824). Declared here rather than reaching into `StaffApiService`: no admin
   * module depends on that service today and this card is not the reason to start. */
  getDrivers(): Observable<ResponseAPI<DriverDto[]>> {
    return this.getRequest<DriverDto[]>(`${this.baseUrl}/private/users/drivers`);
  }

  createVehicle(payload: CreateVehiclePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/vehicles`, payload);
  }

  updateVehicle(id: number, payload: CreateVehiclePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/vehicles/${id}`, payload);
  }

  deleteVehicle(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/vehicles/${id}`);
  }

  // OBRS-209: vehicle maintenance records (backend OBRS-102). No hard delete —
  // a record is closed via updateVehicleMaintenance() with maintenanceStatus
  // set to the "completed" Lookup slug.
  getVehicleMaintenance(vehicleId: number): Observable<ResponseAPI<AdminVehicleMaintenanceDto[]>> {
    return this.getRequest<AdminVehicleMaintenanceDto[]>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance`
    );
  }

  getVehicleMaintenanceById(
    vehicleId: number,
    id: number
  ): Observable<ResponseAPI<AdminVehicleMaintenanceDto>> {
    return this.getRequest<AdminVehicleMaintenanceDto>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance/${id}`
    );
  }

  createVehicleMaintenance(
    vehicleId: number,
    payload: CreateVehicleMaintenancePayload
  ): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance`,
      payload
    );
  }

  updateVehicleMaintenance(
    vehicleId: number,
    id: number,
    payload: CreateVehicleMaintenancePayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance/${id}`,
      payload
    );
  }

  // OBRS-1333: vehicle maintenance PLANS — distinct from getVehicleMaintenance()
  // above (a log of past/scheduled maintenance work orders). A plan is a
  // recurring reminder rule (part + interval); it has no hard delete, only
  // active/inactive via the dedicated PATCH below (mirrors OBRS-509's
  // retire/restore, never a DELETE control).
  getVehicleMaintenancePlans(
    vehicleId: number
  ): Observable<ResponseAPI<AdminVehicleMaintenancePlanDto[]>> {
    return this.getRequest<AdminVehicleMaintenancePlanDto[]>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance-plans`
    );
  }

  createVehicleMaintenancePlan(
    vehicleId: number,
    payload: CreateVehicleMaintenancePlanPayload
  ): Observable<ResponseAPI<CreateVehicleMaintenancePlanRespDto>> {
    return this.postRequest<CreateVehicleMaintenancePlanRespDto>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance-plans`,
      payload
    );
  }

  updateVehicleMaintenancePlan(
    vehicleId: number,
    planId: number,
    payload: CreateVehicleMaintenancePlanPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance-plans/${planId}`,
      payload
    );
  }

  setVehicleMaintenancePlanActive(
    vehicleId: number,
    planId: number,
    active: boolean
  ): Observable<ResponseAPI<unknown>> {
    return this.patchRequest<unknown>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance-plans/${planId}/active`,
      { active }
    );
  }

  // OBRS-312: owner/admin read-only inspection history — no create/update/delete,
  // inspections are immutable and only drivers create them (StaffApiService).
  getVehicleInspections(
    vehicleId: number
  ): Observable<ResponseAPI<VehicleInspectionListItemDto[]>> {
    return this.getRequest<VehicleInspectionListItemDto[]>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/inspections`
    );
  }

  getVehicleInspectionById(
    vehicleId: number,
    id: number
  ): Observable<ResponseAPI<VehicleInspectionDetailDto>> {
    return this.getRequest<VehicleInspectionDetailDto>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/inspections/${id}`
    );
  }

  // OBRS-509: owner-facing admin CRUD for the vehicle-inspection checklist
  // MASTER LIST — distinct from getVehicleInspections()/getVehicleInspectionById()
  // above (per-vehicle inspection HISTORY, read-only). `/manage` returns every
  // row (active + retired, SPEC §3.2); the plain `GET` (staff-api.service.ts,
  // UNTOUCHED by this card) stays the driver form's own locale-resolved feed.
  getInspectionItemsForManage(): Observable<ResponseAPI<AdminInspectionItemDto[]>> {
    return this.getRequest<AdminInspectionItemDto[]>(
      `${this.baseUrl}/private/vehicle-inspection-items/manage`
    );
  }

  createInspectionItem(
    payload: InspectionItemPayload
  ): Observable<ResponseAPI<AdminInspectionItemDto>> {
    return this.postRequest<AdminInspectionItemDto>(
      `${this.baseUrl}/private/vehicle-inspection-items`,
      payload
    );
  }

  updateInspectionItem(
    id: number,
    payload: InspectionItemPayload
  ): Observable<ResponseAPI<AdminInspectionItemDto>> {
    return this.putRequest<AdminInspectionItemDto>(
      `${this.baseUrl}/private/vehicle-inspection-items/${id}`,
      payload
    );
  }

  // OBRS-509: full-list reorder — `/reorder` is a literal path competing with
  // `PUT /{id}` in the same backend controller; Spring's PathPattern
  // comparator ranks the literal segment above the template, so this never
  // reaches updateInspectionItem's {id} handler (SPEC §3.5).
  reorderInspectionItems(
    payload: InspectionItemReorderReqDto
  ): Observable<ResponseAPI<AdminInspectionItemDto[]>> {
    return this.putRequest<AdminInspectionItemDto[]>(
      `${this.baseUrl}/private/vehicle-inspection-items/reorder`,
      payload
    );
  }

  getVehicleTypes(): Observable<ResponseAPI<AdminVehicleTypeDto[]>> {
    return this.getRequest<AdminVehicleTypeDto[]>(`${this.baseUrl}/private/vehicle-types`);
  }

  getVehicleTypeById(id: number): Observable<ResponseAPI<AdminVehicleTypeDto>> {
    return this.getRequest<AdminVehicleTypeDto>(`${this.baseUrl}/private/vehicle-types/${id}`);
  }

  // OBRS-508: OWNER-only (ADMIN inherits via the backend's ROLE_ADMIN >
  // ROLE_OWNER hierarchy) narrow update touching ONLY cargo_capacity_kg —
  // replaces the earlier full-replace PUT design; the response echoes back
  // the untouched seatMaps/translations/slug/totalSeats/status alongside the
  // newly-saved cargoCapacityKg, so the caller can patch its row from the
  // response directly with no separate re-fetch.
  updateVehicleTypeCargoCapacity(
    id: number,
    payload: UpdateVehicleTypeCargoCapacityPayload
  ): Observable<ResponseAPI<AdminVehicleTypeDto>> {
    return this.patchRequest<AdminVehicleTypeDto>(
      `${this.baseUrl}/private/vehicle-types/${id}/cargo-capacity`,
      payload
    );
  }

  getRoutes(): Observable<ResponseAPI<AdminRouteDto[]>> {
    return this.getRequest<AdminRouteDto[]>(`${this.baseUrl}/routes`);
  }

  getRouteById(id: number): Observable<ResponseAPI<AdminRouteDto>> {
    return this.getRequest<AdminRouteDto>(
      `${this.baseUrl}/private/routes/${id}`
    );
  }

  createRoute(payload: CreateRoutePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/routes`, payload);
  }

  updateRouteById(id: number, payload: CreateRoutePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/routes/${id}`,
      payload
    );
  }

  deleteRouteById(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(
      `${this.baseUrl}/private/routes/${id}`
    );
  }

  getRouteStops(routeSlug: string): Observable<ResponseAPI<AdminRouteStopDto>> {
    return this.getRequest<AdminRouteStopDto>(
      `${this.baseUrl}/private/route-stops/${routeSlug}`
    );
  }

  // ── Stops (OBRS-1022) ──────────────────────────────────────────────────────
  // The owner-facing stop management surface. `GET /api/stops` is the PUBLIC
  // reference-data list (unauthenticated, cached) — reused deliberately rather
  // than adding a private twin, since the list carries nothing an owner may see
  // and a customer may not. Everything that WRITES is under /private and
  // OWNER-gated on the server.

  getStopsForAdmin(): Observable<ResponseAPI<AdminStopSummaryDto[]>> {
    return this.getRequest<AdminStopSummaryDto[]>(`${this.baseUrl}/stops`);
  }

  getStopDetail(id: number): Observable<ResponseAPI<AdminStopDetailDto>> {
    return this.getRequest<AdminStopDetailDto>(`${this.baseUrl}/stops/${id}`);
  }

  /** Province options for the stop form. `PUT /private/stops/{id}` takes a province
   *  SLUG and 400s on an unknown one, so the form must pick from this list rather
   *  than echo back whatever the detail payload happened to carry. */
  getProvincesForAdmin(): Observable<ResponseAPI<AdminStopLookupDto[]>> {
    return this.getRequest<AdminStopLookupDto[]>(`${this.baseUrl}/provinces`);
  }

  /**
   * ⚠️ Full-replace PUT. Anything the payload omits is CLEARED on the server —
   * with one deliberate exception: `primaryPhotoUrl`, which the backend preserves
   * when the KEY is absent (OBRS-1022/OBRS-580, `StopReqDto#primaryPhotoUrlPresent`).
   * So the stop form must simply NOT send that key: the photo is owned by the two
   * multipart calls below, and a form save must never be able to undo an upload.
   */
  updateStop(id: number, payload: AdminStopUpdatePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/stops/${id}`, payload);
  }

  /**
   * Uploads the stop's photo. The body is a bare `FormData` and the request is sent
   * WITHOUT an explicit Content-Type: the browser has to set `multipart/form-data`
   * together with the boundary it generated, and naming the header by hand omits the
   * boundary and produces a request the server cannot parse. Same reason
   * `UsabilityReportService` documents it.
   */
  uploadStopPhoto(id: number, file: File): Observable<ResponseAPI<AdminStopPhotoDto>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ResponseAPI<AdminStopPhotoDto>>(
      `${this.baseUrl}/private/stops/${id}/photo`,
      formData,
      this.toRequestOptions()
    );
  }

  deleteStopPhoto(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/stops/${id}/photo`);
  }

  getSegments(routeSlug: string): Observable<ResponseAPI<AdminSegmentDto>> {
    return this.getRequest<AdminSegmentDto>(
      `${this.baseUrl}/private/segments/${routeSlug}`
    );
  }

  updateSegments(payload: AdminSegmentReqDto): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/segments`, payload);
  }

  getScheduleSets(): Observable<ResponseAPI<AdminScheduleSetDto[]>> {
    return this.getRequest<AdminScheduleSetDto[]>(`${this.baseUrl}/private/schedule-set`);
  }

  getSchedules(): Observable<ResponseAPI<AdminScheduleDto[]>> {
    return this.getRequest<AdminScheduleDto[]>(`${this.baseUrl}/private/schedules`);
  }

  getScheduleById(id: number): Observable<ResponseAPI<AdminScheduleDto>> {
    return this.getRequest<AdminScheduleDto>(`${this.baseUrl}/private/schedules/${id}`);
  }

  getScheduleSetById(id: number): Observable<ResponseAPI<AdminScheduleSetDto>> {
    return this.getRequest<AdminScheduleSetDto>(
      `${this.baseUrl}/private/schedule-set/${id}`
    );
  }

  createScheduleSet(payload: CreateScheduleSetPayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/schedule-set`, payload);
  }

  createSchedule(payload: CreateSchedulePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/schedules`, payload);
  }

  // OBRS-1471: takes UpdateSchedulePayload ONLY. This PUT is a full replace
  // (OBRS-512 `ScheduleDtoService.applyTo` writes every MERGED_ENTITY_FIELD
  // unconditionally), so a field the caller omits is not "left alone" — it is
  // nulled. Accepting the all-optional CreateSchedulePayload here is what let
  // three edit forms silently wipe seatingCapacity/cargoCapacityKg; with the
  // union gone, every required field of UpdateSchedulePayload is a compile
  // error at the call site until the caller sends the current value back.
  updateSchedule(
    id: number,
    payload: UpdateSchedulePayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/schedules/${id}`, payload);
  }

  updateScheduleSet(
    id: number,
    payload: CreateScheduleSetPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/schedule-set/${id}`,
      payload
    );
  }

  deleteScheduleSet(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/schedule-set/${id}`);
  }

  deleteSchedule(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/schedules/${id}`);
  }

  // OBRS-283: soft-cancel — used instead of deleteSchedule() when the row's
  // `deletable` field is `false` (see shared/lib/schedule-delete-mode.ts).
  cancelSchedule(id: number): Observable<ResponseAPI<CancelScheduleRespDto>> {
    return this.postRequest<CancelScheduleRespDto>(
      `${this.baseUrl}/private/schedules/${id}/cancel`,
      {}
    );
  }

  generateSchedulesFromSet(id: number): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/schedule-set/${id}/generate-schedules`,
      {}
    );
  }

  // TODO: implement server-side pagination in the admin UI; size=100 silently caps results
  //
  // OBRS-727: backend gate is @PreAuthorize("hasRole('OWNER')") — same role as the
  // override-cancel POST below, which is the point: this list is what feeds that button.
  // It was hasRole('ADMIN') until 2026-07-26, so an owner walked into /admin/bookings
  // (ROLE_GRANTS.owner includes 'admin') and got a 403 the page rendered as an empty
  // table. A 403 here now surfaces as a permission state, not as "no bookings" —
  // BookingsPageComponent.isForbidden, via AdminCollectionStore.errorStatus$.
  getBookings(): Observable<ResponseAPI<PageResponse<AdminBookingDto>>> {
    const params = new HttpParams().set('page', '0').set('size', '100');
    return this.getRequest<PageResponse<AdminBookingDto>>(
      `${this.baseUrl}/private/admin/bookings`,
      params
    );
  }

  getBookingPayments(
    bookingId: number
  ): Observable<ResponseAPI<AdminPaymentByBookingIdDto>> {
    return this.getRequest<AdminPaymentByBookingIdDto>(
      `${this.baseUrl}/private/bookings/${bookingId}/payments`
    );
  }

  // OBRS-280: read-only admin booking detail dialog. Same base path as
  // getBookingPayments above (NOT the list endpoint's `/private/admin/bookings`).
  //
  // OBRS-727: backend gate is @PreAuthorize("hasRole('OWNER')"), widened from 'ADMIN' along
  // with getBookings() above — an owner reaching the list has to be able to open its rows.
  // The dialog does NOT call /bookings/{id}/tickets: that one is still actor-only, and this
  // response already carries the journeys + tickets the dialog renders.
  getBookingById(bookingId: number): Observable<ResponseAPI<AdminBookingDetailDto>> {
    return this.getRequest<AdminBookingDetailDto>(
      `${this.baseUrl}/private/bookings/${bookingId}`
    );
  }

  // OBRS-690 / OBRS-661 AC9: OWNER override-cancel. Backend endpoint is
  // POST /api/private/admin/bookings/{id}/cancel, @PreAuthorize("hasRole('OWNER')")
  // (ADMIN inherits via the role hierarchy; SALESPERSON gets 403 — the button is
  // OWNER-gated on the FE too). The refund rate is a CLOSED enum, never a
  // caller-supplied number: the free-numeric field IS the fraud vector this card
  // exists to remove (ADR-0103). `reason` is required by the backend only when a
  // rule is actually broken (out-of-window OR rateChoice=FULL) — it returns
  // 400 `cancel.error.override-reason-required` otherwise; the modal mirrors that
  // gate client-side so the field appears only when it is genuinely needed.
  // OBRS-843: typed as `CancelBookingResult` (it was `unknown`) — the backend
  // returns the same `CancelBookingRespDto` as the counter/customer doors, and
  // the override dialog now reads `refundAmount`/`refundMethod` out of it to
  // confirm what was actually authorised.
  adminOverrideCancelBooking(
    bookingId: number,
    payload: OverrideCancelReqDto
  ): Observable<ResponseAPI<CancelBookingResult>> {
    return this.postRequest<CancelBookingResult>(
      `${this.baseUrl}/private/admin/bookings/${bookingId}/cancel`,
      payload
    );
  }

  // OBRS-286 SA contract #5. A bare, window-independent read of the same
  // resolver `resolveRefundDestination` uses at submit time — no window
  // check, no `CONFIRMED`-only check, and it never throws
  // `cancel.error.window-closed` (unlike `getCancellationPolicy`, the wrong
  // oracle for this caller — see the UI spec's Flow A3 for the two rejected
  // alternatives and why). Called by `OverrideCancelModalComponent` on open.
  getBookingRefundMethod(
    bookingId: number
  ): Observable<ResponseAPI<AdminBookingRefundMethodDto>> {
    return this.getRequest<AdminBookingRefundMethodDto>(
      `${this.baseUrl}/private/admin/bookings/${bookingId}/refund-method`
    );
  }

  getPendingManualRefunds(
    page = 0,
    size = 20
  ): Observable<ResponseAPI<PageResponse<PendingRefund>>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.getRequest<PageResponse<PendingRefund>>(
      `${this.baseUrl}/private/payments/refunds/pending`,
      params
    );
  }

  // ⚠️ OBRS-286: do NOT call this for a manual-refund-queue payment —
  // `refundPaymentById` throws `PAYMENT_REFUND_METHOD_UNSUPPORTED` for exactly
  // the methods that land in `getPendingManualRefunds()` above (SA spec "FE
  // contract correction"). `ManualRefundWorklistPageComponent` / its mark-
  // refunded modal MUST call `markPaymentManuallyRefunded()` below instead.
  refundPayment(paymentId: number): Observable<ResponseAPI<PaymentResponse>> {
    return this.postRequest<PaymentResponse>(
      `${this.baseUrl}/private/payments/${paymentId}/refund`,
      {}
    );
  }

  // OBRS-286 SA contract #4 — the new, correct endpoint for the manual-refund
  // worklist's "Mark Refunded" action. `{id}` is the PAYMENT id (per-payment
  // queue grain, K7), not the booking id. Idempotent: a 200 replay (already
  // completed) renders exactly like a first-time success — no error branch
  // may fire on it (UI spec Flow C step 4).
  markPaymentManuallyRefunded(
    paymentId: number,
    payload: MarkPaymentManualRefundReqDto
  ): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/payments/${paymentId}/manual-refund`,
      payload
    );
  }

  // OBRS-378: status is the tab filter (?status=), sort is a multi-valued
  // sort param (e.g. ['createdAt,asc','id,asc'] — see sortForStatus()).
  // HttpParams.append is used per sort entry (NOT .set), which would
  // collapse the two into one param and drop the id tiebreak.
  // OBRS-403: page/size added, mirroring getPendingManualRefunds() above —
  // always sent so the request is deterministic rather than relying on the
  // backend's @PageableDefault.
  getUsabilityReports(
    status?: UsabilityReportStatus,
    sort?: string[],
    page = 0,
    size = 20
  ): Observable<ResponseAPI<UsabilityReportPage>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    for (const s of sort ?? []) {
      params = params.append('sort', s);
    }
    return this.getRequest<UsabilityReportPage>(
      `${this.baseUrl}/private/admin/usability-reports`,
      params
    );
  }

  // OBRS-576: config change history — read-only trail over
  // system_configs_history (SA §6.1). `configKey` is an exact match against
  // the history row's own config_key column (no lookup into system_configs,
  // Hard constraint #3 — never surfaces which keys exist, only which keys
  // have EVER been changed and paged into view). `from`/`to` are Bangkok
  // calendar dates (yyyy-MM-dd), inclusive both ends, per SA §6.2.
  getConfigChangeHistory(
    configKey: string | undefined,
    from: string | undefined,
    to: string | undefined,
    page = 0,
    size = 20
  ): Observable<ResponseAPI<PageResponse<ConfigHistoryRow>>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (configKey) {
      params = params.set('configKey', configKey);
    }
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    return this.getRequest<PageResponse<ConfigHistoryRow>>(
      `${this.baseUrl}/private/admin/configs/history`,
      params
    );
  }

  getReportsSummary(from: string, to: string): Observable<ResponseAPI<ReportsSummaryDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<ReportsSummaryDto>(
      `${this.baseUrl}/private/admin/reports/summary`,
      params
    );
  }

  // OBRS-151: deep revenue analytics — totals + daily net-revenue trend +
  // period-over-period. Same [from, to] contract as getReportsSummary.
  getRevenueAnalytics(from: string, to: string): Observable<ResponseAPI<RevenueAnalyticsDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<RevenueAnalyticsDto>(
      `${this.baseUrl}/private/admin/reports/revenue-analytics`,
      params
    );
  }

  // OBRS-152: booking-volume trend — daily series + 7-day moving average +
  // day-of-week seasonality + period-over-period + peak.
  getBookingTrend(from: string, to: string): Observable<ResponseAPI<BookingTrendDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<BookingTrendDto>(
      `${this.baseUrl}/private/admin/reports/booking-trend`,
      params
    );
  }

  // OBRS-153: route performance — per-route departures + tickets + net revenue.
  getRoutePerformance(from: string, to: string): Observable<ResponseAPI<RoutePerformanceDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<RoutePerformanceDto>(
      `${this.baseUrl}/private/admin/reports/route-performance`,
      params
    );
  }

  // OBRS-154: customer behavior (aggregate-only).
  getCustomerBehavior(from: string, to: string): Observable<ResponseAPI<CustomerBehaviorDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<CustomerBehaviorDto>(
      `${this.baseUrl}/private/admin/reports/customer-behavior`,
      params
    );
  }

  // OBRS-155: operational efficiency (departures + seat fill).
  getOpsEfficiency(from: string, to: string): Observable<ResponseAPI<OpsEfficiencyDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<OpsEfficiencyDto>(
      `${this.baseUrl}/private/admin/reports/ops-efficiency`,
      params
    );
  }

  getDashboardToday(): Observable<ResponseAPI<DashboardTodayDto>> {
    return this.getRequest<DashboardTodayDto>(`${this.baseUrl}/private/admin/dashboard/today`);
  }

  // OBRS-196: per-round revenue settlement + owner cash-handover sign-off.
  // Base path is `/api/private/settlements` — NO `/admin/` segment
  // (`EndpointConstant.PRIVATE_SETTLEMENTS`, confirmed against the landed
  // backend commit 037cdb1 / docs/api/settlements.md). `SettlementController`
  // is `@PreAuthorize("hasRole('OWNER')")`; ADMIN inherits via the backend's
  // ROLE_ADMIN > ROLE_OWNER hierarchy and additionally bypasses scoping.
  getSettlementsPending(
    from: string,
    to: string
  ): Observable<ResponseAPI<SettlementPendingPageDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<SettlementPendingPageDto>(
      `${this.baseUrl}/private/settlements/pending`,
      params
    );
  }

  // End-of-day Sales Report by Salesperson (OBRS-97/OBRS-231): single-day, staff-sold-only
  // (walk_in/agent/kiosk) revenue by salesperson. See ../OBRS-backend/docs/api/reports.md.
  getEodSalesReport(date: string): Observable<ResponseAPI<EodSalesReportDto>> {
    const params = new HttpParams().set('date', date);
    return this.getRequest<EodSalesReportDto>(
      `${this.baseUrl}/private/admin/reports/eod-salesperson`,
      params
    );
  }

  // OBRS-98: refund / void summary report — mirrors getReportsSummary's [from, to]
  // HttpParams shape.
  getRefundVoidReport(from: string, to: string): Observable<ResponseAPI<RefundVoidReportDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<RefundVoidReportDto>(
      `${this.baseUrl}/private/admin/reports/refund-void`,
      params
    );
  }

  getCashOnlineReconciliationReport(
    from: string,
    to: string
  ): Observable<ResponseAPI<CashOnlineReconciliationReportDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<CashOnlineReconciliationReportDto>(
      `${this.baseUrl}/private/admin/reports/cash-online-reconciliation`,
      params
    );
  }

  getSettlementSchedule(id: number): Observable<ResponseAPI<SettlementScheduleDetailDto>> {
    return this.getRequest<SettlementScheduleDetailDto>(
      `${this.baseUrl}/private/settlements/schedules/${id}`
    );
  }

  // OBRS-671: the confirm body is now REQUIRED and carries the counted cash,
  // who handed it over, and a reason only when the count doesn't reconcile.
  // The old optional `acknowledgedTotalAmount` guard (and its
  // `409 SETTLEMENT_AMOUNT_MISMATCH`) is retired — sending the stale shape now
  // gets `400 VALIDATION_FAILED` from the backend.
  confirmSettlement(
    id: number,
    payload: SettlementConfirmPayload
  ): Observable<ResponseAPI<SettlementScheduleDetailDto>> {
    return this.postRequest<SettlementScheduleDetailDto>(
      `${this.baseUrl}/private/settlements/schedules/${id}/confirm`,
      payload
    );
  }

  // Backs the admin sidebar's usability-report nav badge — reuses the
  // existing list endpoint with size=1 so only the pagination envelope
  // (data.totalElements) is needed, not the report rows themselves.
  // OBRS-378: parameterized by status — owner's badge counts 'new' (awaiting
  // screening), admin's counts 'owner_accepted' (OBRS-527: owner-vetted,
  // awaiting platform adoption — 'accepted' itself is nobody's badge any
  // more) — see AdminLayoutComponent.badgeStatus.
  getUsabilityReportCountByStatus(status: UsabilityReportStatus): Observable<number> {
    const params = new HttpParams()
      .set('status', status)
      .set('size', '1')
      .set('page', '0');

    return this.getRequest<UsabilityReportPage>(
      `${this.baseUrl}/private/admin/usability-reports`,
      params
    ).pipe(map((response) => response.data?.totalElements ?? 0));
  }

  getUsabilityReportById(id: number): Observable<ResponseAPI<UsabilityReportDetail>> {
    return this.getRequest<UsabilityReportDetail>(
      `${this.baseUrl}/private/admin/usability-reports/${id}`
    );
  }

  updateUsabilityReportStatus(
    id: number,
    status: UsabilityReportStatus,
    triageNote: string | null
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/admin/usability-reports/${id}/status`,
      { status, triageNote }
    );
  }

  // OBRS-376: mark a report as a duplicate of `canonicalId`. Admin-only —
  // returns the updated report detail (duplicateOfId/duplicateCount included).
  // Un-marking is NOT a separate endpoint: it reuses updateUsabilityReportStatus
  // above with status 'in_review' (the backend clears the link server-side).
  markUsabilityReportAsDuplicate(
    id: number,
    canonicalId: number
  ): Observable<ResponseAPI<UsabilityReportDetail>> {
    return this.patchRequest<UsabilityReportDetail>(
      `${this.baseUrl}/private/admin/usability-reports/${id}/duplicate-of`,
      { canonicalId }
    );
  }

  // OBRS-85: the round-trip promotion is a singleton config row (slug
  // 'round_trip'), so there is no {id} in the path.
  getRoundTripPromotion(): Observable<ResponseAPI<PromotionRespDto>> {
    return this.getRequest<PromotionRespDto>(`${this.baseUrl}/private/admin/promotions/round-trip`);
  }

  updateRoundTripPromotion(
    payload: UpdateRoundTripPromotionPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.patchRequest<unknown>(
      `${this.baseUrl}/private/admin/promotions/round-trip`,
      payload
    );
  }

  // OBRS-223: reminder-timing config is a singleton row (like the round-trip
  // promotion above), ADMIN-only (403 for non-admin per the backend contract).
  getReminderConfig(): Observable<ResponseAPI<ReminderConfigDto>> {
    return this.getRequest<ReminderConfigDto>(`${this.baseUrl}/private/admin/configs/reminders`);
  }

  updateReminderConfig(
    payload: ReminderConfigDto
  ): Observable<ResponseAPI<ReminderConfigDto>> {
    return this.putRequest<ReminderConfigDto>(
      `${this.baseUrl}/private/admin/configs/reminders`,
      payload
    );
  }

  // OBRS-358: jump-seat toggle is a singleton row (mirrors reminder-config
  // above), ADMIN-only (403 for non-admin per the backend contract).
  getJumpSeatConfig(): Observable<ResponseAPI<JumpSeatConfigDto>> {
    return this.getRequest<JumpSeatConfigDto>(`${this.baseUrl}/private/admin/configs/jump-seat`);
  }

  updateJumpSeatConfig(
    payload: JumpSeatConfigDto
  ): Observable<ResponseAPI<JumpSeatConfigDto>> {
    return this.putRequest<JumpSeatConfigDto>(
      `${this.baseUrl}/private/admin/configs/jump-seat`,
      payload
    );
  }

  // OBRS-564: booking-policy config (max advance-booking days, minutes-before
  // -departure cutoff) — mirrors getJumpSeatConfig/updateJumpSeatConfig above.
  // OBRS-1454: the PLATFORM DEFAULT pair, ADMIN-only since OBRS-825. An owner
  // editing their own numbers wants the owner pair below, not these.
  getBookingPolicyConfig(): Observable<ResponseAPI<BookingPolicyConfigDto>> {
    return this.getRequest<BookingPolicyConfigDto>(
      `${this.baseUrl}/private/admin/configs/booking-policy`
    );
  }

  updateBookingPolicyConfig(
    payload: BookingPolicyConfigDto
  ): Observable<ResponseAPI<BookingPolicyConfigDto>> {
    return this.putRequest<BookingPolicyConfigDto>(
      `${this.baseUrl}/private/admin/configs/booking-policy`,
      payload
    );
  }

  // ── OBRS-1454: owner settings — booking policy ───────────────────────────
  // The owner-scoped surface OBRS-730 built and no screen ever called. Same
  // two numbers, written as THIS operator's override rather than the platform
  // default. Guarded hasRole('OWNER') and refused to an ADMIN, who has no
  // owner identity to scope an override to — so the caller must dispatch on
  // the role actually held (BookingPolicyConfigStore#usesOwnerSurface).

  getBookingPolicyOwnerConfig(): Observable<ResponseAPI<OwnerBookingPolicyDto>> {
    return this.getRequest<OwnerBookingPolicyDto>(
      `${this.baseUrl}/private/owner/configs/booking-policy`
    );
  }

  updateBookingPolicyOwnerConfig(
    payload: BookingPolicyConfigDto
  ): Observable<ResponseAPI<OwnerBookingPolicyDto>> {
    return this.putRequest<OwnerBookingPolicyDto>(
      `${this.baseUrl}/private/owner/configs/booking-policy`,
      payload
    );
  }

  // OBRS-109 (#37): full promotion CRUD across every promotion row (the
  // round-trip singleton above is a separate, narrower endpoint and is left
  // untouched). Contract not yet documented in OBRS-backend/docs/api — built
  // against the SA-locked shape and flagged in docs/handoff.md, same pattern
  // used for the round-trip endpoints in OBRS-85 before they landed.
  getPromotions(): Observable<ResponseAPI<PromotionRespDto[]>> {
    return this.getRequest<PromotionRespDto[]>(`${this.baseUrl}/private/admin/promotions`);
  }

  getPromotionById(id: number): Observable<ResponseAPI<PromotionRespDto>> {
    return this.getRequest<PromotionRespDto>(`${this.baseUrl}/private/admin/promotions/${id}`);
  }

  createPromotion(payload: PromotionReqDto): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/admin/promotions`, payload);
  }

  updatePromotion(id: number, payload: PromotionReqDto): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/admin/promotions/${id}`, payload);
  }

  deletePromotion(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/admin/promotions/${id}`);
  }

  // OBRS-685: vehicle/central expense log — owner+admin only (backend 403s
  // salesperson on every endpoint). `vehicleId === null` fetches every
  // expense (no query param); a caller passing a number scopes to that
  // vehicle via `?vehicleId=`. There is no "central-only" query param — the
  // vehicle filter's "central only" option ALSO calls this with `null` and
  // narrows client-side (see `expenses-page.mappers.ts`
  // `filterExpensesByCategoryAndRange`'s `centralOnly` predicate).
  getExpenses(vehicleId: number | null): Observable<ResponseAPI<AdminExpenseDto[]>> {
    if (vehicleId === null) {
      return this.getRequest<AdminExpenseDto[]>(`${this.baseUrl}/private/expenses`);
    }
    const params = new HttpParams().set('vehicleId', String(vehicleId));
    return this.getRequest<AdminExpenseDto[]>(`${this.baseUrl}/private/expenses`, params);
  }

  getExpenseById(id: number): Observable<ResponseAPI<AdminExpenseDto>> {
    return this.getRequest<AdminExpenseDto>(`${this.baseUrl}/private/expenses/${id}`);
  }

  createExpense(payload: CreateExpensePayload): Observable<ResponseAPI<CreateExpenseRespDto>> {
    return this.postRequest<CreateExpenseRespDto>(`${this.baseUrl}/private/expenses`, payload);
  }

  updateExpense(id: number, payload: CreateExpensePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/expenses/${id}`, payload);
  }

  deleteExpense(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/expenses/${id}`);
  }

  // ── OBRS-1356: the owner's review of what a salesperson recorded in the field ──

  getPendingExpenses(): Observable<ResponseAPI<AdminExpenseDto[]>> {
    return this.getRequest<AdminExpenseDto[]>(`${this.baseUrl}/private/expenses/pending`);
  }

  approveExpense(id: number): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/expenses/${id}/approve`, {});
  }

  /** The reason is required by the backend — a bounced row must say why. */
  rejectExpense(id: number, rejectionReason: string): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/expenses/${id}/reject`, {
      rejectionReason,
    });
  }

  /** OBRS-809: the operator roster, for the admin-only operator picker.
   * ADMIN-only on the backend — see `AdminOwnerDto` for why an `owner` caller
   * is 403'd rather than served a filtered list. */
  getOwners(): Observable<ResponseAPI<AdminOwnerDto[]>> {
    return this.getRequest<AdminOwnerDto[]>(`${this.baseUrl}/private/owners`);
  }

  /**
   * OBRS-844 — the cash refunds waiting on this owner's authorization. Scoped
   * server-side to the caller's own fleet; an ADMIN, who owns no fleet, gets an
   * empty list rather than every operator's counter traffic.
   */
  getPendingCashRefundApprovals(): Observable<ResponseAPI<CashRefundApprovalRequest[]>> {
    return this.getRequest<CashRefundApprovalRequest[]>(
      `${this.baseUrl}/private/cash-refund-approvals/pending`
    );
  }

  /**
   * OBRS-844 — issues the six digits for one request. The response is the ONLY
   * place the plaintext ever exists outside the server's hash of it; there is
   * deliberately no GET that can read it back, because an endpoint that could
   * would let the counter obtain a code without the owner ever acting.
   */
  approveCashRefund(requestId: number): Observable<ResponseAPI<CashRefundApprovalCode>> {
    return this.postRequest<CashRefundApprovalCode>(
      `${this.baseUrl}/private/cash-refund-approvals/${requestId}/approve`,
      {}
    );
  }

  // ── OBRS-1388: parcel damage-claim approvals (/admin/parcel-claims) ──────
  // OWNER-only surface. See ../OBRS-backend/docs/spec/parcel-damage-claim-obrs-1388.md §4.
  // Deliberately no NgRx store — same reasoning as the cash-refund queue
  // directly above: a cached queue could show the owner a claim another
  // device already decided.

  /** GET /api/private/parcel-claims?status=PENDING — oldest first, `[]` when
   * none. SALESPERSON floor (OWNER/ADMIN inherit). */
  getPendingParcelClaims(): Observable<ResponseAPI<ParcelClaimRespDto[]>> {
    const params = new HttpParams().set('status', 'PENDING');
    return this.getRequest<ParcelClaimRespDto[]>(`${this.baseUrl}/private/parcel-claims`, params);
  }

  /** GET /api/private/parcels/{parcelId}/claim-history — the same
   * cross-counter history the filing counter saw (AC-2), read again here
   * because the OWNER is the one deciding. Same endpoint as
   * `StaffApiService.getParcelClaimHistory`, called from this service so the
   * owner's approve modal doesn't take a runtime dependency on the staff
   * module. */
  getParcelClaimHistory(parcelId: number): Observable<ResponseAPI<ParcelClaimRespDto[]>> {
    return this.getRequest<ParcelClaimRespDto[]>(
      `${this.baseUrl}/private/parcels/${parcelId}/claim-history`
    );
  }

  /** POST /api/private/parcel-claims/{id}/approve — moves money
   * (`DriverCashService#recordParcelClaimPayout`, §5). OWNER-only. Errors:
   * 404 PARCEL_CLAIM_NOT_FOUND, 409 PARCEL_CLAIM_ALREADY_DECIDED, 400 amount
   * out of range, 409 DRIVER_CASH_DAY_ALREADY_RETURNED (the FILER's box). */
  approveParcelClaim(
    claimId: number,
    payload: ParcelClaimApproveReqDto
  ): Observable<ResponseAPI<ParcelClaimRespDto>> {
    return this.postRequest<ParcelClaimRespDto>(
      `${this.baseUrl}/private/parcel-claims/${claimId}/approve`,
      payload
    );
  }

  // ── OBRS-960: driver cash — daily-return close (/admin/settlements) ──────
  // ⚠️ CORRECTED (2026-08-02, backend reconciliation) — the base is
  // `/api/private/driver-cash`, NOT `/api/private/owner/driver-cash`; the
  // day endpoints are OWNER-gated by role, not by URL prefix. The list
  // endpoint itself was a genuine contract gap the SA never specified — the
  // backend added it now: `status` is optional (`OPEN`|`RETURNED`, omitted
  // = both), `from`/`to` are the required business-date range. Verified
  // against `DriverCashController.java:55,65,74,81`.

  getDriverCashDays(
    from: string,
    to: string,
    status?: DriverCashDayStatus
  ): Observable<ResponseAPI<DriverCashDaySummaryRespDto[]>> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (status) {
      params = params.set('status', status);
    }
    return this.getRequest<DriverCashDaySummaryRespDto[]>(
      `${this.baseUrl}/private/driver-cash/days`,
      params
    );
  }

  getDriverCashDayDetail(dayId: number): Observable<ResponseAPI<DriverCashDayRespDto>> {
    return this.getRequest<DriverCashDayRespDto>(
      `${this.baseUrl}/private/driver-cash/days/${dayId}`
    );
  }

  /**
   * OBRS-1147 AC-2 — every person's ค่าหัว under this owner for the range, with
   * an optional `holderId` to narrow to one. Owner scope comes from the token,
   * never from a parameter (same as `getDriverCashDays()` above); a `holderId`
   * outside this owner's staff answers an EMPTY report, not a distinguishable
   * error, so it cannot be walked as an existence oracle.
   */
  getDriverCashEarnings(
    from: string,
    to: string,
    granularity: PerHeadEarningsGranularity,
    holderId?: number
  ): Observable<ResponseAPI<PerHeadEarningsRespDto>> {
    let params = new HttpParams().set('from', from).set('to', to).set('granularity', granularity);
    if (holderId != null) {
      params = params.set('holderId', String(holderId));
    }
    return this.getRequest<PerHeadEarningsRespDto>(
      `${this.baseUrl}/private/driver-cash/earnings`,
      params
    );
  }

  returnDriverCashDay(
    dayId: number,
    payload: DriverCashDayReturnReqDto
  ): Observable<ResponseAPI<DriverCashDayRespDto>> {
    return this.postRequest<DriverCashDayRespDto>(
      `${this.baseUrl}/private/driver-cash/days/${dayId}/return`,
      payload
    );
  }

  // ── OBRS-960: owner settings — driver-cash per-head rates ────────────────

  getDriverCashRates(): Observable<ResponseAPI<DriverCashRateRowDto[]>> {
    return this.getRequest<DriverCashRateRowDto[]>(
      `${this.baseUrl}/private/owner/driver-cash/per-head-rates`
    );
  }

  createDriverCashRate(
    payload: DriverCashRateReqDto
  ): Observable<ResponseAPI<DriverCashRateRowDto>> {
    return this.postRequest<DriverCashRateRowDto>(
      `${this.baseUrl}/private/owner/driver-cash/per-head-rates`,
      payload
    );
  }

  /** OBRS-1356 — the wage per LEG, the figure that prices a DRIVER_WAGE field expense. */
  getDriverWageRates(): Observable<ResponseAPI<DriverWageRateRowDto[]>> {
    return this.getRequest<DriverWageRateRowDto[]>(
      `${this.baseUrl}/private/owner/driver-cash/wage-rates`
    );
  }

  createDriverWageRate(
    payload: DriverWageRateReqDto
  ): Observable<ResponseAPI<DriverWageRateRowDto>> {
    return this.postRequest<DriverWageRateRowDto>(
      `${this.baseUrl}/private/owner/driver-cash/wage-rates`,
      payload
    );
  }

  /**
   * OBRS-1073 — the counters a rate can hang off. This page used to populate
   * its picker from the PUBLIC all-stops endpoint (`StationService.getAll()`),
   * which was the only flat stop list in the codebase. Now that a rate belongs
   * to a counter, that list is both wrong (91 of 101 stops are not counters)
   * and far too long; this returns exactly the three that are.
   */
  getDriverCashSalesPoints(): Observable<ResponseAPI<SalesPointOptionDto[]>> {
    return this.getRequest<SalesPointOptionDto[]>(
      `${this.baseUrl}/private/owner/driver-cash/sales-points`
    );
  }

  // ── OBRS-960: owner settings — parcel revenue-share config ───────────────

  getParcelShareOwnerConfig(): Observable<ResponseAPI<ParcelShareOwnerConfigDto>> {
    return this.getRequest<ParcelShareOwnerConfigDto>(
      `${this.baseUrl}/private/owner/configs/parcel-share`
    );
  }

  updateParcelShareOwnerConfig(
    payload: ParcelShareOwnerConfigReqDto
  ): Observable<ResponseAPI<ParcelShareOwnerConfigDto>> {
    return this.putRequest<ParcelShareOwnerConfigDto>(
      `${this.baseUrl}/private/owner/configs/parcel-share`,
      payload
    );
  }

  repairParcelShare(
    payload: ParcelShareRepairReqDto
  ): Observable<ResponseAPI<ParcelShareRepairRespDto>> {
    return this.postRequest<ParcelShareRepairRespDto>(
      `${this.baseUrl}/private/owner/parcel-share/repair`,
      payload
    );
  }

  // ── OBRS-699: owner settings — cancel/reschedule policy ──────────────────

  getCancelReschedulePolicyOwnerConfig(): Observable<
    ResponseAPI<OwnerCancelReschedulePolicyDto>
  > {
    return this.getRequest<OwnerCancelReschedulePolicyDto>(
      `${this.baseUrl}/private/owner/configs/cancel-reschedule-policy`
    );
  }

  updateCancelReschedulePolicyOwnerConfig(
    payload: CancelReschedulePolicyReqDto
  ): Observable<ResponseAPI<OwnerCancelReschedulePolicyDto>> {
    return this.putRequest<OwnerCancelReschedulePolicyDto>(
      `${this.baseUrl}/private/owner/configs/cancel-reschedule-policy`,
      payload
    );
  }

  /** DELETE drops all seven override rows as a unit and returns the re-read
   * (now platform-default) policy — there is no per-key delete (BR-7). */
  resetCancelReschedulePolicyOwnerConfig(): Observable<
    ResponseAPI<OwnerCancelReschedulePolicyDto>
  > {
    return this.deleteRequest<OwnerCancelReschedulePolicyDto>(
      `${this.baseUrl}/private/owner/configs/cancel-reschedule-policy`
    );
  }

  // ── OBRS-960: parcel-share monthly totals (/admin/reports) ───────────────

  getParcelShareMonthly(
    year: number,
    month: number,
    role: 'SALESPERSON'
  ): Observable<ResponseAPI<ParcelShareMonthlyRowDto[]>> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month))
      .set('role', role);
    return this.getRequest<ParcelShareMonthlyRowDto[]>(
      `${this.baseUrl}/private/owner/parcel-share/monthly`,
      params
    );
  }

  // ── OBRS-1053: parcel-share clawbacks (/admin/reports) ───────────────────

  /** `status` is OPTIONAL on the wire — omitting it returns COLLECTED rows
   * alongside OUTSTANDING ones (backend `ParcelShareController.clawbacks`
   * documents exactly that). */
  getParcelShareClawbacks(
    status?: ParcelShareClawbackStatus
  ): Observable<ResponseAPI<ParcelShareClawbackRowDto[]>> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.getRequest<ParcelShareClawbackRowDto[]>(
      `${this.baseUrl}/private/owner/parcel-share/clawbacks`,
      params
    );
  }

  /** The backend declares the body `@RequestBody(required = false)`, but an
   * empty object is always valid — one code path here instead of two. */
  collectParcelShareClawback(
    clawbackId: number,
    note?: string
  ): Observable<ResponseAPI<ParcelShareClawbackRowDto>> {
    const payload: ParcelShareClawbackCollectReqDto = note ? { note } : {};
    return this.postRequest<ParcelShareClawbackRowDto>(
      `${this.baseUrl}/private/owner/parcel-share/clawbacks/${clawbackId}/collect`,
      payload
    );
  }

  // ── OBRS-1308: notification message overrides ────────────────────────────
  // Owner-facing (`NotificationMessageOverrideController`, hasRole('OWNER')) and
  // admin-facing review (`NotificationMessageOverrideReviewController`, the
  // literal hasRole('ADMIN')) split across two controllers on the backend, both
  // under `/private/admin/notification-messages` — see the system spec's API
  // contracts section. The frontend never gates on this split; the review
  // methods are only ever called from a component that has already passed the
  // component-level `authService.getRoles().includes('admin')` check (AC5).

  getNotificationMessages(): Observable<ResponseAPI<OverridableMessageKeyDto[]>> {
    return this.getRequest<OverridableMessageKeyDto[]>(
      `${this.baseUrl}/private/admin/notification-messages`
    );
  }

  getNotificationMessageByCode(
    messageCode: string
  ): Observable<ResponseAPI<OverridableMessageKeyDto>> {
    return this.getRequest<OverridableMessageKeyDto>(
      `${this.baseUrl}/private/admin/notification-messages/${encodeURIComponent(messageCode)}`
    );
  }

  /**
   * AC12 — side-effect-free preview of the SMS credit cost of a DRAFT body
   * (not yet saved). Added to the contract 2026-08-13 after UX found the
   * locked GET endpoints only describe already-stored text (live vs baseline,
   * or old vs submitted-new) — see the UI spec's "Contract gap" callout.
   */
  previewNotificationMessageCredit(
    messageCode: string,
    locale: NotificationMessageLocale,
    body: string
  ): Observable<ResponseAPI<SmsCreditEstimateDto>> {
    const payload: CreditPreviewReqDto = { body };
    return this.postRequest<SmsCreditEstimateDto>(
      `${this.baseUrl}/private/admin/notification-messages/${encodeURIComponent(messageCode)}/${locale}/credit-preview`,
      payload
    );
  }

  submitNotificationMessage(
    payload: SubmitNotificationMessagePayload
  ): Observable<ResponseAPI<SubmitNotificationMessageRespDto>> {
    return this.postRequest<SubmitNotificationMessageRespDto>(
      `${this.baseUrl}/private/admin/notification-messages`,
      payload
    );
  }

  /** Only ever called from a component that already passed the exact-role
   * `getRoles().includes('admin')` check — see `NotificationMessageReviewQueuePageComponent`. */
  getNotificationMessageReviewsPending(): Observable<ResponseAPI<PendingReviewRowDto[]>> {
    return this.getRequest<PendingReviewRowDto[]>(
      `${this.baseUrl}/private/admin/notification-messages/reviews/pending`
    );
  }

  /** Only ever called from a component that already passed the exact-role
   * `getRoles().includes('admin')` check — see `NotificationMessageReviewDetailPageComponent`. */
  getNotificationMessageReviewById(
    id: number
  ): Observable<ResponseAPI<NotificationMessageReviewDetailDto>> {
    return this.getRequest<NotificationMessageReviewDetailDto>(
      `${this.baseUrl}/private/admin/notification-messages/reviews/${id}`
    );
  }

  approveNotificationMessageReview(id: number): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/admin/notification-messages/reviews/${id}/approve`,
      {}
    );
  }

  rejectNotificationMessageReview(
    id: number,
    reason: string
  ): Observable<ResponseAPI<unknown>> {
    const payload: RejectNotificationMessageReviewPayload = { reason };
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/admin/notification-messages/reviews/${id}/reject`,
      payload
    );
  }
}

/** `GET`/`PUT /api/private/owner/configs/parcel-share` — OBRS-960. Distinct
 * from the staff-facing `ParcelShareConfigDto` (`parcel.interface.ts`): this
 * shape splits `configured` per field (`driverPctConfigured`/
 * `salespersonPctConfigured`) because the owner's edit FORM needs to know
 * which side is still at its 0% default, not just "is either one set". */
export interface ParcelShareOwnerConfigDto {
  driverPct: number;
  driverPctConfigured: boolean;
  salespersonPct: number;
  salespersonPctConfigured: boolean;
}

export type ParcelShareOwnerConfigReqDto = Pick<
  ParcelShareOwnerConfigDto,
  'driverPct' | 'salespersonPct'
>;

/** `source` is a FIXED literal audit note, not user-selectable (card §4/5/7:
 * "not a dispatch key; do not build a picker"). */
export interface ParcelShareRepairReqDto {
  source: 'OWNER_SETTINGS_PARCEL_SHARE';
}

export interface ParcelShareRepairRespDto {
  parcelsRepaired: number;
  entriesRepaired: number;
  driverPctApplied: number;
  salespersonPctApplied: number;
}

/** `GET`/`PUT`/`DELETE /api/private/owner/configs/cancel-reschedule-policy` —
 * OBRS-699.
 *
 * NOTE the suffix: `*Overridden`, matching the backend's
 * `OwnerCancelReschedulePolicyRespDto` (OBRS-730's shape, owner-locked
 * 2026-08-17), NOT the `*Configured` this frontend uses for parcel-share
 * (`ParcelShareOwnerConfigDto` above). Do not rename them on the way in;
 * unifying the two suffixes is a separate card. */
export interface OwnerCancelReschedulePolicyDto {
  cancelWindowHours: number;
  cancelWindowHoursOverridden: boolean;
  rescheduleWindowHours: number;
  rescheduleWindowHoursOverridden: boolean;
  rescheduleMaxDaysAhead: number;
  rescheduleMaxDaysAheadOverridden: boolean;
  /** OBRS-1447: how many times one booking may be rescheduled; `0` means UNLIMITED,
   * which is why the field's helper text has to say so. */
  rescheduleMaxCount: number;
  rescheduleMaxCountOverridden: boolean;
  earlyWindowHours: number;
  earlyWindowHoursOverridden: boolean;
  /** 0.0–1.0 rate, NOT a percentage. The form shows whole percent and the
   * page component converts at its two boundaries. */
  cancelRefundRateEarly: number;
  cancelRefundRateEarlyOverridden: boolean;
  cancelRefundRateLate: number;
  cancelRefundRateLateOverridden: boolean;
  rescheduleFeeLateThb: number;
  rescheduleFeeLateThbOverridden: boolean;
}

/** The PUT body: the eight values only, no flags and no key parameter — the
 * endpoint writes all eight or none (BR-7). */
export type CancelReschedulePolicyReqDto = Omit<
  OwnerCancelReschedulePolicyDto,
  `${string}Overridden`
>;

/** One row of `GET /api/private/owner/parcel-share/monthly` — OBRS-960. */
export interface ParcelShareMonthlyRowDto {
  payeeUserId: number;
  payeeName: string;
  total: string;
}

/** `parcel_share_clawbacks.status` — OBRS-992's `EParcelShareClawbackStatus`.
 * There is deliberately no `WAIVED`: the locked policy is "คืนทั้งคนขับและ
 * นายท่า", so forgiving a share is not a state this UI may offer. */
export type ParcelShareClawbackStatus = 'OUTSTANDING' | 'COLLECTED';

/** `parcel_share_clawbacks.collected_via` — OBRS-992's
 * `EParcelShareClawbackChannel`. `DRIVER_DAILY_RETURN` happens automatically
 * inside the driver's daily sign-off; `MANUAL` is the salesperson's ONLY
 * recovery channel (they have no daily cash lifecycle) and the driver's
 * fallback. Null until the row is collected. */
export type ParcelShareClawbackChannel = 'DRIVER_DAILY_RETURN' | 'MANUAL';

/** One row of `GET /api/private/owner/parcel-share/clawbacks` — OBRS-992,
 * field-for-field against the backend's `ParcelShareClawbackRespDto`. Money
 * is a decimal STRING (`amount`), as everywhere else in parcel-share/
 * driver-cash; `payeeName` is null when the payee has no profile row. */
export interface ParcelShareClawbackRowDto {
  clawbackId: number;
  parcelId: number;
  scheduleId: number | null;
  payeeRole: 'DRIVER' | 'SALESPERSON';
  payeeUserId: number | null;
  payeeName: string | null;
  /** `LocalDate` on the wire — `yyyy-MM-dd`. */
  businessDate: string;
  amount: string;
  status: ParcelShareClawbackStatus;
  reason: string | null;
  /** `OffsetDateTime` on the wire; null while OUTSTANDING. */
  collectedAt: string | null;
  collectedVia: ParcelShareClawbackChannel | null;
  note: string | null;
}

export interface ParcelShareClawbackCollectReqDto {
  note?: string;
}
