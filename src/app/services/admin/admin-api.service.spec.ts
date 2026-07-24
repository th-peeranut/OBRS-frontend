import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminApiService } from './admin-api.service';
import { environment } from '../../../environments/environment';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminApiService],
    });
    service = TestBed.inject(AdminApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getUsabilityReportCountByStatus', () => {
    it('issues a GET with status=new&size=1&page=0 and resolves to data.totalElements', () => {
      let result: number | undefined;
      service.getUsabilityReportCountByStatus('new').subscribe((count) => (result = count));

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/admin/usability-reports` &&
          request.params.get('status') === 'new' &&
          request.params.get('size') === '1' &&
          request.params.get('page') === '0'
      );
      expect(req.request.method).toBe('GET');

      req.flush({
        code: 200,
        message: 'OK',
        data: { content: [], totalElements: 7 },
      });

      expect(result).toBe(7);
    });

    // OBRS-378: admin's badge counts a decision status instead of 'new'
    // (OBRS-527: that status is 'owner_accepted', not 'accepted' — this test
    // exercises the generic status-parameterized wiring with an arbitrary
    // valid status value, not the specific one AdminLayoutComponent picks).
    it('issues a GET with status=accepted&size=1&page=0 and resolves to data.totalElements', () => {
      let result: number | undefined;
      service.getUsabilityReportCountByStatus('accepted').subscribe((count) => (result = count));

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/admin/usability-reports` &&
          request.params.get('status') === 'accepted' &&
          request.params.get('size') === '1' &&
          request.params.get('page') === '0'
      );
      expect(req.request.method).toBe('GET');

      req.flush({
        code: 200,
        message: 'OK',
        data: { content: [], totalElements: 3 },
      });

      expect(result).toBe(3);
    });
  });

  // OBRS-378: the list GET now optionally carries ?status= and a
  // multi-valued ?sort= (must be TWO separate params, not one collapsed
  // value — HttpParams.append vs .set).
  describe('getUsabilityReports', () => {
    // OBRS-403: page/size are now always sent (default page=0/size=20), so
    // "no params" no longer applies — only status/sort remain optional.
    it('issues a GET with only page=0&size=20 when status/sort are omitted', () => {
      service.getUsabilityReports().subscribe();

      // expectOne(string) matches on the full urlWithParams — now that
      // page/size are always appended, match by base URL via a predicate
      // instead (mirroring the status/sort tests below).
      const req = httpMock.expectOne(
        (request) => request.url === `${environment.apiUrl}/api/private/admin/usability-reports`
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('0');
      expect(req.request.params.get('size')).toBe('20');
      expect(req.request.params.has('status')).toBeFalse();

      req.flush({ code: 200, message: 'OK', data: { content: [], totalElements: 0 } });
    });

    it('sends the status param when provided, alongside the default page/size', () => {
      service.getUsabilityReports('accepted').subscribe();

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/admin/usability-reports` &&
          request.params.get('status') === 'accepted' &&
          request.params.get('page') === '0' &&
          request.params.get('size') === '20'
      );
      req.flush({ code: 200, message: 'OK', data: { content: [], totalElements: 0 } });
    });

    it('sends TWO distinct sort params via append (not collapsed into one by .set)', () => {
      service.getUsabilityReports('accepted', ['createdAt,asc', 'id,asc']).subscribe();

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/admin/usability-reports` &&
          request.params.get('status') === 'accepted'
      );
      expect(req.request.params.getAll('sort')).toEqual(['createdAt,asc', 'id,asc']);

      req.flush({ code: 200, message: 'OK', data: { content: [], totalElements: 0 } });
    });

    it('sends an explicit page/size when provided', () => {
      service.getUsabilityReports('accepted', ['createdAt,asc', 'id,asc'], 2, 20).subscribe();

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/admin/usability-reports` &&
          request.params.get('page') === '2' &&
          request.params.get('size') === '20'
      );
      req.flush({ code: 200, message: 'OK', data: { content: [], totalElements: 0 } });
    });
  });

  // OBRS-98: regression for the endpoint path / from-to param contract, same
  // rationale as getRoundTripPromotion below — a store-stub spec never
  // exercises the real HttpClient call.
  describe('getRefundVoidReport', () => {
    it('issues a GET to /api/private/admin/reports/refund-void with from/to params', () => {
      service.getRefundVoidReport('2026-07-01', '2026-07-07').subscribe();

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/admin/reports/refund-void` &&
          request.params.get('from') === '2026-07-01' &&
          request.params.get('to') === '2026-07-07'
      );
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  // OBRS-99: regression for the endpoint path / from-to param contract, same
  // rationale as getRefundVoidReport above.
  describe('getCashOnlineReconciliationReport', () => {
    it('issues a GET to /api/private/admin/reports/cash-online-reconciliation with from/to params', () => {
      service.getCashOnlineReconciliationReport('2026-07-01', '2026-07-07').subscribe();

      const req = httpMock.expectOne(
        (request) =>
          request.url ===
            `${environment.apiUrl}/api/private/admin/reports/cash-online-reconciliation` &&
          request.params.get('from') === '2026-07-01' &&
          request.params.get('to') === '2026-07-07'
      );
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  // OBRS-85: regression for the wrong-URL / wrong-field contract breaks
  // Scrutinize found — a store-stub spec never exercises the real HttpClient
  // call, so these hit HttpTestingController directly.
  describe('getRoundTripPromotion', () => {
    it('issues a GET to /api/private/admin/promotions/round-trip', () => {
      service.getRoundTripPromotion().subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/promotions/round-trip`
      );
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  describe('updateRoundTripPromotion', () => {
    it('issues a PATCH to /api/private/admin/promotions/round-trip', () => {
      service.updateRoundTripPromotion({ discountValue: 25 }).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/promotions/round-trip`
      );
      expect(req.request.method).toBe('PATCH');

      req.flush({ code: 200, message: 'OK', data: null });
    });

    it('sends `active: boolean` on the wire, not `status` — matches RoundTripPromotionReqDto', () => {
      service.updateRoundTripPromotion({ active: true }).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/promotions/round-trip`
      );
      expect(req.request.body).toEqual({ active: true });
      expect(req.request.body.status).toBeUndefined();

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  // OBRS-223: reminder-timing config, a singleton row shipped backend-only by
  // OBRS-139 (GET/PUT /api/private/admin/configs/reminders).
  describe('getReminderConfig', () => {
    it('issues a GET to /api/private/admin/configs/reminders', () => {
      service.getReminderConfig().subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/configs/reminders`
      );
      expect(req.request.method).toBe('GET');

      req.flush({
        code: 200,
        message: 'OK',
        data: { reminderHoursBeforeDeparture: 24, boardingReminderMinutesBeforeDeparture: 45 },
      });
    });
  });

  describe('updateReminderConfig', () => {
    it('issues a PUT to /api/private/admin/configs/reminders with the full payload shape', () => {
      service
        .updateReminderConfig({
          reminderHoursBeforeDeparture: 12,
          boardingReminderMinutesBeforeDeparture: 30,
        })
        .subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/configs/reminders`
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        reminderHoursBeforeDeparture: 12,
        boardingReminderMinutesBeforeDeparture: 30,
      });

      req.flush({
        code: 200,
        message: 'OK',
        data: { reminderHoursBeforeDeparture: 12, boardingReminderMinutesBeforeDeparture: 30 },
      });
    });
  });

  // OBRS-358: jump-seat (walk-in-only seat channel) toggle, a singleton row
  // mirroring reminder-config above (GET/PUT /api/private/admin/configs/jump-seat).
  describe('getJumpSeatConfig', () => {
    it('issues a GET to /api/private/admin/configs/jump-seat', () => {
      service.getJumpSeatConfig().subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/configs/jump-seat`
      );
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: { enabled: true } });
    });
  });

  describe('updateJumpSeatConfig', () => {
    it('issues a PUT to /api/private/admin/configs/jump-seat with the full payload shape', () => {
      service.updateJumpSeatConfig({ enabled: false }).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/configs/jump-seat`
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ enabled: false });

      req.flush({ code: 200, message: 'OK', data: { enabled: false } });
    });
  });

  // OBRS-564: booking-policy config (max advance-booking days, cutoff
  // minutes), a singleton row mirroring reminder-config/jump-seat-config
  // above (GET/PUT /api/private/admin/configs/booking-policy).
  describe('getBookingPolicyConfig', () => {
    it('issues a GET to /api/private/admin/configs/booking-policy', () => {
      service.getBookingPolicyConfig().subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/configs/booking-policy`
      );
      expect(req.request.method).toBe('GET');

      req.flush({
        code: 200,
        message: 'OK',
        data: { maxAdvanceDays: 45, cutoffMinutes: 20 },
      });
    });
  });

  describe('updateBookingPolicyConfig', () => {
    it('issues a PUT to /api/private/admin/configs/booking-policy with the full payload shape', () => {
      service
        .updateBookingPolicyConfig({ maxAdvanceDays: 45, cutoffMinutes: 20 })
        .subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/admin/configs/booking-policy`
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ maxAdvanceDays: 45, cutoffMinutes: 20 });

      req.flush({
        code: 200,
        message: 'OK',
        data: { maxAdvanceDays: 45, cutoffMinutes: 20 },
      });
    });
  });

  // OBRS-196: regression for the wrong-URL contract break a coordinator
  // reconciliation found post-merge (base path is `/api/private/settlements`,
  // NO `/admin/` segment — `EndpointConstant.PRIVATE_SETTLEMENTS`) — a
  // store-stub spec never exercises the real HttpClient call, so these hit
  // HttpTestingController directly, same precedent as the OBRS-85 block above.
  describe('getSettlementsPending', () => {
    it('issues a GET to /api/private/settlements/pending?from&to (no /admin/ segment)', () => {
      service.getSettlementsPending('2026-07-01', '2026-07-07').subscribe();

      const req = httpMock.expectOne(
        (request) =>
          request.url === `${environment.apiUrl}/api/private/settlements/pending` &&
          request.params.get('from') === '2026-07-01' &&
          request.params.get('to') === '2026-07-07'
      );
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: { range: { from: '', to: '', timezone: '' }, items: [] } });
    });
  });

  describe('getSettlementSchedule', () => {
    it('issues a GET to /api/private/settlements/schedules/{id} (no /admin/ segment)', () => {
      service.getSettlementSchedule(42).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/settlements/schedules/42`);
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  // OBRS-671: the confirm body is now REQUIRED — counted cash + hander (+ a
  // reason only when the count doesn't reconcile). The old optional
  // `acknowledgedTotalAmount` guard is retired.
  describe('confirmSettlement', () => {
    it('issues a POST to /api/private/settlements/schedules/{id}/confirm with the counted cash + hander body', () => {
      service
        .confirmSettlement(42, { countedCashAmount: '480.00', handedOverBy: 7 })
        .subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/settlements/schedules/42/confirm`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ countedCashAmount: '480.00', handedOverBy: 7 });

      req.flush({ code: 200, message: 'OK', data: null });
    });

    it('includes the discrepancyReason when the drawer does not reconcile', () => {
      service
        .confirmSettlement(42, {
          countedCashAmount: '460.00',
          handedOverBy: 7,
          discrepancyReason: 'ขาด 20',
        })
        .subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/settlements/schedules/42/confirm`
      );
      expect(req.request.body).toEqual({
        countedCashAmount: '460.00',
        handedOverBy: 7,
        discrepancyReason: 'ขาด 20',
      });

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  // OBRS-109 (#37): full promotion CRUD, distinct from the round-trip
  // singleton endpoints above.
  describe('getPromotions', () => {
    it('issues a GET to /api/private/admin/promotions', () => {
      service.getPromotions().subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/admin/promotions`);
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: [] });
    });
  });

  describe('getPromotionById', () => {
    it('issues a GET to /api/private/admin/promotions/{id}', () => {
      service.getPromotionById(7).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/admin/promotions/7`);
      expect(req.request.method).toBe('GET');

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  describe('createPromotion', () => {
    it('issues a POST to /api/private/admin/promotions with the full payload', () => {
      const payload = {
        slug: 'summer-sale',
        code: 'SUMMER10',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: false,
        translations: [{ locale: 'en', label: 'Summer Sale' }],
      };
      service.createPromotion(payload).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/admin/promotions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);

      req.flush({ code: 201, message: 'Created', data: null });
    });
  });

  describe('updatePromotion', () => {
    it('issues a PUT (full-replace) to /api/private/admin/promotions/{id}', () => {
      const payload = {
        slug: 'summer-sale',
        code: 'SUMMER10',
        discountType: 'percentage',
        discountValue: 15,
        status: 'active',
        autoApply: false,
        translations: [{ locale: 'en', label: 'Summer Sale' }],
      };
      service.updatePromotion(7, payload).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/admin/promotions/7`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(payload);

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  describe('deletePromotion', () => {
    it('issues a DELETE to /api/private/admin/promotions/{id}', () => {
      service.deletePromotion(7).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/admin/promotions/7`);
      expect(req.request.method).toBe('DELETE');

      req.flush({ code: 200, message: 'OK', data: null });
    });
  });

  // OBRS-283: soft-cancel endpoint used instead of deleteSchedule() when a
  // schedule row's `deletable` field is `false`.
  describe('cancelSchedule', () => {
    it('issues a POST to /api/private/schedules/{id}/cancel with an empty body and resolves the response shape', () => {
      let result: { scheduleId: number; status: string; affectedBookingCount: number } | undefined;
      service.cancelSchedule(42).subscribe((resp) => (result = resp.data));

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules/42/cancel`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});

      req.flush({
        code: 200,
        message: 'OK',
        data: { scheduleId: 42, status: 'cancelled', affectedBookingCount: 3 },
      });

      expect(result).toEqual({ scheduleId: 42, status: 'cancelled', affectedBookingCount: 3 });
    });
  });

  // OBRS-280: admin booking detail dialog. Same base path as
  // getBookingPayments (`/private/bookings/{id}`), NOT the list endpoint's
  // `/private/admin/bookings` — a store-stub spec never exercises the real
  // HttpClient call, so this hits HttpTestingController directly, same
  // precedent as the OBRS-85/OBRS-196 blocks above.
  describe('getBookingById', () => {
    it('issues a GET to /api/private/bookings/{id} and resolves the detail shape', () => {
      let result: unknown;
      service.getBookingById(42).subscribe((resp) => (result = resp.data));

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings/42`);
      expect(req.request.method).toBe('GET');

      const detail = {
        id: 42,
        bookingNumber: '#BK-42',
        bookingType: { code: 'online', label: 'Online' },
        status: { code: 'confirmed', label: 'Confirmed' },
        createdAt: '2026-07-01T10:00:00+07:00',
        expiredAt: null,
        actor: { id: 1, name: 'Jane Doe', type: 'CUSTOMER', channel: 'WEB', officeName: null },
        contact: { fullName: 'Jane Doe', phoneNumber: '0812345678' },
        journeys: [
          {
            legType: { code: 'outbound', label: 'Outbound' },
            fromStop: { code: 'bkk', label: 'Bangkok' },
            toStop: { code: 'cnx', label: 'Chiang Mai' },
            departureDateTime: '2026-07-02T08:00:00+07:00',
            arrivalDateTime: '2026-07-02T16:00:00+07:00',
            vehicle: null,
            tickets: [
              {
                id: 1,
                ticketNumber: 'TK-001',
                passengerType: { code: 'adult', label: 'Adult' },
                passengerName: 'Jane Doe',
                seatNumber: 'A1',
                status: { code: 'confirmed', label: 'Confirmed' },
              },
            ],
          },
        ],
        pricing: { basePrice: '500.00', discount: '0.00', fee: '0.00', netAmount: '500.00', currency: 'THB' },
        payment: {
          totalAmount: '500.00',
          paidAmount: '500.00',
          outstandingAmount: '0.00',
          refundedAmount: '0.00',
          currency: 'THB',
          status: 'PAID',
        },
      };

      req.flush({ code: 200, message: 'OK', data: detail });

      expect(result).toEqual(detail);
    });
  });
});
