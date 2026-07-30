import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { BookingTrendStore } from './booking-trend.store';
import { BookingTrendDto } from '../../../../shared/interfaces/booking-trend.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function trend(overrides: Partial<BookingTrendDto> = {}): BookingTrendDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    series: [{ date: '2026-07-01', bookingCount: 4, ticketsSold: 5, movingAvg7: 4, barPct: 100 }],
    previousPeriod: { range: { from: '2026-06-24', to: '2026-06-30', timezone: 'Asia/Bangkok' }, totalBookings: 2, changePct: 100 },
    byDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ dow: i + 1, bookingCount: 0, sharePct: 0 })),
    peak: { date: '2026-07-01', bookingCount: 4 },
    ...overrides,
  };
}

interface FakeApi {
  getBookingTrend: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<BookingTrendDto>>>;
}

function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): BookingTrendStore {
  const full: FakeApi = {
    getBookingTrend: jasmine.createSpy('getBookingTrend').and.returnValue(of(ok(trend()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new BookingTrendStore(full as any, { authStatus$ } as any);
}

describe('BookingTrendStore', () => {
  function toDateInputValue(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  it('defaults to the last 7 days inclusive of today', () => {
    const { from, to } = makeStore({}).range;
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 6);
    expect(to).toBe(toDateInputValue(today));
    expect(from).toBe(toDateInputValue(fromDate));
  });

  it('fetches using the current range on refresh()', async () => {
    const getBookingTrend = jasmine.createSpy('getBookingTrend').and.returnValue(of(ok(trend())));
    const store = makeStore({ getBookingTrend });
    await store.refresh();
    const { from, to } = store.range;
    expect(getBookingTrend).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.peak?.bookingCount).toBe(4);
  });

  it('setRange() switches the range and refetches', async () => {
    const getBookingTrend = jasmine.createSpy('getBookingTrend').and.returnValue(of(ok(trend())));
    const store = makeStore({ getBookingTrend });
    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve();
    expect(getBookingTrend).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-10' });
  });

  it('exposes lastErrorCode from a failed fetch', async () => {
    const store = makeStore({
      getBookingTrend: jasmine.createSpy().and.returnValue(throwError(() => ({ error: { errorCode: 'REPORT_RANGE_TOO_LARGE' } }))),
    });
    await store.refresh();
    expect(store.lastErrorCode).toBe('REPORT_RANGE_TOO_LARGE');
  });
});
