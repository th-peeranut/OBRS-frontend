import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferenceRow } from '../../shared/interfaces/notification-preference.interface';
import { environment } from '../../../environments/environment';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let httpTesting: HttpTestingController;

  const row: NotificationPreferenceRow = {
    type: 'PAYMENT_CONFIRMED',
    critical: true,
    emailSupported: true,
    smsSupported: true,
    emailEnabled: true,
    smsEnabled: false,
  };
  const endpointUrl = `${environment.apiUrl}/api/private/users/me/notification-preferences`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationPreferencesService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs the notification-preferences endpoint under environment.apiUrl', () => {
    let received: NotificationPreferenceRow[] | undefined;
    service.getPreferences().subscribe((res) => {
      received = res.data?.preferences;
    });

    const request = httpTesting.expectOne(endpointUrl);
    expect(request.request.method).toBe('GET');

    request.flush({ code: 200, message: 'OK', data: { preferences: [row] } });

    expect(received).toEqual([row]);
  });

  it('PUTs the editable channel flags (type/emailEnabled/smsEnabled only) to the same endpoint', () => {
    let received: NotificationPreferenceRow[] | undefined;
    service
      .updatePreferences([{ type: 'PAYMENT_CONFIRMED', emailEnabled: true, smsEnabled: false }])
      .subscribe((res) => {
        received = res.data?.preferences;
      });

    const request = httpTesting.expectOne(endpointUrl);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      preferences: [{ type: 'PAYMENT_CONFIRMED', emailEnabled: true, smsEnabled: false }],
    });

    request.flush({ code: 200, message: 'OK', data: { preferences: [row] } });

    expect(received).toEqual([row]);
  });
});
