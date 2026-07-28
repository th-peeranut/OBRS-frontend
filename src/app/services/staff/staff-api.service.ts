import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { PageResponse } from '../../shared/interfaces/payment.interface';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import {
  BoardingScanRequest,
  BoardingScanResultDto,
} from '../../shared/interfaces/ticket-boarding.interface';
import {
  BookingStopLookup,
  CancelBookingReqDto,
  CancelBookingResult,
  CancellationPolicy,
} from '../../shared/interfaces/my-booking.interface';
import {
  CargoAvailabilityRespDto,
  ParcelCarryOnReqDto,
  ParcelCarryOnRespDto,
  ParcelCollectReqDto,
  ParcelCollectRespDto,
  ParcelConsignedReqDto,
  ParcelConsignedRespDto,
  ParcelDeliveryListItemDto,
  ParcelLoadRespDto,
  ParcelArrivedRespDto,
  ParcelQuoteReqParams,
  ParcelQuoteRespDto,
  ParcelVerifyReqDto,
  ParcelVerifyRespDto,
  WaybillRespDto,
} from '../../shared/interfaces/parcel.interface';
import { AdminUserDto, DriverDto } from '../admin/admin-api.service';
// OBRS-100: type-only — BoardingListComponent (shared/) reuses the response
// SHAPE for its supplementary print/export trip header, but must not take a
// runtime dependency on AdminApiService (see docs/adr/0015). Same type-only
// precedent as DriverDto above, just made explicit with `import type`.
import type { AdminScheduleDto } from '../admin/admin-api.service';

export interface ScheduleSearchReqDto {
  bookingType: 'one_way' | 'return';
  departureDate: string;
  returnDate?: string;
  fromStop: string;
  toStop: string;
  numberOfPassengers: number;
}

export interface ScheduleSearchItemDto {
  id: number;
  vehicleType: string;
  departureDateTime: string;
  arrivalDateTime: string;
  pricePerSeat: string;
  availableSeats: number;
  availableSeatNumbers: string[];
}

export interface ScheduleSearchResultDto {
  departureSchedules: ScheduleSearchItemDto[];
  arrivalSchedules: ScheduleSearchItemDto[];
}

export interface WalkInBookingPassengerReqDto {
  passengerType: string;
  seatNumber: string;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  identityCardNumber?: string;
  phoneNumber: string;
}

export interface WalkInBookingScheduleReqDto {
  scheduleId: number;
  fromStop?: string;
  toStop?: string;
  departureDateTime: string;
  arrivalDateTime: string;
  passengers: WalkInBookingPassengerReqDto[];
}

export interface WalkInContactReqDto {
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phoneNumber: string;
  identityCardNumber?: string;
  email?: string;
  preferredLocale: string;
}

export interface WalkInTripDto {
  scheduleId: number;
  vehicleType: 'bus' | 'van';
  licensePlate: string | null;
  driverName: string | null;
  departureDateTime: string;
  arrivalDateTime: string;
  pricePerSeat: string;
  capacity: number;
  availableCount: number;
  reservedUnpaidCount: number;
  soldPaidCount: number;
  availableSeatNumbers: string[];
  // OBRS-283: mirrors AdminScheduleDto's same-named fields (admin-api.service.ts)
  // — drives the delete-vs-cancel branch on the walk-in sell page's trip menu.
  // Optional/undefined on a cached row predating this field.
  deletable?: boolean;
  confirmedBookingCount?: number;
  // OBRS-324 (Epic OBRS-318 open seating, 318-d): 'OPEN' | 'ASSIGNED' —
  // `schedules.seating_mode` (OBRS-321). Verified passthrough — same pattern
  // as `Schedule.seatingMode` in `shared/interfaces/schedule.interface.ts`
  // (OBRS-323): no manual mapper needed, the backend response includes it.
  // OBRS-360 shipped it on `GET /api/private/schedules/walk-in`
  // (`WalkInTripRespDto.seatingMode`), per-schedule; `ScheduleWalkInBrowseIT`
  // pins that it reaches the DTO. Optional only for a cached row predating
  // OBRS-360 — a live response always carries it, so the OPEN flow below is
  // reached in production, not dormant.
  seatingMode?: 'OPEN' | 'ASSIGNED';
  // OBRS-358: `base - walk_in_only seat count` — the online-visible seat
  // count for this trip (e.g. minibus base=21, normalCapacity=20; seat 1 is
  // the jump seat, walk-in-only, sold last). OPTIONAL: absent on a backend
  // predating this card (or a cached row) means "no jump seat on this
  // trip/vehicle" — every overflow/ack computation derived from it MUST
  // gracefully no-op (0 overflow units, no acknowledgment prompt) rather than
  // throw or misbehave. A staff-facing, NON-authoritative hint only — the
  // server re-validates capacity under a row lock at sale time regardless of
  // what the client computed here.
  normalCapacity?: number;
}

export interface WalkInRouteGroupDto {
  routeSlug: string;
  routeLabel: string;
  trips: WalkInTripDto[];
}

/**
 * OBRS-324: whether a walk-in trip sells on OPEN seating (headcount only, no
 * seat map). The backend ships `seatingMode` on this endpoint since OBRS-360,
 * so this returns `true` for real OPEN trips. Missing/unknown `seatingMode`
 * (a cached row predating OBRS-360) resolves to `false` (ASSIGNED), falling
 * back to the seat-picker flow — the conservative default, since it asks the
 * operator for more information rather than assuming headcount-only.
 */
export function isOpenSeatingTrip(
  trip: Pick<WalkInTripDto, 'seatingMode'> | null | undefined
): boolean {
  return trip?.seatingMode === 'OPEN';
}

export interface SegmentStopRefDto {
  slug: string;
  name: string;
}

export interface SegmentStopPairDto {
  segmentId: number;
  fromStop: SegmentStopRefDto;
  toStop: SegmentStopRefDto;
  vehicleType: SegmentStopRefDto;
  fare: string;
  estimatedDurationMinutes: number;
}

export interface PopularStopDto { slug: string; name: string; count: number; }

export interface RouteSegmentsDto {
  route: SegmentStopRefDto;
  stopPairs: SegmentStopPairDto[];
  popularPickupStops: PopularStopDto[];
  popularDropoffStops: PopularStopDto[];
}

/** One canonical route stop with its order and cumulative time offset from the origin. */
export interface RouteStopTimeDto {
  stopOrder: number;
  offsetMinutesFromOrigin: number;
  distanceKmFromOrigin?: number;
  /** LookupResponse — `code` is the stop slug used to join with segment stops.
   * OBRS-305 (QA-flagged blocker, 2026-07-14): `id` added (optional,
   * additive) — the parcel consign form needs the numeric stop id for
   * `pickupStopId`/`dropoffStopId` on the consigned intake request.
   * CORRECTION: an earlier version of this comment claimed the underlying
   * `/private/route-stops/{slug}` response "already carries it" — verified
   * false at the time (backend `LookupResponse` had no `id` field, so every
   * stop was silently dropped by `buildOrderedStops()` and the consign
   * form's pickup/dropoff dropdowns rendered permanently empty). The backend
   * is adding `id` to `LookupResponse` (`StopDtoService.toLookupResponse` ->
   * `entity.getId()`) specifically for this need — verified directly against
   * `OBRS-backend-wt-obrs-305-parcel-consigned-delivery`'s
   * `LookupResponse`/`StopOrderRespDto`/`StopDtoService` source: the field
   * lands at exactly this path (`stops[].stop.id`), matching what
   * `buildOrderedStops()` already reads. No frontend mapping change needed
   * once that backend change ships — `id?: number` stays optional so a stop
   * missing it (a stale/un-upgraded backend) degrades to being skipped
   * (documented behavior below), never a broken/undefined dropdown entry. */
  stop: { code: string; id?: number };
}

export interface RouteStopsDto {
  stops: RouteStopTimeDto[];
}

export interface WalkInBookingReqDto {
  bookingType: 'one_way' | 'return';
  totalAmount: number;
  bookingChannel: 'walk_in';
  // OBRS-358: sent ONLY when the sale overflows the trip's `normalCapacity`
  // (i.e. this sale reaches into the jump seat) and the staff user has
  // confirmed the AlertService acknowledgment prompt — omitted entirely
  // otherwise, same conditional-field convention as `identityCardNumber`/
  // `email` on `WalkInContactReqDto` below. The server re-validates under a
  // row lock regardless; this flag is the audit-trail record of staff
  // consent, not the authorization boundary.
  jumpSeatAcknowledged?: boolean;
  departureSchedule: WalkInBookingScheduleReqDto;
  arrivalSchedule?: WalkInBookingScheduleReqDto;
  contact: WalkInContactReqDto;
}

export interface WalkInBookingRespDto {
  bookingId: number;
  bookingNumber: string;
  // OBRS-85: parity with CreateBookingResponse (booking.interface.ts). Dormant
  // today — every walk-in sale is bookingType:'one_way', so the backend never
  // populates a discount here; kept for forward-compat with a future walk-in
  // round-trip flow.
  totalAmount?: number;
  discountAmountSnapshot?: number;
  netAmount?: number;
}

export interface WalkInPaymentReqDto {
  bookingId: number;
  paymentMethod: 'cash';
  amount?: number;
}

export interface WalkInPaymentRespDto {
  id: number;
  bookingId: number;
  status: string;
  paymentMethod: string;
  amount: number;
  // OBRS-85: same parity/dormant fields as WalkInBookingRespDto.
  totalAmount?: number;
  discountAmountSnapshot?: number;
  netAmount?: number;
}

/** OBRS-272: `PATCH /api/private/schedules/{id}/delay` request body.
 * `delayedDepartureDateTime` is required (an OffsetDateTime string, strictly
 * after the schedule's current `departureDateTime` — validated client-side in
 * `BoardingListComponent` and re-validated by the backend as
 * `SCHEDULE_DELAY_ETA_INVALID`). `delayReason` is optional, max 500 chars. */
export interface DelayScheduleReqDto {
  delayedDepartureDateTime: string;
  delayReason?: string;
}

/** OBRS-272: `PATCH /api/private/schedules/{id}/delay` response data.
 * `status` is always `"scheduled"` — the delay never changes the schedule's
 * status code. `affectedBookingCount` drives the success toast's `{{count}}`. */
export interface DelayScheduleRespDto {
  scheduleId: number;
  status: string;
  delayedDepartureDateTime: string;
  delayReason?: string | null;
  affectedBookingCount: number;
}

export interface BoardingListItemDto {
  ticketId: number;
  ticketNumber: string;
  seatNumber: string;
  passengerName: string;
  fromStop: string;
  toStop: string;
  status: {
    code: string;
    label: string;
  };
  /** OBRS-96: populated once the ticket has been boarded via the manual
   * boarding-scan box (undefined until then — additive, optional field).
   * Status-neutral (docs/adr/0030-boarding-state-model.md, backend): a
   * `confirmed` ticket can be boarded without its `status` changing. */
  boardedAt?: string;
  /** OBRS-130: the staff user id who boarded this ticket (via scan or the
   * manual Board button) — undefined until boarded. */
  boardedBy?: number;
  /** OBRS-130: display name for `boardedBy`, resolved server-side so it
   * survives a refresh. Only the optimistic row for an action *this* operator
   * just performed may be seeded client-side (see `boarding-list.component.ts`
   * — never seed it onto a pre-existing boarded row, that was the
   * misattribution bug). */
  boardedByName?: string;
  /** OBRS-296: the fare category the booking was created with —
   * server-authoritative, drives the boarding manifest's "Flag mismatch"
   * surface (only rendered for `'child'` rows). `undefined` on an older
   * ticket/fixture predating this field. */
  fareCategory?: 'adult' | 'child';
  /** OBRS-296: populated once a salesperson/driver has flagged this ticket's
   * fare category as a mismatch (undefined until then — additive, optional
   * field, same shape as `boardedAt`). */
  childFareFlaggedAt?: string;
  /** OBRS-296: the staff user id who flagged the mismatch — undefined until
   * flagged. */
  childFareFlaggedBy?: number;
  /** OBRS-296: display name for `childFareFlaggedBy`, resolved server-side so
   * it survives a refresh — same "only seed your own name on the row you
   * just acted on" rule as `boardedByName` (see
   * `boarding-list.component.ts`). */
  childFareFlaggedByName?: string;
}

// ---------------------------------------------------------------------------
// OBRS-312 — digital weekly vehicle inspection checklist (driver-facing calls).
// ---------------------------------------------------------------------------

/** GET /api/private/vehicle-inspection-items — the 23-item master checklist,
 * `label` already resolved to the request locale by the backend and ordered
 * by `(categoryOrder, displayOrder)` (OBRS-530 SPEC D2) — NOT `displayOrder`
 * alone anymore. These labels are data, NOT i18n keys — never hardcode or
 * mirror them into the locale bundles.
 *
 * OBRS-530: `category` is the stable enum CODE (e.g. `'TIRES'`), resolved to a
 * display name client-side via `ADMIN.INSPECTION_ITEMS.CATEGORY.<category>`
 * (`categoryLabelKey()`, shared/lib/vehicle-inspection-category.ts) — never a
 * second translation table (D1). `categoryOrder` is the backend enum's
 * declaration-order position (1-based); it is THE only correct sort key for
 * group order — never re-derive it from a client-side list. */
export interface VehicleInspectionItemDto {
  id: number;
  code: string;
  label: string;
  displayOrder: number;
  active: boolean;
  category: string;
  categoryOrder: number;
}

/** GET /api/private/vehicles/inspectable — the whole active fleet (any
 * driver may cover any van); deliberately NOT derived from
 * `DriverSchedulesStore`/assigned schedules, which an ad-hoc cover driver
 * has none of for the van they're inspecting. */
export interface InspectableVehicleDto {
  id: number;
  label: string;
}

export type InspectionVerdict = 'ok' | 'needs_repair';

export interface InspectionItemSubmission {
  itemId: number;
  verdict: InspectionVerdict;
  /** Always a string, never null/undefined on the wire — '' for an untouched/OK row. */
  note: string;
}

export interface SubmitVehicleInspectionPayload {
  odometerKm: number;
  notes?: string;
  items: InspectionItemSubmission[];
}

export interface SubmitVehicleInspectionRespDto {
  inspectionId: number;
  defectCount: number;
}

/** GET /api/private/inspections/me — the current driver's own inspections,
 * newest first. Only `inspectedAt` is read today (the "already inspected
 * this week" hint); the rest mirror the vehicle-scoped list item shape since
 * both surface the same underlying record. */
export interface MyInspectionDto {
  id: number;
  inspectedAt: string;
  inspectedByName?: string;
  odometerKm?: number;
  defectCount?: number;
  pendingMaintenance?: boolean;
}

// ---------------------------------------------------------------------------
// OBRS-424 — internal fleet live map (layer 1). Backend contract shipped by
// OBRS-423 (`GET /api/private/vehicles/positions`, already merged to
// origin/dev, frozen — no changes made here).
// ---------------------------------------------------------------------------

/** GET /api/private/vehicles/positions response row. See
 * UX-OBRS-424-fleet-live-map.md §3 for the resolver reading these flags
 * (`shared/lib/fleet-vehicle-status.ts`) — `stale`/`deviceOnline` MUST NOT be
 * read independently of `positionKnown`/`gpsImeiConfigured`. */
export interface FleetPositionRespDto {
  vehicleId: number;
  numberPlate: string;
  vehicleNumber: string;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  course: number | null;
  engineStatus: number | null; // 0 | 1
  recordedAt: string | null;
  lastSeenAt: string | null;
  positionKnown: boolean;
  stale: boolean;
  deviceOnline: boolean | null;
  gpsImeiConfigured: boolean;
}

// ---------------------------------------------------------------------------
// OBRS-766 — counter (staff act-on-behalf) cancel. Backend contract:
// GET /api/private/bookings/search, GET /api/private/bookings/{id}/cancel-policy
// (existing, shared with the customer path — see my-booking.interface.ts),
// POST /api/private/bookings/{id}/cancel (existing, shared, `CancelBookingReqDto`
// widened additively above). Neither OBRS-661's ordinary act-on-behalf cancel
// nor OBRS-669's cash second-person approval has ever had a frontend caller
// before this card.
// ---------------------------------------------------------------------------

/** One leg of a `CounterBookingSearchResultDto` row. Reuses `BookingStopLookup`
 * — the same `{code, display}` lookup shape the customer my-bookings list
 * already renders via `getStopLabel()` (my-booking.interface.ts) — rather
 * than inventing a second stop-label shape for this one screen. */
export interface CounterBookingSearchJourneyDto {
  fromStop?: BookingStopLookup;
  toStop?: BookingStopLookup;
  departureDateTime?: string;
}

/** `GET /api/private/bookings/search` result row. `contactPhoneMasked` is
 * ALREADY masked server-side (`••••`+last4) — never re-mask or otherwise
 * transform it client-side. `status` is the same lowercase status-code
 * vocabulary as `MyBookingDto.status` (`MY_BOOKINGS.STATUS.*`). */
export interface CounterBookingSearchResultDto {
  bookingId: number;
  bookingNumber: string;
  contactName: string;
  contactPhoneMasked: string;
  status: string;
  netAmount: number | string;
  journeys: CounterBookingSearchJourneyDto[];
}

export interface CounterBookingSearchParams {
  phone?: string;
  bookingNumber?: string;
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class StaffApiService {
  private readonly skipContext = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true);

  constructor(private readonly http: HttpClient) {}

  getMySchedules(): Observable<ResponseAPI<unknown[]>> {
    return this.http.get<ResponseAPI<unknown[]>>(
      `${environment.apiUrl}/api/private/schedules?assignedToMe=true`,
      { context: this.skipContext }
    );
  }

  getBoardingList(scheduleId: number): Observable<ResponseAPI<BoardingListItemDto[]>> {
    return this.http.get<ResponseAPI<BoardingListItemDto[]>>(
      `${environment.apiUrl}/api/private/schedules/${scheduleId}/boarding-list`,
      { context: this.skipContext }
    );
  }

  /** OBRS-100: thin passthrough for the boarding-list print/export trip
   * header (route/departure/vehicle/driver) — `BoardingListComponent` calls
   * this directly rather than `AdminApiService.getScheduleById()` so a
   * `shared/` component doesn't take a runtime dependency on an
   * admin-domain-named service (see docs/adr/0015). Errors are suppressed
   * globally (skipContext) because the caller degrades silently on failure
   * (e.g. a driver 403'd off a schedule they don't own) rather than
   * surfacing a toast for a supplementary header fetch. */
  getScheduleById(id: number): Observable<ResponseAPI<AdminScheduleDto>> {
    return this.http.get<ResponseAPI<AdminScheduleDto>>(
      `${environment.apiUrl}/api/private/schedules/${id}`,
      { context: this.skipContext }
    );
  }

  // OBRS-96: manual boarding-scan validation (staff/operator, text-entry
  // token — camera scanning is out of scope for this card). SKIP_AUTH_LOGOUT
  // is set here in ADDITION to the shared skipContext, mirroring
  // booking.service.ts / promotion.service.ts, as defense-in-depth against
  // the OBRS-187 force-logout bug even though the backend guarantees a
  // domain 400/409 (never a bare 401) for every rejected scan.
  //
  // OBRS-130: `board()`/`unboard()` reuse this same context for the identical
  // reason — a domain 409 (ALREADY_BOARDED/NOT_BOARDED) on a manual boarding
  // action must never force-logout the operator (OBRS-187 trap).
  private readonly boardingScanContext = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true)
    .set(SKIP_AUTH_LOGOUT, true);

  boardingScan(request: BoardingScanRequest): Observable<ResponseAPI<BoardingScanResultDto>> {
    return this.http.post<ResponseAPI<BoardingScanResultDto>>(
      `${environment.apiUrl}/api/private/tickets/boarding-scan`,
      request,
      { context: this.boardingScanContext }
    );
  }

  /** OBRS-130: manually board a ticket from the boarding-list manifest
   * (replaces the retired `checkIn()`/`/check-in` action on this flow). */
  board(ticketId: number): Observable<ResponseAPI<null>> {
    return this.http.post<ResponseAPI<null>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/board`,
      {},
      { context: this.boardingScanContext }
    );
  }

  /** OBRS-130: reverse a boarding stamp (salesperson/admin only — enforced by
   * the backend `@PreAuthorize` and mirrored client-side by hiding the
   * control for drivers). */
  unboard(ticketId: number): Observable<ResponseAPI<null>> {
    return this.http.post<ResponseAPI<null>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/unboard`,
      {},
      { context: this.boardingScanContext }
    );
  }

  /** OBRS-296: flag a ticket's fare category as a mismatch (low-stakes, no
   * confirm — mirrors `board()`). Reuses `boardingScanContext` — a domain 409
   * (`ALREADY_FLAGGED`) must never force-logout the operator nor duplicate a
   * global alert (OBRS-187 trap), same reasoning as `board()`/`unboard()`. */
  flagChildFare(ticketId: number): Observable<ResponseAPI<null>> {
    return this.http.post<ResponseAPI<null>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/flag-child-fare`,
      {},
      { context: this.boardingScanContext }
    );
  }

  /** OBRS-296: reverse a child-fare mismatch flag (salesperson/admin only —
   * enforced by the backend `@PreAuthorize` and mirrored client-side by
   * hiding the control, same shape as `unboard()`). */
  unflagChildFare(ticketId: number): Observable<ResponseAPI<null>> {
    return this.http.post<ResponseAPI<null>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/unflag-child-fare`,
      {},
      { context: this.boardingScanContext }
    );
  }

  /** OBRS-256: forward-only schedule status transition
   * (`scheduled` → `departed` → `arrived`), driven by the boarding-list
   * header strip. Reuses `boardingScanContext` — a domain 409
   * (`SCHEDULE_TRANSITION_ILLEGAL`) must never force-logout the operator nor
   * duplicate a global alert (OBRS-187 trap), same reasoning as
   * `board()`/`unboard()`.
   *
   * OBRS-471: `overrideTurnaroundGate` (defaults `false`, matching the DTO's
   * default) is the admin/owner-only escape hatch for the vehicle-turnaround
   * gate — set `true` only on the operator-confirmed retry after a 409
   * `VEHICLE_PREVIOUS_TRIP_NOT_ARRIVED`. A non-admin/owner sending `true`
   * gets a 403 `SCHEDULE_OVERRIDE_NOT_PERMITTED` server-side; the FE never
   * sends it unless `canOverrideTurnaroundGate` is true. */
  updateScheduleStatus(
    id: number,
    status: 'departed' | 'arrived',
    overrideTurnaroundGate = false
  ): Observable<ResponseAPI<{ scheduleId: number; status: string }>> {
    return this.http.patch<ResponseAPI<{ scheduleId: number; status: string }>>(
      `${environment.apiUrl}/api/private/schedules/${id}/status`,
      { status, overrideTurnaroundGate },
      { context: this.boardingScanContext }
    );
  }

  /** OBRS-272: mark/update a schedule's ETA delay — status STAYS `scheduled`
   * (delay is a derived UI state, never a status code). Reuses
   * `boardingScanContext` — a domain 409 (`SCHEDULE_DELAY_NOT_SCHEDULED`) or
   * 400 (`SCHEDULE_DELAY_ETA_INVALID`/bean-validation) must never force-logout
   * the operator nor duplicate a global alert (OBRS-187 trap), same reasoning
   * as `updateScheduleStatus()`. */
  delaySchedule(
    id: number,
    payload: DelayScheduleReqDto
  ): Observable<ResponseAPI<DelayScheduleRespDto>> {
    return this.http.patch<ResponseAPI<DelayScheduleRespDto>>(
      `${environment.apiUrl}/api/private/schedules/${id}/delay`,
      payload,
      { context: this.boardingScanContext }
    );
  }

  searchSchedules(req: ScheduleSearchReqDto): Observable<ResponseAPI<ScheduleSearchResultDto>> {
    return this.http.post<ResponseAPI<ScheduleSearchResultDto>>(
      `${environment.apiUrl}/api/public/schedules/search`,
      req,
      { context: this.skipContext }
    );
  }

  createWalkInBooking(payload: WalkInBookingReqDto): Observable<ResponseAPI<WalkInBookingRespDto>> {
    return this.http.post<ResponseAPI<WalkInBookingRespDto>>(
      `${environment.apiUrl}/api/private/bookings`,
      payload,
      { context: this.skipContext }
    );
  }

  payWalkIn(bookingId: number, idempotencyKey: string): Observable<ResponseAPI<WalkInPaymentRespDto>> {
    const headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    const body: WalkInPaymentReqDto = { bookingId, paymentMethod: 'cash' };
    return this.http.post<ResponseAPI<WalkInPaymentRespDto>>(
      `${environment.apiUrl}/api/private/payments/walk-in`,
      body,
      { context: this.skipContext, headers }
    );
  }

  getWalkInSchedules(date: string): Observable<ResponseAPI<WalkInRouteGroupDto[]>> {
    return this.http.get<ResponseAPI<WalkInRouteGroupDto[]>>(
      `${environment.apiUrl}/api/private/schedules/walk-in?date=${date}`,
      { context: this.skipContext }
    );
  }

  // Stop pairs (with per-vehicle-type fares) for a route — drives the walk-in
  // pickup/drop-off selection and segment pricing. Salesperson-authorized.
  getRouteSegments(routeSlug: string): Observable<ResponseAPI<RouteSegmentsDto>> {
    return this.http.get<ResponseAPI<RouteSegmentsDto>>(
      `${environment.apiUrl}/api/private/segments/${encodeURIComponent(routeSlug)}`,
      { context: this.skipContext }
    );
  }

  // Canonical ordered stops for a route with each stop's cumulative time offset
  // from the origin (GET /api/private/route-stops/{slug}) — the authoritative
  // source for stop ordering and estimated per-stop times on the walk-in sell
  // page. Salesperson-authorized.
  getRouteStops(routeSlug: string): Observable<ResponseAPI<RouteStopsDto>> {
    return this.http.get<ResponseAPI<RouteStopsDto>>(
      `${environment.apiUrl}/api/private/route-stops/${encodeURIComponent(routeSlug)}`,
      { context: this.skipContext }
    );
  }

  // Driver list — GET /api/private/users/drivers (SALESPERSON-readable).
  // Must NOT use AdminApiService.getUsers() which hits /private/users (OWNER-only, 403 for salesperson).
  getDrivers(): Observable<ResponseAPI<DriverDto[]>> {
    return this.http.get<ResponseAPI<DriverDto[]>>(
      `${environment.apiUrl}/api/private/users/drivers`,
      { context: this.skipContext }
    );
  }

  // Current user's own profile — GET /api/private/users/me. Used by the walk-in
  // sell page (OBRS-193) to read the salesperson's assigned salesPointStop and
  // default the pickup stop selection to it.
  getMe(): Observable<ResponseAPI<AdminUserDto>> {
    return this.http.get<ResponseAPI<AdminUserDto>>(
      `${environment.apiUrl}/api/private/users/me`,
      { context: this.skipContext }
    );
  }

  // ---------------------------------------------------------------------------
  // OBRS-305 Card 2 — parcel consigned intake + delivery handoff (staff-facing).
  // See ../OBRS-backend/docs/api/parcels-consigned-delivery.md.
  // ---------------------------------------------------------------------------

  /** The one `POST /api/private/parcels/walk-in` call, shared by both
   * branches below — `parcelType` on the payload discriminates server-side.
   * Kept private so each branch keeps its own narrow request/response typing
   * at the public call site (OBRS-341: extend, don't fork — this is the
   * shared part factored out, not a second copy of the HTTP call). */
  private postWalkInParcel<TReq, TResp>(payload: TReq): Observable<ResponseAPI<TResp>> {
    return this.http.post<ResponseAPI<TResp>>(
      `${environment.apiUrl}/api/private/parcels/walk-in`,
      payload,
      { context: this.skipContext }
    );
  }

  /** POST /api/private/parcels/walk-in, consigned branch. Reuses the Card-1
   * walk-in endpoint (SALESPERSON-authorized) — `parcelType: 'consigned'`
   * routes to the new consigned branch server-side. */
  createConsignedParcel(
    payload: ParcelConsignedReqDto
  ): Observable<ResponseAPI<ParcelConsignedRespDto>> {
    return this.postWalkInParcel<ParcelConsignedReqDto, ParcelConsignedRespDto>(payload);
  }

  /** POST /api/private/parcels/walk-in, carry-on-on-seat branch (OBRS-341) —
   * same endpoint as `createConsignedParcel` above; `parcelType:
   * 'carry_on_seat'` routes to the original Card-1 branch server-side (see
   * `../OBRS-backend/docs/api/parcels.md`). */
  createCarryOnParcel(
    payload: ParcelCarryOnReqDto
  ): Observable<ResponseAPI<ParcelCarryOnRespDto>> {
    return this.postWalkInParcel<ParcelCarryOnReqDto, ParcelCarryOnRespDto>(payload);
  }

  /** GET /api/private/parcels/quote — live consigned quote, refetched
   * debounced by the consign form as schedule/pickup/dropoff/weight change. */
  getParcelQuote(params: ParcelQuoteReqParams): Observable<ResponseAPI<ParcelQuoteRespDto>> {
    const query = new URLSearchParams({
      parcelType: params.parcelType,
      scheduleId: String(params.scheduleId),
      pickupStopId: String(params.pickupStopId),
      dropoffStopId: String(params.dropoffStopId),
      weightKg: String(params.weightKg),
    }).toString();
    return this.http.get<ResponseAPI<ParcelQuoteRespDto>>(
      `${environment.apiUrl}/api/private/parcels/quote?${query}`,
      { context: this.skipContext }
    );
  }

  /** GET /api/private/schedules/{id}/cargo-availability — the cargo-remaining
   * indicator on the consign form. */
  getCargoAvailability(scheduleId: number): Observable<ResponseAPI<CargoAvailabilityRespDto>> {
    return this.http.get<ResponseAPI<CargoAvailabilityRespDto>>(
      `${environment.apiUrl}/api/private/schedules/${scheduleId}/cargo-availability`,
      { context: this.skipContext }
    );
  }

  /** GET /api/private/parcels/{id}/waybill — Option B (ADR-0067 on the
   * backend): no server-side PDF, FE renders + browser print-to-PDF. */
  getWaybill(parcelId: number): Observable<ResponseAPI<WaybillRespDto>> {
    return this.http.get<ResponseAPI<WaybillRespDto>>(
      `${environment.apiUrl}/api/private/parcels/${parcelId}/waybill`,
      { context: this.skipContext }
    );
  }

  /** ASSUMED endpoint, not yet in the backend contract doc — see
   * `docs/handoff.md` Contract Requests (OBRS-305). Backs the delivery-handoff
   * list for one schedule (the _ส่งมอบ_ tab of
   * `/staff/parcels/schedule/:scheduleId` since OBRS-574). This
   * endpoint's backing query deliberately EXCLUDES `deliveryStatus ===
   * 'created'` rows (OBRS-415/OBRS-348) — it can never back the verify-list
   * screen; use `getParcelsPendingVerification` for that (OBRS-416 fix). */
  getConsignedParcelsForSchedule(
    scheduleId: number
  ): Observable<ResponseAPI<ParcelDeliveryListItemDto[]>> {
    return this.http.get<ResponseAPI<ParcelDeliveryListItemDto[]>>(
      `${environment.apiUrl}/api/private/schedules/${scheduleId}/parcels/consigned`,
      { context: this.skipContext }
    );
  }

  /** OBRS-416 fix: dedicated endpoint for the verify-list screen
   * (the _ตรวจรับ_ tab of `/staff/parcels/schedule/:scheduleId` since
   * OBRS-574). The sibling
   * `getConsignedParcelsForSchedule` above deliberately excludes
   * `deliveryStatus === 'created'` rows server-side, so filtering ITS
   * response client-side down to `'created'` is always an empty
   * intersection — that was the original bug. This endpoint filters to
   * `deliveryStatus === 'created'` server-side and returns the same
   * `ParcelDeliveryListItemDto[]` row shape (including `lengthCm`/`widthCm`/
   * `heightCm`/`amount`) under the same `{ data: [...] }` envelope. */
  getParcelsPendingVerification(
    scheduleId: number
  ): Observable<ResponseAPI<ParcelDeliveryListItemDto[]>> {
    return this.http.get<ResponseAPI<ParcelDeliveryListItemDto[]>>(
      `${environment.apiUrl}/api/private/schedules/${scheduleId}/parcels/pending-verification`,
      { context: this.skipContext }
    );
  }

  /** Domain state-transition action endpoints (load/arrived/collect) reuse
   * `boardingScanContext`'s reasoning: a domain 409 (wrong-state,
   * code/token mismatch, already-collected) on a retryable staff action must
   * never force-logout the operator nor duplicate a global alert (OBRS-187
   * trap) — same defensive treatment as `board()`/`unboard()`/
   * `updateScheduleStatus()`/`delaySchedule()` above. */
  private readonly parcelActionContext = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true)
    .set(SKIP_AUTH_LOGOUT, true);

  /** POST /api/private/parcels/{id}/load — accepted → in_transit. DRIVER-only. */
  loadParcel(parcelId: number): Observable<ResponseAPI<ParcelLoadRespDto>> {
    return this.http.post<ResponseAPI<ParcelLoadRespDto>>(
      `${environment.apiUrl}/api/private/parcels/${parcelId}/load`,
      {},
      { context: this.parcelActionContext }
    );
  }

  /** POST /api/private/parcels/{id}/arrived — in_transit → arrived_notified. DRIVER-only. */
  markParcelArrived(parcelId: number): Observable<ResponseAPI<ParcelArrivedRespDto>> {
    return this.http.post<ResponseAPI<ParcelArrivedRespDto>>(
      `${environment.apiUrl}/api/private/parcels/${parcelId}/arrived`,
      {},
      { context: this.parcelActionContext }
    );
  }

  /** POST /api/private/parcels/{id}/collect — arrived_notified → collected
   * (CAS). Body carries exactly one of collectionCode/collectionToken. */
  collectParcel(
    parcelId: number,
    payload: ParcelCollectReqDto
  ): Observable<ResponseAPI<ParcelCollectRespDto>> {
    return this.http.post<ResponseAPI<ParcelCollectRespDto>>(
      `${environment.apiUrl}/api/private/parcels/${parcelId}/collect`,
      payload,
      { context: this.parcelActionContext }
    );
  }

  /** POST /api/private/parcels/{id}/verify — created -> accepted | rejected
   * (CAS). DRIVER-only (role hierarchy also admits SALESPERSON/OWNER/ADMIN,
   * so one screen serves both the counter salesperson and the roadside
   * driver). OBRS-416. Reuses `parcelActionContext` — same reasoning as
   * load/arrived/collect above: a domain 409/404/400 on this action must
   * never force-logout the operator nor duplicate the global alert. */
  verifyParcel(
    parcelId: number,
    payload: ParcelVerifyReqDto
  ): Observable<ResponseAPI<ParcelVerifyRespDto>> {
    return this.http.post<ResponseAPI<ParcelVerifyRespDto>>(
      `${environment.apiUrl}/api/private/parcels/${parcelId}/verify`,
      payload,
      { context: this.parcelActionContext }
    );
  }

  // ---------------------------------------------------------------------------
  // OBRS-312 — digital weekly vehicle inspection checklist (driver-facing).
  // ---------------------------------------------------------------------------

  /** GET /api/private/vehicle-inspection-items — populates the form; not
   * cached with `skipContext` suppressed error alerting since the page owns
   * its own empty/error states. */
  getInspectionItems(): Observable<ResponseAPI<VehicleInspectionItemDto[]>> {
    return this.http.get<ResponseAPI<VehicleInspectionItemDto[]>>(
      `${environment.apiUrl}/api/private/vehicle-inspection-items`,
      { context: this.skipContext }
    );
  }

  /** GET /api/private/vehicles/inspectable — the vehicle picker source. */
  getInspectableVehicles(): Observable<ResponseAPI<InspectableVehicleDto[]>> {
    return this.http.get<ResponseAPI<InspectableVehicleDto[]>>(
      `${environment.apiUrl}/api/private/vehicles/inspectable`,
      { context: this.skipContext }
    );
  }

  /** POST /api/private/vehicles/{vehicleId}/inspections. Reuses
   * `boardingScanContext` — a domain 4xx (INSPECTION_ITEMS_INCOMPLETE /
   * INSPECTION_NOTE_REQUIRED / INSPECTION_ITEM_INACTIVE /
   * ODOMETER_BELOW_LAST_RECORDED) must never force-logout the operator nor
   * duplicate a global alert (OBRS-187 trap) — the component owns its own
   * non-destructive error handling (see `vehicle-inspection-error.ts`). */
  submitVehicleInspection(
    vehicleId: number,
    payload: SubmitVehicleInspectionPayload
  ): Observable<ResponseAPI<SubmitVehicleInspectionRespDto>> {
    return this.http.post<ResponseAPI<SubmitVehicleInspectionRespDto>>(
      `${environment.apiUrl}/api/private/vehicles/${vehicleId}/inspections`,
      payload,
      { context: this.boardingScanContext }
    );
  }

  /** GET /api/private/inspections/me — drives the "already inspected this
   * week" hint banner. */
  getMyInspections(): Observable<ResponseAPI<MyInspectionDto[]>> {
    return this.http.get<ResponseAPI<MyInspectionDto[]>>(
      `${environment.apiUrl}/api/private/inspections/me`,
      { context: this.skipContext }
    );
  }

  // ---------------------------------------------------------------------------
  // OBRS-424 — internal fleet live map (layer 1).
  // ---------------------------------------------------------------------------

  /** GET /api/private/vehicles/positions — the whole fleet's latest known
   * position + staleness flags (OBRS-423, frozen contract). Reuses
   * `skipContext` (UX §9.4): the page owns its own loading/error UX and a
   * genuine 401 must still force logout like any other authenticated
   * background call, so `SKIP_AUTH_LOGOUT` is deliberately NOT set here. */
  getFleetPositions(): Observable<ResponseAPI<FleetPositionRespDto[]>> {
    return this.http.get<ResponseAPI<FleetPositionRespDto[]>>(
      `${environment.apiUrl}/api/private/vehicles/positions`,
      { context: this.skipContext }
    );
  }

  // ---------------------------------------------------------------------------
  // OBRS-766 — counter cancel (act-on-behalf, OBRS-661 / OBRS-669).
  // ---------------------------------------------------------------------------

  /** Same reasoning as `boardingScanContext`/`parcelActionContext` above: a
   * domain 4xx on search/policy/cancel (criteria-required, window-closed, an
   * approver rejection) must never force-logout the operator nor duplicate
   * the global alert — the counter-cancel page and modal own their own error
   * UX end to end, branching on `errorCode`. */
  private readonly cancelActionContext = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true)
    .set(SKIP_AUTH_LOGOUT, true);

  /** GET /api/private/bookings/search — exactly one of phone/bookingNumber,
   * both exact-match, plus page/size. Never 404s (contract): no match,
   * out-of-fleet, and garbage input all come back an empty 200 page — the
   * page's own empty-state copy is what stays honest about which of those it
   * was, not this method. */
  searchBookings(
    params: CounterBookingSearchParams
  ): Observable<ResponseAPI<PageResponse<CounterBookingSearchResultDto>>> {
    let httpParams = new HttpParams()
      .set('page', params.page)
      .set('size', params.size);
    if (params.phone) {
      httpParams = httpParams.set('phone', params.phone);
    }
    if (params.bookingNumber) {
      httpParams = httpParams.set('bookingNumber', params.bookingNumber);
    }
    return this.http.get<ResponseAPI<PageResponse<CounterBookingSearchResultDto>>>(
      `${environment.apiUrl}/api/private/bookings/search`,
      { params: httpParams, context: this.cancelActionContext }
    );
  }

  /** GET /api/private/bookings/{id}/cancel-policy — the SAME endpoint and
   * response shape (`CancellationPolicy`, my-booking.interface.ts) the
   * customer `my-bookings` flow already calls via
   * `BookingService.getCancellationPolicy()`; this is the identical refund
   * preview, just reachable from the counter. */
  getCancelPolicy(bookingId: number): Observable<ResponseAPI<CancellationPolicy>> {
    return this.http.get<ResponseAPI<CancellationPolicy>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/cancel-policy`,
      { context: this.cancelActionContext }
    );
  }

  /** POST /api/private/bookings/{id}/cancel — the SAME endpoint
   * `BookingService.cancelBooking()` posts to for the customer path.
   * `payload` defaults to `{}` so a non-cash, non-manual-refund counter
   * cancel posts the byte-identical empty body every existing caller of that
   * endpoint already sends (FE-1) — `approverEmail`/`approverPassword`/
   * `refundDestination` are only ever set by the caller, never defaulted to
   * `''`/`null` here. */
  cancelCounterBooking(
    bookingId: number,
    payload: CancelBookingReqDto = {}
  ): Observable<ResponseAPI<CancelBookingResult>> {
    return this.http.post<ResponseAPI<CancelBookingResult>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/cancel`,
      payload,
      { context: this.cancelActionContext }
    );
  }
}
