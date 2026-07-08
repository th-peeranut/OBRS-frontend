import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PromotionService } from './promotion.service';
import { environment } from '../../../environments/environment';

describe('PromotionService', () => {
  let service: PromotionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PromotionService],
    });
    service = TestBed.inject(PromotionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('validate', () => {
    it('issues a POST to /api/private/promotions/validate with { code, amount }', () => {
      service.validate('SAVE20', 1000).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/promotions/validate`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ code: 'SAVE20', amount: 1000 });

      req.flush({
        code: 200,
        message: 'OK',
        data: { code: 'SAVE20', discountAmount: 200, netAmount: 800 },
      });
    });

    it('resolves discountAmount/netAmount from the response envelope', () => {
      let result: { discountAmount: number; netAmount: number } | undefined;
      service.validate('SAVE20', 1000).subscribe((response) => {
        result = response.data;
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/promotions/validate`
      );
      req.flush({
        code: 200,
        message: 'OK',
        data: { code: 'SAVE20', discountAmount: 200, netAmount: 800 },
      });

      expect(result?.discountAmount).toBe(200);
      expect(result?.netAmount).toBe(800);
    });
  });
});
