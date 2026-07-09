import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Register } from '../shared/interfaces/auth.interface';

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
      'http://localhost:8000/api/auth/signup'
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

    // Under the area model admin is confined to the admin portal — it is NOT a
    // superset of the staff portal the way the old linear hierarchy made it.
    it('does NOT grant an admin access to staff-only routes (admin is admin-only)', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(false);
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

    it('allows guests, customers and owners on public pages', () => {
      expect(service.canAccessCustomerArea()).toBe(true); // guest
      setRoles(['customer']);
      expect(service.canAccessCustomerArea()).toBe(true);
      setRoles(['owner']);
      expect(service.canAccessCustomerArea()).toBe(true);
    });

    it('bounces portal-confined admin and staff off public pages', () => {
      setRoles(['admin']);
      expect(service.canAccessCustomerArea()).toBe(false);
      setRoles(['salesperson']);
      expect(service.canAccessCustomerArea()).toBe(false);
      setRoles(['driver']);
      expect(service.canAccessCustomerArea()).toBe(false);
    });

    it('lets a user who is also a customer stay on public pages', () => {
      setRoles(['admin', 'customer']);
      expect(service.canAccessCustomerArea()).toBe(true);
    });
  });
});
