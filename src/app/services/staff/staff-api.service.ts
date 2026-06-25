import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { SKIP_GLOBAL_ERROR_ALERT, SKIP_GLOBAL_LOADING_ALERT } from '../../shared/interceptors/http-context-tokens';

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

export interface RouteSegmentsDto {
  route: SegmentStopRefDto;
  stopPairs: SegmentStopPairDto[];
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

  checkIn(ticketId: number): Observable<ResponseAPI<null>> {
    return this.http.post<ResponseAPI<null>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/check-in`,
      {},
      { context: this.skipContext }
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
}
