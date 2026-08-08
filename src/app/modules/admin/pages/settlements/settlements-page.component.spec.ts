import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { SettlementsPageComponent } from './settlements-page.component';
import {
  SettlementConfirmPayload,
  SettlementPendingItemDto,
  SettlementPendingPageDto,
  SettlementScheduleDetailDto,
} from '../../../../shared/interfaces/settlement.interface';
import { AdminUserDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

// OBRS-960 — SettlementsPageComponent now also injects DriverCashDaysStore
// (the second, independent stacked section). This minimal stub satisfies
// the constructor for every pre-existing test below, none of which
// exercise the new section — see settlements-page.component.spec.ts's own
// OBRS-960 describe block (if present) for the section's own coverage.
const driverCashDaysStoreStub = {
  data$: new BehaviorSubject<unknown>(null),
  refreshing$: new BehaviorSubject<boolean>(false),
  error$: new BehaviorSubject<boolean>(false),
  range: { from: '2026-07-01', to: '2026-07-07' },
  hasValue: false,
  refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
  setRange: jasmine.createSpy('setRange'),
  mutate: jasmine.createSpy('mutate'),
};

function makeItem(overrides: Partial<SettlementPendingItemDto> = {}): SettlementPendingItemDto {
  return {
    scheduleId: 1,
    originStopId: 5,
    originStopSlug: 'nong_chak',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    routeSlug: 'bkk-cnx',
    liveTotalAmount: '1000.00',
    ticketCount: 4,
    ...overrides,
  };
}

function makePage(items: SettlementPendingItemDto[] = [makeItem()]): SettlementPendingPageDto {
  return { range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' }, items };
}

function makeDetail(overrides: Partial<SettlementScheduleDetailDto> = {}): SettlementScheduleDetailDto {
  return {
    scheduleId: 1,
    originStopId: 5,
    originStopSlug: 'nong_chak',
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
      notTravelled: {
        ticketCount: 0,
        collectedAmount: '0.00',
        refundedAmount: '0.00',
        retainedAmount: '0.00',
        byMethod: [],
        byStatus: [],
      },
      expectedCashAmount: '600.00',
      perHeadDeducted: '0.00',
    },
    settled: null,
    discrepancy: null,
    ...overrides,
  };
}

function makeSettledDetail(): SettlementScheduleDetailDto {
  return makeDetail({
    status: 'SETTLED',
    settled: {
      totalAmount: '1000.00',
      byMethod: [{ method: 'cash', amount: '1000.00' }],
      byChannel: [{ channel: 'walk_in', amount: '1000.00' }],
      settledBy: 9,
      settledByName: 'Owner',
      settledAt: '2026-07-10T09:00:00+07:00',
      notTravelled: null,
      countedAmount: '600.00',
      expectedCashAmount: '600.00',
      discrepancyAmount: '0.00',
      discrepancyReason: null,
      handedOverBy: 7,
      handedOverByName: 'Sam Sales',
    },
  });
}

function ok<T>(data: T): { code: number; message: string; data: T } {
  return { code: 200, message: 'OK', data };
}

// OBRS-671: the users the confirm modal's hander picker is built from. Covers
// the role-slug string form, the AdminRoleDto form + name assembly, plus two
// users the filter must drop (a non-salesperson and a locked salesperson).
const USERS: AdminUserDto[] = [
  { id: 7, fullName: 'Sam Sales', roles: ['salesperson'], status: 'active' },
  { id: 3, fullName: 'Anna Admin', roles: ['admin'], status: 'active' },
  { id: 9, fullName: 'Lex Locked', roles: ['salesperson'], status: 'active', locked: true },
  { id: 5, firstName: 'Bee', lastName: 'Counter', roles: [{ slug: 'salesperson' }], status: 'active' },
];

// OBRS-671: a valid confirm payload the modal would emit.
const PAYLOAD: SettlementConfirmPayload = { countedCashAmount: '600.00', handedOverBy: 7 };

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

// Always carries a `getUsers` (ngOnInit loads the hander shortlist on every
// mount); override `getSettlementSchedule`/`confirmSettlement`/`getUsers` per test.
function makeAdminApiStub(overrides: Record<string, jasmine.Spy> = {}) {
  return {
    getSettlementSchedule: jasmine.createSpy('getSettlementSchedule').and.returnValue(of(ok(makeDetail()))),
    confirmSettlement: jasmine.createSpy('confirmSettlement').and.returnValue(of(ok(makeDetail({ status: 'SETTLED' })))),
    getUsers: jasmine.createSpy('getUsers').and.returnValue(of(ok(USERS))),
    ...overrides,
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
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
      makeAdminApiStub() as any,
      makeAlertStub() as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect((component as any).fromDate.getDate()).toBe(1);
    expect((component as any).toDate.getDate()).toBe(7);
    expect(store.refresh).toHaveBeenCalled();
  });

  // OBRS-671 — the hander picker is the active salespeople only, name-mapped
  // and sorted; admins and locked accounts are dropped.
  it('loads the handover candidates (active salespeople only) on init, sorted by name', () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub();
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
      adminApi as any,
      makeAlertStub() as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect(adminApi.getUsers).toHaveBeenCalledTimes(1);
    expect((component as any).handoverCandidates).toEqual([
      { id: 5, name: 'Bee Counter' },
      { id: 7, name: 'Sam Sales' },
    ]);
  });

  it('degrades to an empty picker when the users lookup fails', () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      getUsers: jasmine.createSpy('getUsers').and.returnValue(throwError(() => new Error('boom'))),
    });
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
      adminApi as any,
      makeAlertStub() as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect((component as any).handoverCandidates).toEqual([]);
  });

  it('contentState is "data" for a non-empty page', () => {
    const store = makeStoreStub(makePage());
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
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
    const adminApi = makeAdminApiStub({
      getSettlementSchedule: jasmine.createSpy().and.returnValue(pending.asObservable()),
    });
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
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
    const adminApi = makeAdminApiStub({
      getSettlementSchedule: jasmine.createSpy().and.callFake((id: number) => of(ok(makeDetail({ scheduleId: id })))),
    });
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
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
    const adminApi = makeAdminApiStub({
      getSettlementSchedule: jasmine.createSpy().and.returnValues(
        throwError(() => new Error('network')),
        of(ok(makeDetail()))
      ),
    });
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
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
      driverCashDaysStoreStub as any,
      makeAdminApiStub() as any,
      alert as any,
      createTranslateStub()
    );
    component.ngOnInit();

    await component['requestConfirm'](PAYLOAD);

    expect(alert.confirm).not.toHaveBeenCalled();
  });

  it('does not call the API when the confirm dialog is dismissed', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub();
    const alert = makeAlertStub();
    alert.confirm.and.resolveTo(false);
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(adminApi.confirmSettlement).not.toHaveBeenCalled();
  });

  it('confirm success posts the counted-cash payload, removes the row optimistically, and swaps to the settled view', async () => {
    const store = makeStoreStub(makePage([makeItem({ scheduleId: 1 }), makeItem({ scheduleId: 2 })]));
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine.createSpy('confirmSettlement').and.returnValue(of(ok(makeSettledDetail()))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(adminApi.confirmSettlement).toHaveBeenCalledWith(1, PAYLOAD);
    expect(alert.success).toHaveBeenCalled();
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 1)).toBeUndefined();
    expect((component as any).modalDetail.status).toBe('SETTLED');
  });

  // A short-drawer sign-off carries the reason through untouched.
  it('posts the discrepancy reason when the drawer does not reconcile', async () => {
    const shortPayload: SettlementConfirmPayload = {
      countedCashAmount: '580.00',
      handedOverBy: 7,
      discrepancyReason: 'ขาด 20',
    };
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine.createSpy('confirmSettlement').and.returnValue(of(ok(makeSettledDetail()))),
    });
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, makeAlertStub() as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](shortPayload);

    expect(adminApi.confirmSettlement).toHaveBeenCalledWith(1, shortPayload);
  });

  it('SETTLEMENT_ALREADY_SETTLED: refetches, swaps to the settled view, shows info (not error), and removes the row', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      getSettlementSchedule: jasmine.createSpy().and.returnValues(of(ok(makeDetail())), of(ok(makeSettledDetail()))),
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_ALREADY_SETTLED' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.info).toHaveBeenCalled();
    expect(alert.error).not.toHaveBeenCalled();
    expect((component as any).modalDetail.status).toBe('SETTLED');
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 1)).toBeUndefined();
  });

  // OBRS-671: a stale hander (client and server briefly disagreed) — keep the
  // modal open on the round and reload the shortlist so the owner can re-pick.
  it('SETTLEMENT_HANDER_NOT_FOUND: shows an error, keeps the modal open, and reloads the candidates', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_HANDER_NOT_FOUND' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBe(1);
    // once on init + once on the error.
    expect(adminApi.getUsers).toHaveBeenCalledTimes(2);
  });

  // The inline form guards this, but a server VALIDATION_FAILED keeps the modal
  // open (not a close+refresh) so the owner can correct and resubmit.
  it('VALIDATION_FAILED: shows an error and keeps the modal open', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'VALIDATION_FAILED' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBe(1);
  });

  it('SETTLEMENT_SCOPE_FORBIDDEN: shows an error, closes the modal, and refreshes the list', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_SCOPE_FORBIDDEN' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
    expect(store.refresh).toHaveBeenCalledTimes(2); // once on init, once on error
  });

  it('SETTLEMENT_ROUND_NOT_DEPARTED: shows an error, closes the modal, and refreshes the list', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_ROUND_NOT_DEPARTED' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
  });

  it('SETTLEMENT_SCHEDULE_NOT_FOUND: shows an error, closes the modal, removes the row, and refreshes', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SETTLEMENT_SCHEDULE_NOT_FOUND' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
    expect((component as any).items.find((i: SettlementPendingItemDto) => i.scheduleId === 1)).toBeUndefined();
  });

  it('an unrecognized errorCode falls back to a generic confirm-failed error, closes the modal, and refreshes', async () => {
    const store = makeStoreStub(makePage());
    const adminApi = makeAdminApiStub({
      confirmSettlement: jasmine
        .createSpy()
        .and.returnValue(throwError(() => ({ error: { errorCode: 'SOMETHING_ELSE' } }))),
    });
    const alert = makeAlertStub();
    const component = new SettlementsPageComponent(store as any, driverCashDaysStoreStub as any, adminApi as any, alert as any, createTranslateStub());
    component.ngOnInit();
    component['openDetail'](1);

    await component['requestConfirm'](PAYLOAD);

    expect(alert.error).toHaveBeenCalled();
    expect((component as any).openScheduleId).toBeNull();
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makePage());
    const component = new SettlementsPageComponent(
      store as any,
      driverCashDaysStoreStub as any,
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
