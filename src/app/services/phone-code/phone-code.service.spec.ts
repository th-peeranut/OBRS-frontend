import { TestBed } from '@angular/core/testing';

import { PhoneCodeService } from './phone-code.service';

describe('PhoneCodeService', () => {
  let service: PhoneCodeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PhoneCodeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
