import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { SettlementsPageComponent } from './settlements-page.component';
import {
  SettlementPendingItemDto,
  SettlementPendingPageDto,
  SettlementScheduleDetailDto,
} from '../../../../shared/interfaces/settlement.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeItem(overrides: Partial<SettlementPendingItemDto> = {}): SettlementPendingItemDto {
  return {
    scheduleId: 1,
    routeLabel: 'BKK-CNX',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    status: 'PENDING',
    totalAmount: '1000.00',
    currency: 'THB',
    ticketCount: 4,
    ...overrides,
  };
}

function makePage(items: SettlementPendingItemDto[] = [makeItem()]): SettlementPendingPageDto {
  return { items, totalElements: items.length };
}

function makeDetail(overrides: Partial<SettlementScheduleDetailDto> = {}): SettlementScheduleDetailDto {
  return {
    scheduleId: 1,
    routeLabel: 'BKK-CNX',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    status: 'PENDING',
    currency: 'THB',
    live: {
      totalAmount: '1000.00',
      onSiteTotal: '600.00',
      agencyTotal: '400.00',
      passengerCount: 4,
      ticketCount: 4,
      byMethod: [{ method: 'cash', amount: '600.00', ticketCount: 2 }],
      byChannel: [{ channel: 'walk_in', amount: '600.00', ticketCount: 2, remote: false }],
    },
    settled: null,
    discrepancy: null,
    ...overrides,
  };
}

function ok<T>(data: T): { code: number; message: string; data: T } {
  return { code: 200, message: 'OK', data };
}

// A store stub with a working `mutate()` (backed by the same BehaviorSubject
// `data$` reads from) so optimistic row-removal is actually observable, mirroring
// AdminCollectionStore's real semantics.
function makeStoreStub(
  data: SettlementPendingPageDto | null,
  range = { from: '2026-07-01', to: '2026-07-07' }
) {
  const data$ = new BehaviorSubject<SettlementPendingPageDto | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    range,
    lastErrorCode: null as string | null,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
    mutate: jasmine.createSpy('mutate').and.callFake((transform: (c: SettlementPendingPageDto) => SettlementPendingPageDto) => {
      const current = data$.value;
      if (current !== null) {
        data$.next(transform(current));
      }
    }),
  };
}

function makeAdminApiStub() {
  return {
    getSettlementSchedule: jasmine.createSpy('getSettlementSchedule').and.returnValue(of(ok(makeDetail()))),
    confirmSettlement: jasmine
      .createSpy('confirmSettlement')
      .and.returnValue(of(ok(makeDetail({ status: 'SETTLED' })))),
  };
}

function makeAlertStub() {
  return {
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    info: jasmine.createSpy('info'),
  };
}

describe('SettlementsPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    expect(component).toBeTruthy();
  });

  it('seeds the two date pickers from the store range on init and refreshes', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-07' });
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect((component as any).fromDate.getDate()).toBe(1);
    expect((component as any).toDate.getDate()).toBe(7);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('contentState is "data" for a non-empty page', () => {
    const store = makeStoreStub(makePage());
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();
    expect((component as any).contentState).toBe('data');
  });

  it('contentState is "empty" for a valid range with no pending rounds', () => {
    const store = makeStoreStub(makePage([]));
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();
    expect((component as any).contentState).toBe('empty');
  });

  it('contentState is "invalid" when the range guard trips (from > to) and does not dispatch', () => {
    const store = makeStoreStub(makePage());
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component['onFromDateChange'](new Date(2026, 6, 10));
    component['onToDateChange'](new Date(2026, 6, 1));

    expect((component as any).contentState).toBe('invalid');
    expect(store.setRange).not.toHaveBeenCalled();
  });

  it('contentState is "error" when a fetch fails with no cached value', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'SOMETHING_ELSE';
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();
    store.error$.next(true);
    expect((component as any).contentState).toBe('error');
  });

  // ── Optimistic open ────────────────────────────────────────────────────
  it('opens the modal optimistically from the row in hand before the detail GET resolves', () => {
    // A Subject (not `of(...)`) so the GET stays pending until we manually
    // emit — lets us observe the optimistic-open window before the patch lands.
    const pending = new Subject<{ code: number; message: string; data: SettlementScheduleDetailDto }>();
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(pending.asObservable()),
      confirmSettlement: jasmine.createSpy(),
    };
    const component = new SettlementsPageComponent(
      store as any,
      adminApi as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component['openDetail'](1);

    // Optimistic: summary seeded synchronously from the row, detail still null.
    expect((component as any).modalSummary.scheduleId).toBe(1);
    expect((component as any).modalDetail).toBeNull();
    expect((component as any).isDetailFetching).toBeTrue();

    pending.next(ok(makeDetail()));

    expect((component as any).modalDetail.live.totalAmount).toBe('1000.00');
    expect((component as any).isDetailFetching).toBeFalse();
  });

  it('reopening a cached round renders immediately without a second GET', () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub();
    const component = new SettlementsPageComponent(
      store as any,
      adminApi as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component['openDetail'](1);
    component['closeDetail']();
    component['openDetail'](1);

    expect(adminApi.getSettlementSchedule).toHaveBeenCalledTimes(1);
    expect((component as any).modalDetail).not.toBeNull();
  });

  it('ignores a stale detail response after the admin moved to a different round', () => {
    const store = makeStoreStub(makePage([makeItem({ scheduleId: 1 }), makeItem({ scheduleId: 2 })]));
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.callFake((id: number) => of(ok(makeDetail({ scheduleId: id })))),
      confirmSettlement: jasmine.createSpy(),
    };
    const component = new SettlementsPageComponent(
      store as any,
      adminApi as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component['openDetail'](1);
    component['openDetail'](2);

    // Only the latest open's detail should be reflected.
    expect((component as any).openScheduleId).toBe(2);
    expect((component as any).modalDetail.scheduleId).toBe(2);
  });

  it('closeDetail resets all modal state', () => {
    const store = makeStoreStub(makePage());
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();
    component['openDetail'](1);

    component['closeDetail']();

    expect((component as any).openScheduleId).toBeNull();
    expect((component as any).modalSummary).toBeNull();
    expect((component as any).modalDetail).toBeNull();
  });

  it('a detail GET network failure sets an inline fetchError, and retryFetch re-issues the GET', () => {
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValues(
        throwError(() => new Error('network')),
        of(ok(makeDetail()))
      ),
      confirmSettlement: jasmine.createSpy(),
    };
    const component = new SettlementsPageComponent(
      store as any,
      adminApi as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component['openDetail'](1);
    expect((component as any).detailFetchError).toBe('ADMIN.SETTLEMENTS.DETAIL.LOAD_FAILED');

    component['retryFetch']();
    expect((component as any).modalDetail).not.toBeNull();
    expect(adminApi.getSettlementSchedule).toHaveBeenCalledTimes(2);
  });

  // ── Confirm orchestration ──────────────────────────────────────────────
  it('requestConfirm is a no-op with no open round', async () => {
    const store = makeStoreStub(makePage());
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      alert as any,
      createTranslateStub()
    );
    component.ngOnInit();

    await component['requestConfirm']();

    expect(alert.confirm).not.toHaveBeenCalled();
  });

  it('does not call the API when the confirm dialog is dismissed', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub();
    const alert = makeAlertStub();
    alert.confirm.and.resolveTo(false);
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(adminApi.confirmSettlement).not.toHaveBeenCalled();
  });

  it('confirm success posts the exact live totalAmount, removes the row optimistically, and swaps to the settled view', async () => {
    const store = makeStoreStub(makePage([makeItem({ scheduleId: 1 }), makeItem({ scheduleId: 2 })]));
    const adminApi = makeAdminApiStub();
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(adminApi.confirmSettlement).toHaveBeenCalledWith(1, '1000.00');
    expect(alert.success).toHaveBeenCalled();
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 1)).toBeUndefined();
    expect((component as any).modalDetail.status).toBe('SETTLED');
  });

  // Zero-revenue rounds must still be confirmable, and the exact amount
  // (including "THB 0.00") is what gets posted.
  it('confirms a zero-revenue round with the exact zero amount', async () => {
    const zeroDetail = makeDetail({
      live: {
        totalAmount: '0.00',
        onSiteTotal: '0.00',
        agencyTotal: '0.00',
        passengerCount: 0,
        ticketCount: 0,
        byMethod: [],
        byChannel: [],
      },
    });
    const store = makeStoreStub(makePage([makeItem({ scheduleId: 1, totalAmount: '0.00' })]));
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(of(ok(zeroDetail))),
      confirmSettlement: jasmine.createSpy().and.returnValue(of(ok({ ...zeroDetail, status: 'SETTLED' }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(adminApi.confirmSettlement).toHaveBeenCalledWith(1, '0.00');
  });

  it('SETTLEMENT_ALREADY_SETTLED: refetches, swaps to the settled view, shows info (not error), and removes the row', async () => {
    const store = makeStoreStub(makePage());
    const settledDetail = makeDetail({ status: 'SETTLED', settled: { settledByName: 'Owner', settledAt: '2026-07-10T09:00:00+07:00', acknowledgedTotalAmount: '1000.00' } });
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValues(of(ok(makeDetail())), of(ok(settledDetail))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_ALREADY_SETTLED' } }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(alert.info).toHaveBeenCalled();
    expect(alert.error).not.toHaveBeenCalled();
    expect((component as any).modalDetail.status).toBe('SETTLED');
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 1)).toBeUndefined();
  });

  it('SETTLEMENT_AMOUNT_MISMATCH: shows an error and re-fetches fresh detail instead of resubmitting', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(of(ok(makeDetail({ live: { ...makeDetail().live, totalAmount: '1200.00' } })))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_AMOUNT_MISMATCH' } }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1); // primes the cache with the stale amount

    await component['requestConfirm']();

    expect(alert.error).toHaveBeenCalled();
    // A fresh GET was issued (cache was cleared) rather than trusting the stale cached amount.
    expect(adminApi.getSettlementSchedule).toHaveBeenCalledTimes(2);
    expect((component as any).modalDetail.live.totalAmount).toBe('1200.00');
    // Modal stays open on this round so the admin can review the refreshed amount.
    expect((component as any).openScheduleId).toBe(1);
  });

  it('SETTLEMENT_SCOPE_FORBIDDEN: shows an error, closes the modal, and refreshes the list', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(of(ok(makeDetail()))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_SCOPE_FORBIDDEN' } }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
    expect(store.refresh).toHaveBeenCalledTimes(2); // once on init, once on error
  });

  it('SETTLEMENT_ROUND_NOT_DEPARTED: shows an error, closes the modal, and refreshes the list', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(of(ok(makeDetail()))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_ROUND_NOT_DEPARTED' } }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
  });

  it('SETTLEMENT_SCHEDULE_NOT_FOUND: shows an error, closes the modal, removes the row, and refreshes', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(of(ok(makeDetail()))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_SCHEDULE_NOT_FOUND' } }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 1)).toBeUndefined();
  });

  it('an unrecognized errorCode falls back to a generic confirm-failed error, closes the modal, and refreshes', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = {
      getSettlementSchedule: jasmine.createSpy().and.returnValue(of(ok(makeDetail()))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SOMETHING_ELSE' } }))),
    };
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm']();

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makePage());
    const component = new SettlementsPageComponent(
      store as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(makePage([makeItem({ scheduleId: 999 })]));
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 999)).toBeUndefined();
  });
});
