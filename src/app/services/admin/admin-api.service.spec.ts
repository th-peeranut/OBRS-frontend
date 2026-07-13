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

  describe('getNewUsabilityReportCount', () => {
    it('issues a GET with status=new&size=1&page=0 and resolves to data.totalElements', () => {
      let result: number | undefined;
      service.getNewUsabilityReportCount().subscribe((count) => (result = count));

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

  describe('confirmSettlement', () => {
    it('issues a POST to /api/private/settlements/schedules/{id}/confirm with the acknowledged amount', () => {
      service.confirmSettlement(42, '1950.00').subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/settlements/schedules/42/confirm`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ acknowledgedTotalAmount: '1950.00' });

      req.flush({ code: 200, message: 'OK', data: null });
    });

    it('posts an empty body when no acknowledged amount is given', () => {
      service.confirmSettlement(42).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/settlements/schedules/42/confirm`
      );
      expect(req.request.body).toEqual({});

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
});
