import { BehaviorSubject, Observable, of } from 'rxjs';
import { PayeeSpendReportStore } from './payee-spend-report.store';
import { PayeeSpendReportDto } from '../../../../shared/interfaces/payee-spend-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function report(overrides: Partial<PayeeSpendReportDto> = {}): PayeeSpendReportDto {
  return {
    year: null,
    month: null,
    category: null,
    yearOptions: [],
    rows: [],
    unassigned: null,
    assignedBillCount: 0,
    assignedTotalAmount: '0.00',
    totalBillCount: 0,
    totalAmount: '0.00',
    ...overrides,
  };
}

interface FakeApi {
  getPayeeSpendReport: jasmine.Spy<
    (
      year: number | null,
      month: number | null,
      category: string | null
    ) => Observable<ResponseAPI<PayeeSpendReportDto>>
  >;
}

function makeStore(
  api: Partial<FakeApi> = {},
  authStatus$ = new BehaviorSubject<boolean>(true)
): { store: PayeeSpendReportStore; api: FakeApi } {
  const full: FakeApi = {
    getPayeeSpendReport: jasmine
      .createSpy('getPayeeSpendReport')
      .and.returnValue(of(ok(report()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { store: new PayeeSpendReportStore(full as any, { authStatus$ } as any), api: full };
}

describe('PayeeSpendReportStore', () => {
  // The owner's ruling of 2026-08-25. Not cosmetic: his second-largest payee is a single bill in a
  // year that is not the current one, so a current-year default would hide it on first paint.
  it('starts on every year, with no month and no category', () => {
    const { store } = makeStore();

    expect(store.filter).toEqual({ year: null, month: null, category: null });
  });

  it('sends no year parameter at all while every year is selected', async () => {
    const { store, api } = makeStore();

    await store.refresh();

    expect(api.getPayeeSpendReport).toHaveBeenCalledWith(null, null, null);
  });

  it('narrows to a year and refetches', async () => {
    const { store, api } = makeStore();

    store.setYear(2026);
    await store.refresh();

    expect(store.filter.year).toBe(2026);
    expect(api.getPayeeSpendReport).toHaveBeenCalledWith(2026, null, null);
  });

  // The trap this guards: a month left behind in a disabled control reappears the next time a year
  // is picked, silently narrowing a report the reader believed was whole.
  it('clears the month when going back to every year', () => {
    const { store } = makeStore();

    store.setYear(2026);
    store.setMonth(8);
    expect(store.filter.month).toBe(8);

    store.setYear(null);

    expect(store.filter).toEqual({ year: null, month: null, category: null });
  });

  it('refuses to hold a month while no year is selected', () => {
    const { store } = makeStore();

    store.setMonth(8);

    expect(store.filter.month).toBeNull();
  });

  it('keeps the category across a year change', () => {
    const { store } = makeStore();

    store.setCategory('REPAIR');
    store.setYear(2025);

    expect(store.filter).toEqual({ year: 2025, month: null, category: 'REPAIR' });
  });
});
