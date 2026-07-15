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

  // OBRS-324 (Epic OBRS-318 open seating, 318-d)
  describe('isOpenSeatingTrip', () => {
    it('returns true when seatingMode is OPEN', () => {
      expect(isOpenSeatingTrip({ seatingMode: 'OPEN' })).toBeTrue();
    });

    it('returns false when seatingMode is ASSIGNED', () => {
      expect(isOpenSeatingTrip({ seatingMode: 'ASSIGNED' })).toBeFalse();
    });

    it('returns false when seatingMode is missing (safe default — backend does not yet expose it here)', () => {
      expect(isOpenSeatingTrip({})).toBeFalse();
    });

    it('returns false for null/undefined trip', () => {
      expect(isOpenSeatingTrip(null)).toBeFalse();
      expect(isOpenSeatingTrip(undefined)).toBeFalse();
    });
  });
});
