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
});
