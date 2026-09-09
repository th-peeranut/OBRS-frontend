import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthService } from './auth.service';
import {
  PREVIEW_READONLY_MESSAGE,
  previewReadonlyInterceptor,
} from './preview-readonly.interceptor';
import { APP_LANGUAGE_KEY } from '../shared/services/language.service';

/**
 * OBRS-1721 — AC-5. The preview is read-only, and the enforcement is here rather
 * than on the buttons: the backend hierarchy means the REAL role passes every
 * previewed role's @PreAuthorize, so nothing server-side would refuse a stray
 * write, and a disabled button is one missed button away from no gate at all.
 */
describe('previewReadonlyInterceptor (OBRS-1721)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  const API = 'https://api.test/api/private/bookings';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        provideHttpClient(withInterceptors([previewReadonlyInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    spyOn(auth, 'getHeldRoles').and.returnValue(['owner']);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lets a POST through when NOT previewing', () => {
    let ok = false;
    http.post(API, {}).subscribe(() => (ok = true));

    httpMock.expectOne(API).flush({});
    expect(ok).toBeTrue();
  });

  it('blocks a POST while previewing — the request never reaches the transport', () => {
    auth.startRolePreview('salesperson');

    let status = 0;
    http.post(API, {}).subscribe({
      error: (err: HttpErrorResponse) => (status = err.status),
    });

    // The strong half of this assertion: httpMock.verify() in afterEach fails if
    // the call was merely errored AFTER being sent.
    httpMock.expectNone(API);
    expect(status).toBe(403);
  });

  it('blocks every mutating method, and no GET', () => {
    auth.startRolePreview('salesperson');
    const blocked: string[] = [];

    http.put(API, {}).subscribe({ error: () => blocked.push('PUT') });
    http.patch(API, {}).subscribe({ error: () => blocked.push('PATCH') });
    http.delete(API).subscribe({ error: () => blocked.push('DELETE') });
    expect(blocked).toEqual(['PUT', 'PATCH', 'DELETE']);

    let read: unknown = null;
    http.get(API).subscribe((body) => (read = body));
    httpMock.expectOne(API).flush({ ok: true });
    expect(read).toEqual({ ok: true });
  });

  it('never blocks refresh or logout — session upkeep must still work mid-preview', () => {
    auth.startRolePreview('driver');

    let ok = false;
    http.post('https://api.test/api/auth/refresh', {}).subscribe(() => (ok = true));

    httpMock.expectOne('https://api.test/api/auth/refresh').flush({});
    expect(ok).toBeTrue();
  });

  it('still blocks a credential write under /api/auth/ — refresh/logout are the only exemption', () => {
    auth.startRolePreview('driver');

    let status = 0;
    http
      .post('https://api.test/api/auth/password-reset/confirm', {})
      .subscribe({ error: (err: HttpErrorResponse) => (status = err.status) });

    httpMock.expectNone('https://api.test/api/auth/password-reset/confirm');
    expect(status).toBe(403);
  });

  it('answers in the stored language, and falls back for a junk one', () => {
    auth.startRolePreview('driver');

    localStorage.setItem(APP_LANGUAGE_KEY, 'zh');
    let message = '';
    http.post(API, {}).subscribe({
      error: (err: HttpErrorResponse) => (message = err.error.message),
    });
    expect(message).toBe(PREVIEW_READONLY_MESSAGE['zh']);

    // OBRS-601: the stored value is user-editable, and a bare lookup of
    // 'constructor' resolves to the Object function rather than missing.
    localStorage.setItem(APP_LANGUAGE_KEY, 'constructor');
    http.post(API, {}).subscribe({
      error: (err: HttpErrorResponse) => (message = err.error.message),
    });
    expect(message).toBe(PREVIEW_READONLY_MESSAGE['th']);

    localStorage.removeItem(APP_LANGUAGE_KEY);
  });

  it('stops blocking once the preview is exited', () => {
    auth.startRolePreview('salesperson');
    auth.exitRolePreview();

    let ok = false;
    http.post(API, {}).subscribe(() => (ok = true));

    httpMock.expectOne(API).flush({});
    expect(ok).toBeTrue();
  });
});
