import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AdminDashboardStore, DashboardSnapshot } from './admin-dashboard.store';
import {
  AdminBookingDto,
  AdminVehicleDto,
} from '../../../../services/admin/admin-api.service';
import { PageResponse } from '../../../../shared/interfaces/payment.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function bookingsPage(bookings: AdminBookingDto[]): PageResponse<AdminBookingDto> {
  return {
    content: bookings,
    totalElements: bookings.length,
  } as PageResponse<AdminBookingDto>;
}

interface FakeApi {
  getBookings: jasmine.Spy<() => Observable<ResponseAPI<PageResponse<AdminBookingDto>>>>;
  getVehicles: jasmine.Spy<() => Observable<ResponseAPI<AdminVehicleDto[]>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): AdminDashboardStore {
  const full: FakeApi = {
    getBookings: jasmine.createSpy('getBookings').and.returnValue(of(ok(bookingsPage([])))),
    getVehicles: jasmine.createSpy('getVehicles').and.returnValue(of(ok([]))),
    ...api,
  };
  return new AdminDashboardStore(full as any, { authStatus$ } as any);
}

describe('AdminDashboardStore', () => {
  it('builds a snapshot from bookings and vehicles on first refresh', async () => {
    const store = makeStore({
      getBookings: jasmine
        .createSpy('getBookings')
        .and.returnValue(of(ok(bookingsPage([{ id: 1, status: 'pending' } as AdminBookingDto])))),
      getVehicles: jasmine
        .createSpy('getVehicles')
        .and.returnValue(of(ok([{ id: 1, status: 'active' } as AdminVehicleDto]))),
    });

    await store.refresh();

    expect(store.snapshot?.totalBookings).toBe(1);
    expect(store.snapshot?.pendingPayments).toBe(1);
    expect(store.snapshot?.activeVehicles).toBe(1);
    expect(store.snapshot?.partialFailure).toBeFalse();
  });

  // The fix: re-entering /admin/dashboard must render the cached snapshot
  // *synchronously* (no network wait). The root-scoped store survives the
  // component's destruction, and snapshot$ is a BehaviorSubject, so a fresh
  // subscriber (a recreated component) receives the cached value immediately.
  it('replays the cached snapshot to a new subscriber synchronously (no refetch wait)', async () => {
    const store = makeStore({
      getBookings: jasmine
        .createSpy('getBookings')
        .and.returnValue(of(ok(bookingsPage([{ id: 7 } as AdminBookingDto])))),
    });
    await store.refresh(); // first visit populates the cache

    const cached = store.snapshot;
    let receivedOnReentry: DashboardSnapshot | null | undefined;
    store.snapshot$.subscribe((snapshot) => (receivedOnReentry = snapshot)); // re-entry

    expect(receivedOnReentry).toBe(cached); // delivered before any await
    expect(receivedOnReentry).not.toBeNull();
  });

  it('reflects new data after a background revalidate (real-time on update)', async () => {
    let bookings: AdminBookingDto[] = [{ id: 1 } as AdminBookingDto];
    const store = makeStore({
      getBookings: jasmine
        .createSpy('getBookings')
        .and.callFake(() => of(ok(bookingsPage(bookings)))),
    });

    await store.refresh();
    expect(store.snapshot?.totalBookings).toBe(1);

    bookings = [{ id: 1 } as AdminBookingDto, { id: 2 } as AdminBookingDto];
    await store.refresh(); // background revalidate picks up the new row

    expect(store.snapshot?.totalBookings).toBe(2);
  });

  it('keeps the prior value and flags partialFailure when a source fails', async () => {
    let vehiclesObservable: Observable<ResponseAPI<AdminVehicleDto[]>> = of(
      ok([{ id: 1, status: 'active' } as AdminVehicleDto])
    );
    const store = makeStore({
      getVehicles: jasmine.createSpy('getVehicles').and.callFake(() => vehiclesObservable),
    });

    await store.refresh();
    expect(store.snapshot?.activeVehicles).toBe(1);
    expect(store.snapshot?.partialFailure).toBeFalse();

    vehiclesObservable = throwError(() => new Error('network'));
    await store.refresh();

    expect(store.snapshot?.activeVehicles).toBe(1); // stale value retained, not blanked
    expect(store.snapshot?.partialFailure).toBeTrue();
  });

  it('dedupes concurrent refreshes so rapid re-entry does not fan out fetches', async () => {
    const getBookings = jasmine
      .createSpy('getBookings')
      .and.returnValue(of(ok(bookingsPage([]))));
    const store = makeStore({ getBookings });

    const first = store.refresh();
    const second = store.refresh(); // arrives while the first is in flight
    await Promise.all([first, second]);

    expect(getBookings).toHaveBeenCalledTimes(1);
  });

  it('clears the cached snapshot on logout so the next session starts clean', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore(
      {
        getBookings: jasmine
          .createSpy('getBookings')
          .and.returnValue(of(ok(bookingsPage([{ id: 1 } as AdminBookingDto])))),
      },
      authStatus$
    );
    await store.refresh();
    expect(store.snapshot).not.toBeNull();

    authStatus$.next(false); // logout / token expiry

    expect(store.snapshot).toBeNull();
  });

  it('leaves the snapshot null when the very first load fails entirely', async () => {
    const store = makeStore({
      getBookings: jasmine
        .createSpy('getBookings')
        .and.returnValue(throwError(() => new Error('down'))),
      getVehicles: jasmine
        .createSpy('getVehicles')
        .and.returnValue(throwError(() => new Error('down'))),
    });

    await store.refresh();

    expect(store.snapshot).toBeNull(); // component keeps its loading state, no empty zeros
  });
});
