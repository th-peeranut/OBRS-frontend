import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BankService } from './bank.service';
import { environment } from '../../../environments/environment';

describe('BankService (OBRS-1463)', () => {
  const URL = `${environment.apiUrl}/api/private/banks`;
  let service: BankService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BankService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BankService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests the list once however many screens ask for it', () => {
    service.getBanks().subscribe();
    service.getBanks().subscribe();

    httpMock.expectOne(URL).flush({ code: 200, message: 'OK', data: [] });
  });

  it('resetCache lets a retry re-request — shareReplay would replay the failure forever otherwise', () => {
    let failed = false;
    service.getBanks().subscribe({ error: () => (failed = true) });
    httpMock.expectOne(URL).error(new ProgressEvent('offline'));
    expect(failed).toBeTrue();

    service.resetCache();
    let banks: unknown[] = [];
    service.getBanks().subscribe((list) => (banks = list));
    httpMock.expectOne(URL).flush({
      code: 200,
      message: 'OK',
      data: [{ code: '004', nameTh: 'ธนาคารกสิกรไทย', nameEn: 'Kasikornbank', nameZh: '开泰银行' }],
    });

    expect(banks.length).toBe(1);
  });
});
