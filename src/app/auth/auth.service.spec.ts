import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Register } from '../shared/interfaces/auth.interface';
import { environment } from '../../environments/environment';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../shared/interceptors/http-context-tokens';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
            navigateByUrl: jasmine.createSpy('navigateByUrl'),
          },
        },
      ],
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('sends only fields accepted by the backend signup DTO', async () => {
    const register: Register = {
      title: 'Mr.',
      firstName: 'Test',
      middleName: '',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '0812345678',
      password: 'Password1',
      preferredLocale: 'th',
      pdpaConsent: true,
      username: 'legacy-user',
      isPhoneNumberVerify: true,
      roles: ['admin'],
    };

    const resultPromise = service.register(register);
    const request = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/signup`
    );

    expect(request.request.body).toEqual({
      title: 'Mr.',
      firstName: 'Test',
      middleName: '',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '0812345678',
      password: 'Password1',
      preferredLocale: 'th',
      pdpaConsent: true,
    });

    request.flush({ code: 201, message: 'Created' });
    expect((await resultPromise).code).toBe(201);
  });

  describe('hasAnyRole (area-based access model)', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    // OBRS-176: admin is now a cross-portal superset mirroring the backend
    // admin > owner hierarchy — it grants staff, customer, and owner access,
    // reversing the FE's earlier (undocumented) confinement of admin.
    it('grants an admin access to staff-only routes (admin is a cross-portal superset)', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('grants an admin access to owner and customer routes too', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(['salesperson'])).toBe(true);
      expect(service.hasAnyRole(['driver'])).toBe(true);
      expect(service.hasAnyRole(['customer'])).toBe(true);
      expect(service.hasAnyRole(['owner'])).toBe(true);
    });

    // Control: a customer must NOT gain admin/staff access (the widening is
    // specific to admin/owner, not a general loosening of hasAnyRole).
    it('does not grant a customer access to admin or staff routes', () => {
      setRoles(['customer']);
      expect(service.hasAnyRole(['admin'])).toBe(false);
      expect(service.hasAnyRole(['salesperson'])).toBe(false);
    });

    it('still matches a staff user on their own role', () => {
      setRoles(['salesperson']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('still denies a user who holds none of the required roles', () => {
      setRoles(['customer']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(false);
    });

    it('grants an owner access to salesperson/driver routes (owner is all-access)', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(['salesperson'])).toBe(true);
      expect(service.hasAnyRole(['driver'])).toBe(true);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    // Owner is the all-access superset in the area model, so it reaches the
    // admin portal too (the reverse of the old admin > owner hierarchy).
    it('lets an owner reach admin-only routes (owner is the all-access superset)', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(['admin'])).toBe(true);
    });

    it('lets a salesperson satisfy driver routes but a driver cannot satisfy salesperson routes', () => {
      setRoles(['salesperson']);
      expect(service.hasAnyRole(['driver'])).toBe(true);

      setRoles(['driver']);
      expect(service.hasAnyRole(['salesperson'])).toBe(false);
    });
  });

  describe('getHomeRoute', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    it('sends admins to /admin', () => {
      setRoles(['admin']);
      expect(service.getHomeRoute()).toBe('/admin');
    });

    it('sends staff (salesperson/driver) to /staff', () => {
      setRoles(['salesperson']);
      expect(service.getHomeRoute()).toBe('/staff');
      setRoles(['driver']);
      expect(service.getHomeRoute()).toBe('/staff');
    });

    it('sends owner and customer to the public home', () => {
      setRoles(['owner']);
      expect(service.getHomeRoute()).toBe('/');
      setRoles(['customer']);
      expect(service.getHomeRoute()).toBe('/');
    });

    it('falls back to the public home for guests / unknown roles', () => {
      expect(service.getHomeRoute()).toBe('/');
    });
  });

  describe('canAccessCustomerArea', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    it('allows guests, customers, owners and admins on public pages', () => {
      expect(service.canAccessCustomerArea()).toBe(true); // guest
      setRoles(['customer']);
      expect(service.canAccessCustomerArea()).toBe(true);
      setRoles(['owner']);
      expect(service.canAccessCustomerArea()).toBe(true);
      // OBRS-176: admin is no longer confined to the admin portal.
      setRoles(['admin']);
      expect(service.canAccessCustomerArea()).toBe(true);
    });

    it('bounces portal-confined staff (salesperson/driver) off public pages', () => {
      setRoles(['salesperson']);
      expect(service.canAccessCustomerArea()).toBe(false);
      setRoles(['driver']);
      expect(service.canAccessCustomerArea()).toBe(false);
    });

    it('lets a user who is also a customer stay on public pages', () => {
      setRoles(['salesperson', 'customer']);
      expect(service.canAccessCustomerArea()).toBe(true);
    });
  });

  // OBRS-84: verified self-service login-email change — the three new
  // methods and their HttpContext tokens (OBRS-187 lesson: a wrong-password
  // response on the initiate call must not force-logout).
  describe('requestEmailChange', () => {
    it('POSTs to /api/private/users/me/email/change-request with the payload', () => {
      service.requestEmailChange({
        currentPassword: 'oldpass1',
        newEmail: 'new@example.com',
      });

      const req = httpTesting.expectOne(
        `${environment.apiUrl}/api/private/users/me/email/change-request`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        currentPassword: 'oldpass1',
        newEmail: 'new@example.com',
      });
      req.flush({ code: 200, message: 'OK' });
    });

    it('sets BOTH SKIP_AUTH_LOGOUT and SKIP_GLOBAL_ERROR_ALERT — a wrong-password response must not force-logout and must render inline, not as a global toast', () => {
      service.requestEmailChange({ currentPassword: 'wrong', newEmail: 'new@example.com' });

      const req = httpTesting.expectOne(
        `${environment.apiUrl}/api/private/users/me/email/change-request`
      );
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
      req.flush(
        { errorCode: 'AUTH_ERROR_INVALID_CREDENTIALS' },
        { status: 400, statusText: 'Bad Request' }
      );
    });
  });

  describe('confirmEmailChange', () => {
    it('POSTs to the public /api/auth/change-email/confirm endpoint with { token }', () => {
      service.confirmEmailChange({ token: 'abc123' });

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/change-email/confirm`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ token: 'abc123' });
      req.flush({ code: 200, message: 'OK', data: { newEmail: 'new@example.com' } });
    });
  });

  describe('resendEmailChangeVerification', () => {
    it('POSTs to /api/auth/change-email/resend with an empty body', () => {
      service.resendEmailChangeVerification();

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/change-email/resend`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ code: 200, message: 'OK' });
    });

    it('does not set SKIP_AUTH_LOGOUT — a real 401 here means a dead session, force-logout is correct', () => {
      service.resendEmailChangeVerification();

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/change-email/resend`);
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeFalse();
      req.flush(
        { errorCode: 'AUTH_ERROR_RATE_LIMIT_EXCEEDED' },
        { status: 429, statusText: 'Too Many Requests' }
      );
    });
  });
});
