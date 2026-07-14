import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { BookingsPageComponent } from './bookings-page.component';
import { BookingRow, BookingsData } from './bookings.store';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminBookingDetailDto } from '../../../../services/admin/admin-api.service';

function makeRows(count: number): BookingRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    bookingId: `#BK-${i + 1}`,
    customer: `Customer ${i + 1}`,
    route: 'A -> B',
    bookingDate: 'Jun 19, 2026, 10:00',
    departureTime: 'Jun 19, 2026, 08:00',
    totalFare: 'THB 100.00',
    bookingStatus: 'CONFIRMED',
    paymentStatus: 'PAID',
  }));
}

function makeData(count: number): BookingsData {
  return { rows: makeRows(count), statusOptions: [{ code: 'CONFIRMED', label: 'CONFIRMED' }] };
}

function makeStoreStub(data: BookingsData | null) {
  const data$ = new BehaviorSubject<BookingsData | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeAdminApiServiceStub() {
  return {
    getBookingById: jasmine.createSpy('getBookingById'),
    getBookingPayments: jasmine.createSpy('getBookingPayments'),
  };
}

describe('BookingsPageComponent', () => {
  it('renders cached bookings immediately on re-entry', () => {
    const store = makeStoreStub(makeData(3));
    const component = new BookingsPageComponent(
      createTranslateStub(),
      store as any,
      makeAdminApiServiceStub() as any
    );

    component.ngOnInit();

    expect((component as any).isLoading).toBeFalse();
    expect((component as any).allBookings.length).toBe(3);
  });

  // Fix: a background revalidate must not bounce the user off their current page.
  it('preserves the current page across a background revalidate when still valid', () => {
    const store = makeStoreStub(makeData(25)); // 3 pages at pageSize 10
    const component = new BookingsPageComponent(
      createTranslateStub(),
      store as any,
      makeAdminApiServiceStub() as any
    );
    component.ngOnInit();

    (component as any).goToPage(3);
    expect((component as any).currentPage).toBe(3);

    store.data$.next(makeData(25)); // background revalidate, same size

    expect((component as any).currentPage).toBe(3);
  });

  it('clamps the current page when a revalidate returns fewer rows', () => {
    const store = makeStoreStub(makeData(25));
    const component = new BookingsPageComponent(
      createTranslateStub(),
      store as any,
      makeAdminApiServiceStub() as any
    );
    component.ngOnInit();
    (component as any).goToPage(3);

    store.data$.next(makeData(5)); // now only 1 page

    expect((component as any).currentPage).toBe(1);
  });

  describe('detail modal (OBRS-280)', () => {
    const row: BookingRow = {
      id: 42,
      bookingId: '#BK-42',
      customer: 'Jane Doe',
      route: 'A -> B',
      bookingDate: '2026-07-01T10:00:00Z',
      departureTime: '2026-07-02T08:00:00Z',
      totalFare: 'THB 500.00',
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    };

    const detail: AdminBookingDetailDto = {
      id: 42,
      bookingNumber: '#BK-42',
      status: { code: 'confirmed', label: 'Confirmed' },
      createdAt: '2026-07-01T10:00:00Z',
      journeys: [],
    };

    function setup() {
      const store = makeStoreStub(makeData(0));
      const adminApiService = makeAdminApiServiceStub();
      const component = new BookingsPageComponent(
        createTranslateStub(),
        store as any,
        adminApiService as any
      );
      return { component, adminApiService };
    }

    it('openDetail() opens the dialog optimistically (seeded from the row) and calls both getBookingById and getBookingPayments', () => {
      const { component, adminApiService } = setup();
      adminApiService.getBookingById.and.returnValue(
        of({ code: 200, message: 'OK', data: detail })
      );
      adminApiService.getBookingPayments.and.returnValue(
        of({ code: 200, message: 'OK', data: { bookingId: 42, transactions: [] } })
      );

      (component as any).openDetail(row);

      expect((component as any).selectedBookingId).toBe(42);
      expect(adminApiService.getBookingById).toHaveBeenCalledWith(42);
      expect(adminApiService.getBookingPayments).toHaveBeenCalledWith(42);
      expect((component as any).isDetailFetching).toBeFalse();
      expect((component as any).isPaymentsFetching).toBeFalse();
      expect((component as any).detailBooking).toEqual(detail);
    });

    it('onRowActivate() opens the dialog for a plain row click, ignoring clicks on interactive controls', () => {
      const { component, adminApiService } = setup();
      adminApiService.getBookingById.and.returnValue(of({ code: 200, message: 'OK', data: detail }));
      adminApiService.getBookingPayments.and.returnValue(
        of({ code: 200, message: 'OK', data: { bookingId: 42, transactions: [] } })
      );

      const cellTarget = document.createElement('td');
      (component as any).onRowActivate(row, { target: cellTarget } as unknown as MouseEvent);
      expect((component as any).selectedBookingId).toBe(42);

      (component as any).closeDetail();

      const buttonTarget = document.createElement('button');
      cellTarget.appendChild(buttonTarget);
      (component as any).onRowActivate(row, { target: buttonTarget } as unknown as MouseEvent);
      expect((component as any).selectedBookingId).toBeNull();
    });

    it('drops a stale getBookingById response when the admin switches rows mid-fetch', () => {
      const { component, adminApiService } = setup();
      const firstDetail$ = new Subject<any>();
      const secondDetail$ = new Subject<any>();
      adminApiService.getBookingById.and.returnValues(firstDetail$.asObservable(), secondDetail$.asObservable());
      adminApiService.getBookingPayments.and.returnValue(
        of({ code: 200, message: 'OK', data: { bookingId: 1, transactions: [] } })
      );

      (component as any).openDetail({ ...row, id: 1 });
      (component as any).openDetail({ ...row, id: 2 });
      expect((component as any).selectedBookingId).toBe(2);

      // The FIRST request's response arrives late, after the admin already
      // switched to row 2 — it must be dropped, not clobber the newer state.
      firstDetail$.next({ code: 200, message: 'OK', data: { ...detail, id: 1, bookingNumber: '#BK-1' } });
      expect((component as any).detailBooking?.bookingNumber).not.toBe('#BK-1');
      expect((component as any).selectedBookingId).toBe(2);

      // The current (second) request's response arrives — it must be applied.
      secondDetail$.next({ code: 200, message: 'OK', data: { ...detail, id: 2, bookingNumber: '#BK-2' } });
      expect((component as any).detailBooking?.bookingNumber).toBe('#BK-2');
    });

    it('shows an inline error when getBookingById fails, without calling AlertService', () => {
      const { component, adminApiService } = setup();
      adminApiService.getBookingById.and.returnValue(throwError(() => new Error('boom')));
      adminApiService.getBookingPayments.and.returnValue(
        of({ code: 200, message: 'OK', data: { bookingId: 42, transactions: [] } })
      );

      (component as any).openDetail(row);

      expect((component as any).isDetailFetching).toBeFalse();
      expect((component as any).detailLoadError).toBeTruthy();
    });

    it('shows an inline payments error when getBookingPayments fails', () => {
      const { component, adminApiService } = setup();
      adminApiService.getBookingById.and.returnValue(of({ code: 200, message: 'OK', data: detail }));
      adminApiService.getBookingPayments.and.returnValue(throwError(() => new Error('boom')));

      (component as any).openDetail(row);

      expect((component as any).isPaymentsFetching).toBeFalse();
      expect((component as any).paymentsLoadError).toBeTruthy();
    });

    it('closeDetail() resets all detail-modal state', () => {
      const { component, adminApiService } = setup();
      adminApiService.getBookingById.and.returnValue(of({ code: 200, message: 'OK', data: detail }));
      adminApiService.getBookingPayments.and.returnValue(
        of({ code: 200, message: 'OK', data: { bookingId: 42, transactions: [] } })
      );

      (component as any).openDetail(row);
      (component as any).closeDetail();

      expect((component as any).selectedBookingId).toBeNull();
      expect((component as any).detailBooking).toBeNull();
      expect((component as any).paymentTransactions).toBeNull();
      expect((component as any).isDetailFetching).toBeFalse();
      expect((component as any).isPaymentsFetching).toBeFalse();
      expect((component as any).detailLoadError).toBe('');
      expect((component as any).paymentsLoadError).toBe('');
    });
  });
});
