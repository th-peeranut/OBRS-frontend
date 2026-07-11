import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import {
  BoardingScanRequest,
  BoardingScanResultDto,
} from '../../shared/interfaces/ticket-boarding.interface';
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
}

export interface WalkInRouteGroupDto {
  routeSlug: string;
  routeLabel: string;
  trips: WalkInTripDto[];
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
  /** LookupResponse — `code` is the stop slug used to join with segment stops. */
  stop: { code: string };
}

export interface RouteStopsDto {
  stops: RouteStopTimeDto[];
}

export interface WalkInBookingReqDto {
  bookingType: 'one_way' | 'return';
  totalAmount: number;
  bookingChannel: 'walk_in';
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
}
