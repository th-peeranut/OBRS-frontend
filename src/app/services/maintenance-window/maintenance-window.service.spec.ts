import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  MaintenanceNoticeVm,
  MaintenanceWindow,
  MaintenanceWindowService,
} from './maintenance-window.service';

/**
 * OBRS-1902 AC-6 — the announcement and the payment lock have to keep working when the backend
 * does not, because the outage they describe is the backend not answering. A spec that only
 * proved the happy path would leave the one case this feature exists for untested.
 */
describe('MaintenanceWindowService', () => {
  const URL = `${environment.apiUrl}/api/operations-policy`;
  const FIVE_MINUTES = 5 * 60_000;

  let service: MaintenanceWindowService;
  let httpMock: HttpTestingController;

  /** A window that starts in `startsInMinutes` and locks payment `lockLead` minutes before that. */
  function windowStartingIn(startsInMinutes: number, lockLead: number): MaintenanceWindow {
    const startAt = new Date(Date.now() + startsInMinutes * 60_000);
    return {
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 30 * 60_000).toISOString(),
      paymentLockMinutesBefore: lockLead,
      paymentLockedFrom: new Date(startAt.getTime() - lockLead * 60_000).toISOString(),
      messageTh: 'ปิดปรับปรุงระบบชั่วคราว',
      messageEn: 'Scheduled maintenance',
    };
  }

  function flushWindow(window: MaintenanceWindow | null): void {
    httpMock.expectOne(URL).flush(
      { code: 200, message: 'OK', data: window ? { maintenanceWindow: window } : {} },
      { headers: { Date: new Date().toUTCString() } }
    );
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MaintenanceWindowService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('serves the announcement and arms the payment lock once the countdown reaches it', fakeAsync(() => {
    // Starts in 5 minutes, payment locks 10 minutes before the start - i.e. already locked.
    service.start();
    tick(0);
    flushWindow(windowStartingIn(5, 10));

    let vm: MaintenanceNoticeVm | null = null;
    const sub = service.notice$.subscribe((value) => (vm = value));
    tick(0);

    expect(vm!.started).toBeFalse();
    expect(vm!.minutesUntilStart).toBe(5);
    expect(service.isPaymentLockedNow()).toBeTrue();

    sub.unsubscribe();
    discardPeriodicTasks();
  }));

  it('leaves the pay button alone while the lock lead has not been reached yet', fakeAsync(() => {
    service.start();
    tick(0);
    // Starts in an hour, locks 10 minutes before: nothing should be gated yet.
    flushWindow(windowStartingIn(60, 10));

    expect(service.isPaymentLockedNow()).toBeFalse();

    discardPeriodicTasks();
  }));

  it('AC-6: keeps announcing and keeps the lock armed when the backend stops answering', fakeAsync(() => {
    service.start();
    tick(0);
    flushWindow(windowStartingIn(5, 10));
    expect(service.isPaymentLockedNow()).toBeTrue();

    // The deploy has begun; the next scheduled read fails the way a dead backend fails.
    tick(FIVE_MINUTES);
    httpMock.expectOne(URL).flush('down', { status: 503, statusText: 'Service Unavailable' });

    let vm: MaintenanceNoticeVm | null = null;
    const sub = service.notice$.subscribe((value) => (vm = value));
    tick(0);

    expect(vm)
      .withContext('the banner must survive the outage it is warning about')
      .not.toBeNull();
    expect(service.isPaymentLockedNow())
      .withContext('the pay button must stay disabled while the site is down')
      .toBeTrue();

    sub.unsubscribe();
    discardPeriodicTasks();
  }));

  it('AC-6: a fresh page load during the outage still shows the cached announcement, with no successful read at all', fakeAsync(() => {
    service.start();
    tick(0);
    flushWindow(windowStartingIn(5, 10));
    discardPeriodicTasks();

    // A brand-new service, as a reload mid-outage would build: cache is all it has.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const reloaded = TestBed.inject(MaintenanceWindowService);
    const reloadedHttp = TestBed.inject(HttpTestingController);

    reloaded.start();
    tick(0);
    reloadedHttp.expectOne(URL).flush('down', { status: 503, statusText: 'Service Unavailable' });

    expect(reloaded.isPaymentLockedNow()).toBeTrue();

    discardPeriodicTasks();
  }));

  it('stops announcing once the window has ended, without anyone clearing the row', fakeAsync(() => {
    service.start();
    tick(0);
    // Started 90 minutes ago and runs 30 minutes: over.
    flushWindow(windowStartingIn(-90, 10));

    let vm: MaintenanceNoticeVm | null = null;
    const sub = service.notice$.subscribe((value) => (vm = value));
    tick(0);

    expect(vm).toBeNull();
    expect(service.isPaymentLockedNow()).toBeFalse();

    sub.unsubscribe();
    discardPeriodicTasks();
  }));

  it('clears a cached announcement as soon as one successful read says there is none', fakeAsync(() => {
    service.start();
    tick(0);
    flushWindow(windowStartingIn(5, 10));
    expect(service.isPaymentLockedNow()).toBeTrue();

    // The owner called the deploy off - DELETE on the admin side, no window here.
    tick(FIVE_MINUTES);
    flushWindow(null);

    expect(service.isPaymentLockedNow()).toBeFalse();
    expect(localStorage.getItem('obrs.maintenanceWindow')).toBeNull();

    discardPeriodicTasks();
  }));

  it('gates on the server clock, not the device clock, when the two disagree', fakeAsync(() => {
    service.start();
    tick(0);

    // The device is an hour behind. Against its own clock the lock (10 minutes before a start
    // 5 minutes from server-now) is still 55 minutes away; against the server's it is open.
    const serverNow = new Date(Date.now() + 60 * 60_000);
    const startAt = new Date(serverNow.getTime() + 5 * 60_000);
    const window: MaintenanceWindow = {
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 30 * 60_000).toISOString(),
      paymentLockMinutesBefore: 10,
      paymentLockedFrom: new Date(startAt.getTime() - 10 * 60_000).toISOString(),
      messageTh: 'ปิดปรับปรุงระบบชั่วคราว',
      messageEn: 'Scheduled maintenance',
    };
    httpMock
      .expectOne(URL)
      .flush(
        { code: 200, message: 'OK', data: { maintenanceWindow: window } },
        { headers: { Date: serverNow.toUTCString() } }
      );

    expect(service.isPaymentLockedNow())
      .withContext('a device clock an hour behind must not delay the lock by an hour')
      .toBeTrue();

    discardPeriodicTasks();
  }));
});
