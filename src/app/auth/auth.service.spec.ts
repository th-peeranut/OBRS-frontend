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

  describe('hasAnyRole', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    it('grants an admin access to staff-only routes (admin is a role superset)', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('still matches a non-admin user on their own role', () => {
      setRoles(['salesperson']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('still denies a user who holds none of the required roles', () => {
      setRoles(['customer']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(false);
    });

    // Regression for OBRS-frontend #67: owner (above salesperson in the backend
    // hierarchy admin > owner > salesperson > driver > customer) was locked out
    // of the staff portal because the frontend only mirrored the admin tier.
    it('grants an owner access to salesperson/driver routes (owner outranks both)', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(['salesperson'])).toBe(true);
      expect(service.hasAnyRole(['driver'])).toBe(true);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('does NOT let an owner reach admin-only routes (admin outranks owner)', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(['admin'])).toBe(false);
    });

    it('lets a salesperson satisfy driver routes but a driver cannot satisfy salesperson routes', () => {
      setRoles(['salesperson']);
      expect(service.hasAnyRole(['driver'])).toBe(true);

      setRoles(['driver']);
      expect(service.hasAnyRole(['salesperson'])).toBe(false);
    });
  });
});
