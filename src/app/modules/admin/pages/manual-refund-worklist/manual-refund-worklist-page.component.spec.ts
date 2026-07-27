import { BehaviorSubject } from 'rxjs';
import { ManualRefundWorklistPageComponent } from './manual-refund-worklist-page.component';
import { PageResponse, PendingRefund } from '../../../../shared/interfaces/payment.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

function buildRow(overrides: Partial<PendingRefund> = {}): PendingRefund {
  return {
    paymentId: 1,
    bookingId: 10,
    bookingNumber: 'B-10',
    amount: 500,
    amountOwed: 400,
    paymentMethod: 'qr_promptpay',
    reason: 'manual',
    destinationType: 'promptpay',
    destination: { promptpayPhone: '0812345678' },
    destinationMasked: false,
    queuedAt: '2026-07-20T10:00:00+07:00',
    ...overrides,
  };
}

function buildPage(rows: PendingRefund[]): PageResponse<PendingRefund> {
  return {
    content: rows,
    totalElements: rows.length,
    totalPages: rows.length ? 1 : 0,
    size: 20,
    number: 0,
    numberOfElements: rows.length,
  };
}

function makeStoreStub(data: PageResponse<PendingRefund> | null) {
  const data$ = new BehaviorSubject<PageResponse<PendingRefund> | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    goToPage: jasmine.createSpy('goToPage').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate').and.callFake((transform: (c: PageResponse<PendingRefund>) => PageResponse<PendingRefund>) => {
      if (data$.value) data$.next(transform(data$.value));
    }),
  };
}

describe('ManualRefundWorklistPageComponent (OBRS-286)', () => {
  it('fetches once on init (renders optimistically from cache, if any)', () => {
    const store = makeStoreStub(null);
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('honors a null data$ emission (store-null gate) — never keeps stale rows', () => {
    const store = makeStoreStub(buildPage([buildRow()]));
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());
    component.ngOnInit();
    expect((component as any).rows.length).toBe(1);

    store.data$.next(null);
    expect((component as any).rows).toEqual([]);
    expect((component as any).totalElements).toBe(0);
  });

  it('contentState is empty (not error) on a 200 + empty content', () => {
    const store = makeStoreStub(buildPage([]));
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).contentState).toBe('empty');
  });

  it('goToPage() delegates to the store with a 0-based page', () => {
    const store = makeStoreStub(buildPage([]));
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());

    (component as any).onPageChange(3);

    expect(store.goToPage).toHaveBeenCalledWith(2);
  });

  it('hasDestination/queueAgeDays/queueAgeSeverity delegate to the pure mappers', () => {
    const store = makeStoreStub(null);
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());

    expect((component as any).hasDestination(buildRow({ destinationType: null }))).toBeFalse();
    expect((component as any).hasDestination(buildRow({ destinationType: 'promptpay' }))).toBeTrue();
    expect((component as any).queueAgeDays(buildRow({ queuedAt: null }))).toBeNull();
  });

  it('formatMoney renders 0.00 for an undefined/unparseable value rather than throwing', () => {
    const store = makeStoreStub(null);
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());

    expect((component as any).formatMoney(undefined)).toContain('0.00');
  });

  it('openMarkRefunded / closeMarkRefunded toggle the modal row', () => {
    const store = makeStoreStub(null);
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());
    const row = buildRow();

    (component as any).openMarkRefunded(row);
    expect((component as any).markRefundedRow).toEqual(row);

    (component as any).closeMarkRefunded();
    expect((component as any).markRefundedRow).toBeNull();
  });

  it('on mark-refunded completion, optimistically drops the row via store.mutate then refreshes', () => {
    const row = buildRow();
    const store = makeStoreStub(buildPage([row]));
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());
    component.ngOnInit();
    (component as any).openMarkRefunded(row);
    store.refresh.calls.reset();

    (component as any).onMarkRefundedCompleted();

    expect(store.mutate).toHaveBeenCalled();
    expect(store.data$.value?.content.length).toBe(0);
    expect(store.refresh).toHaveBeenCalledTimes(1);
    expect((component as any).markRefundedRow).toBeNull();
  });

  it('trackByPaymentId returns the row identity, callable detached (arrow-field, not a bare method)', () => {
    const store = makeStoreStub(null);
    const component = new ManualRefundWorklistPageComponent(store as any, createTranslateStub());
    const trackBy = component['trackByPaymentId'];

    expect(trackBy(0, buildRow({ paymentId: 7 }))).toBe(7);
  });
});
