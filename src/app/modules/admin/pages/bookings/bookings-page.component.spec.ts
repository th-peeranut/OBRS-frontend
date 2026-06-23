import { BehaviorSubject } from 'rxjs';
import { BookingsPageComponent } from './bookings-page.component';
import { BookingRow, BookingsData } from './bookings.store';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeRows(count: number): BookingRow[] {
  return Array.from({ length: count }, (_, i) => ({
    bookingId: `#BK-${i + 1}`,
    customer: `Customer ${i + 1}`,
    route: 'A -> B',
    bookingDate: '2026-06-19',
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

describe('BookingsPageComponent', () => {
  it('renders cached bookings immediately on re-entry', () => {
    const store = makeStoreStub(makeData(3));
    const component = new BookingsPageComponent(createTranslateStub(), store as any);

    component.ngOnInit();

    expect((component as any).isLoading).toBeFalse();
    expect((component as any).allBookings.length).toBe(3);
  });

  // Fix: a background revalidate must not bounce the user off their current page.
  it('preserves the current page across a background revalidate when still valid', () => {
    const store = makeStoreStub(makeData(25)); // 3 pages at pageSize 10
    const component = new BookingsPageComponent(createTranslateStub(), store as any);
    component.ngOnInit();

    (component as any).goToPage(3);
    expect((component as any).currentPage).toBe(3);

    store.data$.next(makeData(25)); // background revalidate, same size

    expect((component as any).currentPage).toBe(3);
  });

  it('clamps the current page when a revalidate returns fewer rows', () => {
    const store = makeStoreStub(makeData(25));
    const component = new BookingsPageComponent(createTranslateStub(), store as any);
    component.ngOnInit();
    (component as any).goToPage(3);

    store.data$.next(makeData(5)); // now only 1 page

    expect((component as any).currentPage).toBe(1);
  });
});
