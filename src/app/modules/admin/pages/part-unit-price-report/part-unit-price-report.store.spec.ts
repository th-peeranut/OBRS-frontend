import { BehaviorSubject, Observable, of } from 'rxjs';
import { PartUnitPriceReportStore } from './part-unit-price-report.store';
import { PartUnitPriceReportDto } from '../../../../shared/interfaces/part-unit-price-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function report(overrides: Partial<PartUnitPriceReportDto> = {}): PartUnitPriceReportDto {
  return {
    partId: null,
    partOptions: [],
    lines: [],
    coverage: {
      totalAmount: '0.00',
      totalLineCount: 0,
      comparableAmount: '0.00',
      comparableLineCount: 0,
      unnamedAmount: '0.00',
      unnamedLineCount: 0,
      excludedPriceAmount: '0.00',
      excludedPriceLineCount: 0,
    },
    ...overrides,
  };
}

interface FakeApi {
  getPartUnitPriceReport: jasmine.Spy<
    (partId: number | null) => Observable<ResponseAPI<PartUnitPriceReportDto>>
  >;
}

function makeStore(
  api: Partial<FakeApi> = {},
  authStatus$ = new BehaviorSubject<boolean>(true)
): { store: PartUnitPriceReportStore; api: FakeApi } {
  const full: FakeApi = {
    getPartUnitPriceReport: jasmine
      .createSpy('getPartUnitPriceReport')
      .and.returnValue(of(ok(report()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { store: new PartUnitPriceReportStore(full as any, { authStatus$ } as any), api: full };
}

describe('PartUnitPriceReportStore', () => {
  it('opens with no part selected — the picker is what the first response fills in', () => {
    const { store } = makeStore();

    expect(store.filter).toEqual({ partId: null });
  });

  it('sends no partId at all on the first paint', async () => {
    // The picker IS the screen, so it has to render before anything is chosen. A request for
    // "every part" would be a request for every line of every part.
    const { store, api } = makeStore();

    await store.refresh();

    expect(api.getPartUnitPriceReport).toHaveBeenCalledWith(null);
  });

  it('refetches when the part changes', async () => {
    const { store, api } = makeStore();

    store.setPart(501);
    await store.refresh();

    expect(store.filter.partId).toBe(501);
    expect(api.getPartUnitPriceReport).toHaveBeenCalledWith(501);
  });

  // The one filter this report has is WHICH part. There is deliberately no year or date range
  // (owner ruling 2026-08-25) — both comparable parts straddle 2025/2026, so any window empties
  // exactly the chart the screen exists for.
  it('carries no period filter of any kind', () => {
    const { store } = makeStore();

    expect(Object.keys(store.filter)).toEqual(['partId']);
  });

  it('falls back to a zeroed coverage rather than a null one when the body is empty', async () => {
    // The coverage line renders unconditionally; a null total there would print as blank beside
    // the word "ทั้งหมด", which reads as a report claiming there was no spending at all.
    const { store } = makeStore({
      getPartUnitPriceReport: jasmine
        .createSpy('getPartUnitPriceReport')
        .and.returnValue(of({ code: 200, message: 'OK' } as ResponseAPI<PartUnitPriceReportDto>)),
    });

    await store.refresh();

    let seen: PartUnitPriceReportDto | null = null;
    store.data$.subscribe((value) => (seen = value));

    expect(seen!.coverage.totalAmount).toBe('0.00');
    expect(seen!.partOptions).toEqual([]);
  });
});
