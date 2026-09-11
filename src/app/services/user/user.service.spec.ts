import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { UserService } from './user.service';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { environment } from '../../../environments/environment';

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // 2026-09-11 review: the backend rate-limits these hints (429); a refused hint must
  // not pop the global error modal or block the page behind the loading overlay.
  it('checkExistEmail opts out of the global error and loading interceptors', () => {
    service.checkExistEmail('a@b.co').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/api/users/check-duplicate/email/a@b.co`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    req.flush({ timestamp: '', code: 200, message: 'OK', data: false });
  });

  it('checkExistPhoneNumber opts out of the global error and loading interceptors', () => {
    service.checkExistPhoneNumber('0812345678').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/api/users/check-duplicate/phoneNumber/0812345678`);
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    req.flush({ timestamp: '', code: 200, message: 'OK', data: false });
  });
});
