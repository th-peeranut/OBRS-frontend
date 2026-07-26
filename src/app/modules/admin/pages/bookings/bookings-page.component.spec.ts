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
  // OBRS-727: mirrors the real AdminCollectionStore — the status of the last
  // failure, readable synchronously from inside an error$ handler. Set this
  // BEFORE pushing error$, exactly as the base class does.
  const errorStatus$ = new BehaviorSubject<number | null>(null);
  return {
    data$,
    refreshing$,
    error$,
    errorStatus$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
    get errorStatus() {
      return errorStatus$.value;
    },
    /** Fail with `status`, in the base class's order (status, then flag). */
    failWith(status: number | null) {
      errorStatus$.next(status);
      error$.next(true);
    },
  };
}

function makeAdminApiServiceStub() {
  return {
    getBookingById: jasmine.createSpy('getBookingById'),
    getBookingPayments: jasmine.createSpy('getBookingPayments'),
    adminOverrideCancelBooking: jasmine.createSpy('adminOverrideCancelBooking'),
  };
}

// OBRS-690: default to owner so canOverrideCancel is true; pass false to
// simulate a salesperson (button hidden).
function makeAuthStub(hasRole = true) {
  return { hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(hasRole) };
}

describe('BookingsPageComponent', () => {
  it('renders cached bookings immediately on re-entry', () => {
    const store = makeStoreStub(makeData(3));
    const component = new BookingsPageComponent(
      createTranslateStub(),
      store as any,
      makeAdminApiServiceStub() as any,
      makeAuthStub() as any
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
      makeAdminApiServiceStub() as any,
      makeAuthStub() as any
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
      makeAdminApiServiceStub() as any,
      makeAuthStub() as any
    );
    component.ngOnInit();
    (component as any).goToPage(3);

    store.data$.next(makeData(5)); // now only 1 page

    expect((component as any).currentPage).toBe(1);
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
  // cached bookings/status options, not leave a previous session's rows on
  // screen — same shape as the already-fixed
  // usability-reports-page.component.ts (OBRS-467).
  it('clears bookings and status options when the store emits null (OBRS-506)', () => {
    const store = makeStoreStub(makeData(3));
    const component = new BookingsPageComponent(
      createTranslateStub(),
      store as any,
      makeAdminApiServiceStub() as any,
      makeAuthStub() as any
    );
    component.ngOnInit();
    expect((component as any).allBookings.length).toBe(3);
    expect((component as any).statusOptions.length).toBe(1);

    store.data$.next(null);

    expect((component as any).allBookings)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
    expect((component as any).statusOptions).toEqual([]);
  });

  // OBRS-727: an owner reaching /admin/bookings got a 403 from the list
  // endpoint and this page showed the generic "Unable to load booking data"
  // text over an empty grid — so the reader concluded the system had no
  // bookings, not that the page was not theirs. The endpoint now admits OWNER
  // (AdminBookingListSecurityTest pins that), and these pin the FE half: a
  // denial must never again be reported as a load failure or as no data.
  // OBRS-728 will scope this list per fleet, which is when 403 becomes
  // reachable again for an out-of-scope caller.
  describe('permission denial vs load failure (OBRS-727)', () => {
    function componentWith(store: ReturnType<typeof makeStoreStub>) {
      const component = new BookingsPageComponent(
        createTranslateStub(),
        store as any,
        makeAdminApiServiceStub() as any,
        makeAuthStub() as any
      );
      component.ngOnInit();
      return component as any;
    }

    it('renders the permission message, not LOAD_FAILED, on a 403', () => {
      const store = makeStoreStub(null);
      const component = componentWith(store);

      store.failWith(403);

      expect(component.isForbidden).toBeTrue();
      expect(component.errorMessage)
        .withContext('a denial must not be worded as a load failure')
        .toBe('ADMIN.BOOKINGS.FORBIDDEN');
    });

    it('still renders LOAD_FAILED for a non-permission failure', () => {
      const store = makeStoreStub(null);
      const component = componentWith(store);

      store.failWith(500);

      expect(component.isForbidden).toBeFalse();
      expect(component.errorMessage).toBe('ADMIN.BOOKINGS.LOAD_FAILED');
    });

    it('treats a failure with no HTTP status as a load failure, not a denial', () => {
      const store = makeStoreStub(null);
      const component = componentWith(store);

      store.failWith(null);

      expect(component.isForbidden).toBeFalse();
      expect(component.errorMessage).toBe('ADMIN.BOOKINGS.LOAD_FAILED');
    });

    // A denial is not a transient refresh hiccup: with rows already cached, the
    // refresh-failed hint ("showing older data") would invite the reader to
    // trust a list they have just been told is not theirs.
    it('a 403 wins over the stale-data refresh hint even with rows cached', () => {
      const store = makeStoreStub(makeData(3));
      const component = componentWith(store);

      store.failWith(403);

      expect(component.isForbidden).toBeTrue();
      expect(component.refreshFailed)
        .withContext('a denial must not be presented as "could not refresh"')
        .toBeFalse();
      expect(component.errorMessage).toBe('ADMIN.BOOKINGS.FORBIDDEN');
    });

    it('clears the denial once a later refresh succeeds', () => {
      const store = makeStoreStub(null);
      const component = componentWith(store);
      store.failWith(403);
      expect(component.isForbidden).toBeTrue();

      // The base store resets the status then lowers the flag on success.
      store.errorStatus$.next(null);
      store.error$.next(false);

      expect(component.isForbidden).toBeFalse();
      expect(component.errorMessage).toBe('');
    });
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
        adminApiService as any,
        makeAuthStub() as any
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

  // OBRS-298: EOverallPaymentStatus grew a 7th code, refunded_partial (money
  // fully collected, since partially refunded — nothing outstanding), and the
  // owner decided all 7 codes (not just the new one) must be translated —
  // previously all 7 rendered as a raw code with no `translate` pipe at all.
  describe('paymentStatusLabel() (OBRS-298)', () => {
    // Mimics real ngx-translate: returns the mapped string for a known key,
    // or echoes the key back unchanged when missing — paymentStatusLabel()
    // relies on that echo (translated === key) to detect a miss and fall
    // back to the `.unknown` entry instead of printing the raw key.
    const DICTIONARY: Record<string, string> = {
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.unpaid': 'Unpaid',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.partial_paid': 'Partially Paid',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.refunded_partial':
        'Paid in Full (Partially Refunded)',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.fully_paid': 'Paid in Full',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.overpaid': 'Overpaid',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.refund_required': 'Refund Pending',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.refund_processed': 'Refunded',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.unknown': 'Unknown',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.pending': 'Pending',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.paid': 'Paid',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.success': 'Paid',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.failed': 'Failed',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.cancelled': 'Cancelled',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.expired': 'Expired',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.refunded': 'Refunded',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.manual_refund_required':
        'Manual Refund Required',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.partially_refunded': 'Partially Refunded',
    };

    function setupComponent(): BookingsPageComponent {
      const translate = {
        ...createTranslateStub(),
        instant: (key: string) => DICTIONARY[key] ?? key,
      };
      return new BookingsPageComponent(
        translate,
        makeStoreStub(makeData(0)) as any,
        makeAdminApiServiceStub() as any,
        makeAuthStub() as any
      );
    }

    it('translates all 7 EOverallPaymentStatus codes', () => {
      const component = setupComponent();
      expect((component as any).paymentStatusLabel('unpaid')).toBe('Unpaid');
      expect((component as any).paymentStatusLabel('partial_paid')).toBe('Partially Paid');
      expect((component as any).paymentStatusLabel('refunded_partial')).toBe(
        'Paid in Full (Partially Refunded)'
      );
      expect((component as any).paymentStatusLabel('fully_paid')).toBe('Paid in Full');
      expect((component as any).paymentStatusLabel('overpaid')).toBe('Overpaid');
      expect((component as any).paymentStatusLabel('refund_required')).toBe('Refund Pending');
      expect((component as any).paymentStatusLabel('refund_processed')).toBe('Refunded');
    });

    it('normalizes the list-row shape ("PARTIAL PAID", spaces+uppercase — BookingsStore.toBookingRow reformats the raw code before it reaches the row) to the same translation as the raw lower_snake_case code', () => {
      const component = setupComponent();
      expect((component as any).paymentStatusLabel('PARTIAL PAID')).toBe('Partially Paid');
      expect((component as any).paymentStatusLabel('REFUNDED PARTIAL')).toBe(
        'Paid in Full (Partially Refunded)'
      );
    });

    it('falls back to the translated "unknown" entry — never the raw i18n key — for a null/empty/unrecognized code', () => {
      const component = setupComponent();
      expect((component as any).paymentStatusLabel(null)).toBe('Unknown');
      expect((component as any).paymentStatusLabel(undefined)).toBe('Unknown');
      expect((component as any).paymentStatusLabel('')).toBe('Unknown');
      expect((component as any).paymentStatusLabel('   ')).toBe('Unknown');
      expect((component as any).paymentStatusLabel('some_future_code')).toBe('Unknown');
    });

    // The row badge is fed by THREE vocabularies, not one. BookingsStore
    // .toBookingRow falls back from the EOverallPaymentStatus code to
    // booking.payment?.status (EPaymentStatus) and then to
    // inferPaymentStatusFromBookingStatus(), which returns FAILED/SUCCESS/
    // PENDING. Translating only the booking-level codes would have turned
    // every one of those into "Unknown" — a regression caused by this fix.
    it('still labels the EPaymentStatus fallback that BookingsStore drops into the same badge', () => {
      const component = setupComponent();
      expect((component as any).paymentStatusLabel('paid')).toBe('Paid');
      expect((component as any).paymentStatusLabel('pending')).toBe('Pending');
      expect((component as any).paymentStatusLabel('partially_refunded')).toBe(
        'Partially Refunded'
      );
      expect((component as any).paymentStatusLabel('manual_refund_required')).toBe(
        'Manual Refund Required'
      );
    });

    it('still labels the inferred FAILED/SUCCESS/PENDING values, in the humanised shape the store emits', () => {
      const component = setupComponent();
      // inferPaymentStatusFromBookingStatus returns these bare uppercase words
      expect((component as any).paymentStatusLabel('FAILED')).toBe('Failed');
      expect((component as any).paymentStatusLabel('SUCCESS')).toBe('Paid');
      expect((component as any).paymentStatusLabel('PENDING')).toBe('Pending');
    });
  });

  describe('transactionStatusLabel() (OBRS-298)', () => {
    const DICTIONARY: Record<string, string> = {
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.paid': 'Paid',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES.refunded': 'Refunded',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.unknown': 'Unknown',
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.refunded_partial':
        'Paid in Full (Partially Refunded)',
    };

    function setupComponent(): BookingsPageComponent {
      const translate = {
        ...createTranslateStub(),
        instant: (key: string) => DICTIONARY[key] ?? key,
      };
      return new BookingsPageComponent(
        translate,
        makeStoreStub(makeData(0)) as any,
        makeAdminApiServiceStub() as any,
        makeAuthStub() as any
      );
    }

    it('resolves per-transaction EPaymentStatus values', () => {
      const component = setupComponent();
      expect((component as any).transactionStatusLabel('paid')).toBe('Paid');
      expect((component as any).transactionStatusLabel('refunded')).toBe('Refunded');
    });

    // The two vocabularies are separate on purpose: a transaction can never
    // legitimately carry a booking-level code, so resolving one against the
    // other would hide a real data problem behind a plausible label.
    it('does NOT resolve a booking-level code against the transaction namespace', () => {
      const component = setupComponent();
      expect((component as any).transactionStatusLabel('refunded_partial')).toBe('Unknown');
    });

    it('falls back to the translated unknown entry, never a raw key', () => {
      const component = setupComponent();
      expect((component as any).transactionStatusLabel(null)).toBe('Unknown');
      expect((component as any).transactionStatusLabel('nonsense')).toBe('Unknown');
    });
  });

  describe('paymentClass() refunded_partial (OBRS-298)', () => {
    it('maps refunded_partial to is-success (nothing outstanding), keeping partial_paid on is-warning', () => {
      const component = new BookingsPageComponent(
        createTranslateStub(),
        makeStoreStub(makeData(0)) as any,
        makeAdminApiServiceStub() as any,
        makeAuthStub() as any
      );
      expect((component as any).paymentClass('refunded_partial')).toBe('is-success');
      expect((component as any).paymentClass('REFUNDED PARTIAL')).toBe('is-success');
      expect((component as any).paymentClass('partial_paid')).toBe('is-warning');
    });
  });

  // OBRS-690 / OBRS-661 AC9: OWNER override-cancel gating.
  describe('override-cancel gating (OBRS-690)', () => {
    function make(hasRole: boolean) {
      const store = makeStoreStub(makeData(0));
      const api = makeAdminApiServiceStub();
      const component = new BookingsPageComponent(
        createTranslateStub(),
        store as any,
        api as any,
        makeAuthStub(hasRole) as any
      );
      return { component, store, api };
    }

    it('canOverrideCancel mirrors hasAnyRole([owner]) — true for owner/admin', () => {
      expect((make(true).component as any).canOverrideCancel).toBeTrue();
    });

    it('canOverrideCancel is false for a salesperson (hasAnyRole returns false)', () => {
      expect((make(false).component as any).canOverrideCancel).toBeFalse();
    });

    it('isDetailCancellable is true only for a CONFIRMED booking', () => {
      const { component } = make(true);
      (component as any).detailBooking = { id: 1, status: { code: 'confirmed', label: 'Confirmed' } };
      expect((component as any).isDetailCancellable).toBeTrue();

      (component as any).detailBooking = { id: 1, status: { code: 'cancelled', label: 'Cancelled' } };
      expect((component as any).isDetailCancellable).toBeFalse();

      (component as any).detailBooking = null;
      expect((component as any).isDetailCancellable).toBeFalse();
    });

    it('openOverrideCancel() opens only when owner AND booking is cancellable', () => {
      const { component } = make(true);
      (component as any).detailBooking = { id: 1, status: 'CONFIRMED' };
      (component as any).openOverrideCancel();
      expect((component as any).isOverrideCancelOpen).toBeTrue();
    });

    it('openOverrideCancel() is a no-op for a non-owner even on a CONFIRMED booking', () => {
      const { component } = make(false);
      (component as any).detailBooking = { id: 1, status: 'CONFIRMED' };
      (component as any).openOverrideCancel();
      expect((component as any).isOverrideCancelOpen).toBeFalse();
    });

    it('onOverrideCancelled() closes both dialogs and revalidates the list', () => {
      const { component, store } = make(true);
      (component as any).selectedBookingId = 1;
      (component as any).isOverrideCancelOpen = true;
      (component as any).onOverrideCancelled();
      expect((component as any).isOverrideCancelOpen).toBeFalse();
      expect((component as any).selectedBookingId).toBeNull();
      expect(store.refresh).toHaveBeenCalled();
    });
  });
});
