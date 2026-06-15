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
});
