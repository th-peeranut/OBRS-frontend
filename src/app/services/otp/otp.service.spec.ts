import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OtpService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('uses the dev request endpoint in the local environment', async () => {
    const resultPromise = service.requestOTP({ msisdn: '0812345678' });
    const request = httpTesting.expectOne(
      'http://localhost:8000/api/external/otp/request/test'
    );

    expect(request.request.method).toBe('POST');
    request.flush({
      code: 200,
      message: 'OK',
      data: { refNo: 'REF-1', status: 'success', token: 'token-1' },
    });

    expect((await resultPromise).data?.token).toBe('token-1');
  });

  it('types the verify response independently from the request response', async () => {
    const resultPromise = service.verifyOTP({ token: 'token-1', pin: '123456' });
    const request = httpTesting.expectOne(
      'http://localhost:8000/api/external/otp/verify/test'
    );

    request.flush({
      code: 200,
      message: 'OK',
      data: { status: 'success', message: 'OTP verified' },
    });

    expect((await resultPromise).data?.message).toBe('OTP verified');
  });
});
