import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { PhoneCodeService } from './phone-code.service';

describe('PhoneCodeService', () => {
  let service: PhoneCodeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PhoneCodeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
