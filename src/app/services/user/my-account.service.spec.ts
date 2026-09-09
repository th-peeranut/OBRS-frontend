import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { MyAccountService } from './my-account.service';
import { environment } from '../../../environments/environment';
import { PRIVACY_POLICY_VERSION } from '../../modules/privacy-policy/privacy-policy.version';
import { MyAccountProfile } from '../../shared/interfaces/my-account.interface';

/**
 * OBRS-632. These assert the WIRE, not the component: the four endpoints below had either never
 * been called from this app (`PUT`/`DELETE /users/me`) or did not exist (`POST .../pdpa-consent`),
 * so getting the verb and path right is the whole risk.
 */
describe('MyAccountService', () => {
  const url = `${environment.apiUrl}/api/private/users/me`;
  let service: MyAccountService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MyAccountService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs the caller profile', () => {
    service.getProfile().subscribe();

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: {} });
  });

  it('PUTs a profile correction (PDPA ม.35-36)', () => {
    service
      .updateProfile({
        title: 'นาย',
        firstName: 'สมชาย',
        middleName: null,
        lastName: 'ใจดี',
        phoneNumber: '0811111111',
        preferredLocale: 'th',
      })
      .subscribe();

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.firstName).toBe('สมชาย');
    req.flush({ code: 200, message: 'OK' });
  });

  it('POSTs re-consent with the version THIS build serves, not a caller-supplied one', () => {
    service.acceptCurrentPrivacyPolicy().subscribe();

    const req = httpMock.expectOne(`${url}/pdpa-consent`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      pdpaConsent: true,
      pdpaConsentVersion: PRIVACY_POLICY_VERSION,
    });
    req.flush({ code: 200, message: 'OK' });
  });

  it('DELETEs the account (PDPA ม.33)', () => {
    service.closeAccount().subscribe();

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('DELETE');
    req.flush({ code: 200, message: 'OK' });
  });

  describe('needsReConsent', () => {
    function profile(version: string | null): MyAccountProfile {
      return {
        id: 1,
        title: null,
        firstName: null,
        middleName: null,
        lastName: null,
        nickname: null,
        email: 'u@example.com',
        phoneNumber: null,
        preferredLocale: 'th',
        pdpaConsentVersion: version,
      };
    }

    it('is false for the version this build serves', () => {
      expect(service.needsReConsent(profile(PRIVACY_POLICY_VERSION))).toBe(false);
    });

    it('is true for an older version', () => {
      expect(service.needsReConsent(profile('0.9'))).toBe(true);
    });

    it('is true when no version was ever recorded (pre-OBRS-628 accounts)', () => {
      expect(service.needsReConsent(profile(null))).toBe(true);
    });

    it('is false with no profile at all — an unloaded page must not nag', () => {
      expect(service.needsReConsent(null)).toBe(false);
    });
  });
});
