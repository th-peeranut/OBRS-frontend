import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StaffApiService, isOpenSeatingTrip } from './staff-api.service';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_LOGOUT } from '../../shared/interceptors/http-context-tokens';

describe('StaffApiService', () => {
  let service: StaffApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StaffApiService],
    });
    service = TestBed.inject(StaffApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getMySchedules() returns an observable', () => {
    service.getMySchedules().subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules?assignedToMe=true`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  it('getBoardingList() returns an observable for a scheduleId', () => {
    service.getBoardingList(42).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules/42/boarding-list`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  // OBRS-100: thin passthrough for the boarding-list print/export trip
  // header — deliberately a second call site for the same endpoint as
  // AdminApiService.getScheduleById() (docs/adr/0015), not a shared call.
  it('getScheduleById() gets the schedule detail endpoint', () => {
    service.getScheduleById(42).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules/42`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { id: 42 } });
  });

  it('board() posts to the correct endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.board(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/board`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('unboard() posts to the correct endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.unboard(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/unboard`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('flagChildFare() posts to the correct endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.flagChildFare(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/flag-child-fare`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('unflagChildFare() posts to the correct endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.unflagChildFare(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/unflag-child-fare`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('searchSchedules() posts to the search endpoint', () => {
    const searchReq = {
      bookingType: 'one_way' as const,
      departureDate: '2025-01-01',
      fromStop: 'a',
      toStop: 'b',
      numberOfPassengers: 1,
    };
    service.searchSchedules(searchReq).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/public/schedules/search`);
    expect(req.request.method).toBe('POST');
    req.flush({ code: 200, message: 'OK', data: { departureSchedules: [], arrivalSchedules: [] } });
  });

  it('boardingScan() posts { token, scheduleId } to the boarding-scan endpoint', () => {
    service.boardingScan({ token: 'signed.jwt.token', scheduleId: 42 }).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/boarding-scan`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'signed.jwt.token', scheduleId: 42 });
    req.flush({
      code: 200,
      message: 'OK',
      data: {
        ticketId: 7,
        ticketNumber: 'T-ABC123',
        passengerName: 'Mr. Abc Def',
        seatNumber: '3',
        boardedAt: '2026-07-10T08:00:00Z',
      },
    });
  });

  it('boardingScan() sets SKIP_AUTH_LOGOUT (defense-in-depth against OBRS-187)', () => {
    service.boardingScan({ token: 'bad-token', scheduleId: 42 }).subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/boarding-scan`);
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ errorCode: 'INVALID_TICKET_TOKEN' }, { status: 400, statusText: 'Bad Request' });
  });

  it('payWalkIn() sends Idempotency-Key header', () => {
    service.payWalkIn(1, 'test-key-123').subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/payments/walk-in`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('test-key-123');
    req.flush({ code: 200, message: 'OK', data: { id: 1, bookingId: 1, status: 'paid', paymentMethod: 'cash', amount: 100 } });
  });

  // ---------------------------------------------------------------------------
  // OBRS-305 Card 2 — parcel consigned intake + delivery handoff
  // ---------------------------------------------------------------------------

  it('createConsignedParcel() posts the consigned walk-in payload', () => {
    const payload = {
      parcelType: 'consigned' as const,
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
      description: 'Documents',
      prohibitedAcknowledged: true,
      sender: { name: 'Somchai', phone: '0812345678' },
      recipient: { name: 'Somsri', phone: '0898765432' },
      paymentMethod: 'cash' as const,
      seatCount: null,
    };
    service.createConsignedParcel(payload).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/walk-in`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({
      code: 201,
      message: 'Created',
      data: {
        parcelId: 1,
        trackingNumber: 'PCL-1',
        bookingId: 10,
        bookingNumber: 'BK-1',
        amount: 100,
        deliveryStatus: 'accepted',
        collectionCode: 'ABC123',
        waybillUrl: '/staff/parcels/1/waybill',
      },
    });
  });

  // OBRS-341 — carry-on-on-seat branch, same endpoint, different discriminant/shape.
  it('createCarryOnParcel() posts the carry-on-on-seat walk-in payload (no recipient, dimensions required)', () => {
    const payload = {
      parcelType: 'carry_on_seat' as const,
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
      dimensions: { lengthCm: 80, widthCm: 40, heightCm: 30 },
      seatCount: 1,
      seatNumbers: ['A1'],
      description: 'Oversized backpack',
      prohibitedAcknowledged: true,
      sender: { name: 'Somchai', phone: '0812345678' },
      paymentMethod: 'cash' as const,
    };
    service.createCarryOnParcel(payload).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/walk-in`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    expect((req.request.body as Record<string, unknown>)['recipient']).toBeUndefined();
    req.flush({
      code: 201,
      message: 'Created',
      data: {
        parcelId: 5,
        trackingNumber: 'P-AB12CD34EF',
        bookingId: 91,
        bookingNumber: 'B-000091',
        parcelType: 'carry_on_seat',
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A1'],
        amount: 150,
        bookingNetAmount: 150,
      },
    });
  });

  it('getParcelQuote() gets the quote endpoint with the correct query params', () => {
    service
      .getParcelQuote({ parcelType: 'consigned', scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 })
      .subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(
      `${environment.apiUrl}/api/private/parcels/quote?parcelType=consigned&scheduleId=42&pickupStopId=1&dropoffStopId=2&weightKg=5`
    );
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 } });
  });

  it('getParcelQuote() also accepts parcelType=carry_on_seat (OBRS-341, same endpoint)', () => {
    service
      .getParcelQuote({ parcelType: 'carry_on_seat', scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 })
      .subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(
      `${environment.apiUrl}/api/private/parcels/quote?parcelType=carry_on_seat&scheduleId=42&pickupStopId=1&dropoffStopId=2&weightKg=5`
    );
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 } });
  });

  it('getCargoAvailability() gets the schedule cargo-availability endpoint', () => {
    service.getCargoAvailability(42).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules/42/cargo-availability`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { cargoCapacityKg: 100, bookedKg: 10, remainingKg: 90 } });
  });

  it('getWaybill() gets the waybill endpoint', () => {
    service.getWaybill(1).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/1/waybill`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: {} });
  });

  it('getConsignedParcelsForSchedule() gets the schedule delivery-list endpoint', () => {
    service.getConsignedParcelsForSchedule(42).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules/42/parcels/consigned`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  it('getParcelsPendingVerification() gets the dedicated verify-list endpoint (OBRS-416 fix)', () => {
    service.getParcelsPendingVerification(42).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(
      `${environment.apiUrl}/api/private/schedules/42/parcels/pending-verification`
    );
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  it('loadParcel() posts to the load endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.loadParcel(1).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/1/load`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: { deliveryStatus: 'in_transit' } });
  });

  it('markParcelArrived() posts to the arrived endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.markParcelArrived(1).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/1/arrived`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: { deliveryStatus: 'arrived_notified', arrivedNotifiedAt: '2026-07-14T08:00:00Z' } });
  });

  it('collectParcel() posts the collection code/token and sets SKIP_AUTH_LOGOUT', () => {
    service.collectParcel(1, { collectionCode: 'ABC123' }).subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/1/collect`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ collectionCode: 'ABC123' });
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: { deliveryStatus: 'collected', collectedAt: '2026-07-14T09:00:00Z', collectedBy: 5 } });
  });

  // ── OBRS-766: counter (staff act-on-behalf) cancel ─────────────────────────
  describe('counter cancel (OBRS-766)', () => {
    it('searchBookings() sends exactly the phone param, plus page/size, and sets SKIP_AUTH_LOGOUT', () => {
      service.searchBookings({ phone: '0812345678', page: 0, size: 20 }).subscribe((res) => expect(res).toBeTruthy());

      const req = httpMock.expectOne(
        (r) => r.url === `${environment.apiUrl}/api/private/bookings/search`
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('phone')).toBe('0812345678');
      expect(req.request.params.has('bookingNumber')).toBeFalse();
      expect(req.request.params.get('page')).toBe('0');
      expect(req.request.params.get('size')).toBe('20');
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      req.flush({
        code: 200,
        message: 'OK',
        data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0, numberOfElements: 0 },
      });
    });

    it('searchBookings() sends exactly the bookingNumber param when searching by booking number', () => {
      service.searchBookings({ bookingNumber: 'B-000123', page: 0, size: 20 }).subscribe((res) => expect(res).toBeTruthy());

      const req = httpMock.expectOne(
        (r) => r.url === `${environment.apiUrl}/api/private/bookings/search`
      );
      expect(req.request.params.get('bookingNumber')).toBe('B-000123');
      expect(req.request.params.has('phone')).toBeFalse();
      req.flush({
        code: 200,
        message: 'OK',
        data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0, numberOfElements: 0 },
      });
    });

    it('getCancelPolicy() gets the cancel-policy endpoint for a bookingId', () => {
      service.getCancelPolicy(42).subscribe((res) => expect(res).toBeTruthy());

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings/42/cancel-policy`);
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      req.flush({ code: 200, message: 'OK', data: { refundMethod: 'card' } });
    });

    it('cancelCounterBooking() defaults to a byte-identical empty body', () => {
      service.cancelCounterBooking(42).subscribe((res) => expect(res).toBeTruthy());

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings/42/cancel`);
      expect(req.request.method).toBe('POST');
      expect(JSON.stringify(req.request.body)).toBe('{}');
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      req.flush({ code: 200, message: 'OK', data: { bookingId: 42, status: 'cancelled' } });
    });

    it('cancelCounterBooking() posts exactly the payload it is given', () => {
      service
        .cancelCounterBooking(42, { approverEmail: 'owner@obrs.test', approverPassword: 'secret' })
        .subscribe((res) => expect(res).toBeTruthy());

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings/42/cancel`);
      expect(req.request.body).toEqual({ approverEmail: 'owner@obrs.test', approverPassword: 'secret' });
      req.flush({ code: 200, message: 'OK', data: { bookingId: 42, status: 'cancelled' } });
    });
  });

  // OBRS-324 (Epic OBRS-318 open seating, 318-d)
  describe('isOpenSeatingTrip', () => {
    it('returns true when seatingMode is OPEN', () => {
      expect(isOpenSeatingTrip({ seatingMode: 'OPEN' })).toBeTrue();
    });

    it('returns false when seatingMode is ASSIGNED', () => {
      expect(isOpenSeatingTrip({ seatingMode: 'ASSIGNED' })).toBeFalse();
    });

    it('returns false when seatingMode is missing (safe default — a cached row predating OBRS-360)', () => {
      expect(isOpenSeatingTrip({})).toBeFalse();
    });

    it('returns false for null/undefined trip', () => {
      expect(isOpenSeatingTrip(null)).toBeFalse();
      expect(isOpenSeatingTrip(undefined)).toBeFalse();
    });
  });
});
