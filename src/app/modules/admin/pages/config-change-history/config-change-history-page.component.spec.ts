import { BehaviorSubject } from 'rxjs';
import { ConfigChangeHistoryPageComponent } from './config-change-history-page.component';
import { PageResponse } from '../../../../shared/interfaces/payment.interface';
import { ConfigHistoryRow } from '../../../../shared/interfaces/config-history.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

type HistoryPage = PageResponse<ConfigHistoryRow>;

function row(overrides: Partial<ConfigHistoryRow> = {}): ConfigHistoryRow {
  return {
    id: 1,
    configKey: 'booking_max_advance_days',
    operation: 'UPDATE',
    changedAt: '2026-07-20T14:32:11.482+07:00',
    oldValue: 30,
    newValue: 45,
    actorSource: 'USER',
    actorName: 'สมชาย ใจดี',
    actorRole: 'owner',
    // OBRS-722: default to the platform default — the pre-722 meaning of every
    // row that already existed, so the untouched cases below keep testing what
    // they were written to test.
    scope: 'PLATFORM',
    ownerName: null,
    ...overrides,
  };
}

function page(content: ConfigHistoryRow[], overrides: Partial<HistoryPage> = {}): HistoryPage {
  return {
    content,
    totalElements: content.length,
    totalPages: content.length ? 1 : 0,
    size: 20,
    number: 0,
    numberOfElements: content.length,
    ...overrides,
  };
}

function makeStoreStub(data: HistoryPage | null) {
  const data$ = new BehaviorSubject<HistoryPage | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    hasValue: data !== null,
    lastErrorCode: null as string | null,
    // Root-scoped store: whatever filter the PREVIOUS visit left behind.
    filters: {
      configKey: undefined as string | undefined,
      from: undefined as string | undefined,
      to: undefined as string | undefined,
    },
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setConfigKey: jasmine.createSpy('setConfigKey').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange').and.resolveTo(undefined),
    setPage: jasmine.createSpy('setPage').and.resolveTo(undefined),
  };
}

describe('ConfigChangeHistoryPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('fetches once on init with the resting default (no filter/range set), no double-fetch', () => {
    const store = makeStoreStub(null);
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
    expect(store.setConfigKey).not.toHaveBeenCalled();
    expect(store.setRange).not.toHaveBeenCalled();
  });

  // OBRS-722: the template's ขอบเขต column dispatches on this. The mapper's own
  // exhaustiveness is proven in the mappers spec; what this pins is that the
  // component actually EXPOSES it (a mapper nothing calls renders nothing).
  it('scopeKind classifies each row the template can receive', () => {
    const store = makeStoreStub(null);
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    expect((component as any).scopeKind(row())).toBe('platform');
    expect((component as any).scopeKind(row({ scope: 'OWNER', ownerName: 'มาลี' }))).toBe('owner');
    expect((component as any).scopeKind(row({ scope: 'OWNER', ownerName: null }))).toBe('owner-deleted');
  });

  // Scrutinize regression gate: the store is root-scoped, so a RE-ENTRY renders
  // the previous visit's filtered rows. If the controls are not re-seeded from
  // it, the dropdown/date fields say "no filter" over a filtered table — the
  // owner reads that as "there is no other config history".
  it('re-seeds its filter controls from the root store on re-entry', () => {
    const store = makeStoreStub(page([row()]));
    store.filters = { configKey: 'jump_seat_enabled', from: '2026-07-01', to: '2026-07-07' };
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).selectedConfigKey).toBe('jump_seat_enabled');
    expect(((component as any).fromDate as Date).getMonth()).toBe(6);
    expect(((component as any).fromDate as Date).getDate()).toBe(1);
    expect(((component as any).toDate as Date).getDate()).toBe(7);
  });

  it('shows the loading skeleton state on first ever visit (no cache yet)', () => {
    const store = makeStoreStub(null);
    store.refreshing$.next(true);
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isLoading).toBeTrue();
    expect((component as any).contentState).toBe('loading');
  });

  it('renders cached rows immediately via the data$ subscription', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).rows.length).toBe(1);
    expect((component as any).totalElements).toBe(1);
    expect((component as any).contentState).toBe('data');
  });

  it('contentState is "empty" for a 200 + [] result (not an error)', () => {
    const store = makeStoreStub(page([]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).contentState).toBe('empty');
  });

  it('contentState is "error" when a fetch fails with no cached value', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'SOMETHING_ELSE';
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).contentState).toBe('error');
    expect((component as any).errorMessage).toBe('ADMIN.CONFIG_CHANGE_HISTORY.LOAD_FAILED');
  });

  it('shows the range-specific message when error$ fires with CONFIG_HISTORY_RANGE_INVALID and no cache (defense-in-depth backstop)', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'CONFIG_HISTORY_RANGE_INVALID';
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('ADMIN.CONFIG_CHANGE_HISTORY.ERROR.RANGE_INVALID');
  });

  it('keeps errorMessage empty when a background revalidate fails but cached data remains', () => {
    const store = makeStoreStub(page([row()]));
    store.hasValue = true;
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('');
    expect((component as any).refreshFailed).toBeTrue();
  });

  // contentState priority: invalid takes over everything else, mirroring
  // reports-page's contentState ordering.
  it('contentState is "invalid" (over cached data) when the client range guard trips', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    // Setting `from` alone is a valid single-bound filter and dispatches
    // immediately (see the from-only spec below) — the guard only trips once
    // `to` also lands and the pair compares invalid, so the spy is reset
    // after that first (valid) dispatch to isolate what the SECOND call does.
    component['onFromDateChange'](new Date(2026, 6, 20));
    store.setRange.calls.reset();
    component['onToDateChange'](new Date(2026, 6, 1));

    expect((component as any).contentState).toBe('invalid');
    expect((component as any).rangeError).toBe('ADMIN.CONFIG_CHANGE_HISTORY.ERROR.RANGE_INVALID');
    expect(store.setRange).not.toHaveBeenCalled();
  });

  it('does not flag a range with only ONE bound set as invalid (from-only is a valid filter)', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();
    store.setRange.calls.reset();

    component['onFromDateChange'](new Date(2026, 6, 1));

    expect((component as any).rangeError).toBe('');
    expect(store.setRange).toHaveBeenCalledWith('2026-07-01', undefined);
  });

  it('dispatches store.setRange with yyyy-MM-dd strings for a valid two-sided range', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onFromDateChange'](new Date(2026, 6, 1));
    component['onToDateChange'](new Date(2026, 6, 10));

    expect((component as any).rangeError).toBe('');
    expect(store.setRange).toHaveBeenCalledWith('2026-07-01', '2026-07-10');
  });

  it('onConfigKeyFilterChange forwards the picked key, and "" as undefined (the "all" option)', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onConfigKeyFilterChange']('jump_seat_enabled');
    expect(store.setConfigKey).toHaveBeenCalledWith('jump_seat_enabled');

    component['onConfigKeyFilterChange']('');
    expect(store.setConfigKey).toHaveBeenCalledWith(undefined);
  });

  it('onPageChange converts the paginator 1-based page to the 0-based store page', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onPageChange'](3);

    expect(store.setPage).toHaveBeenCalledWith(2);
  });

  // G1: an untranslated config key must render as the RAW key, never blank —
  // the fake translate stub used here mirrors ngx-translate's real miss
  // behavior (instant() returns the key itself when unknown).
  it('G1 — configKeyLabelFor falls back to the raw config key for an untranslated key', () => {
    const store = makeStoreStub(page([row({ configKey: 'brand_new_config_key' })]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).configKeyLabelFor('brand_new_config_key')).toBe('brand_new_config_key');
  });

  // UX §4.1: the config-key filter's option list accumulates DISTINCT keys
  // across every page fetched THIS SESSION — it must never shrink/reset when
  // a later page/filter fetch returns a different set of keys.
  it('accumulates seen config keys across successive fetches, never resetting the filter option list', () => {
    const store = makeStoreStub(page([row({ configKey: 'booking_max_advance_days' })]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    let values = (component as any).configKeyFilterOptions.map((o: { value: string }) => o.value);
    expect(values).toContain('booking_max_advance_days');

    // A subsequent page/filter fetch returns a DIFFERENT config key only —
    // the option list must still contain the FIRST key too.
    store.data$.next(page([row({ configKey: 'jump_seat_enabled' })]));

    values = (component as any).configKeyFilterOptions.map((o: { value: string }) => o.value);
    expect(values).toContain('booking_max_advance_days');
    expect(values).toContain('jump_seat_enabled');
  });

  it('the "all" option is always first with an empty value', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    const options = (component as any).configKeyFilterOptions;
    expect(options[0].value).toBe('');
  });

  it('trackById returns the row id (arrow-function field, not a detached method)', () => {
    const store = makeStoreStub(page([row({ id: 42 })]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    const trackBy = (component as any).trackById as (i: number, r: ConfigHistoryRow) => number;
    expect(trackBy(0, row({ id: 42 }))).toBe(42);
  });

  it('rangeStart/rangeEnd compute the "Showing X-Y of N" window', () => {
    const store = makeStoreStub(
      page(
        Array.from({ length: 20 }, (_, i) => row({ id: i + 1 })),
        { totalElements: 45, totalPages: 3, number: 1, numberOfElements: 20 }
      )
    );
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).currentPage).toBe(2);
    expect((component as any).rangeStart).toBe(21);
    expect((component as any).rangeEnd).toBe(40);
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(page([row()]));
    const component = new ConfigChangeHistoryPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();
    store.data$.next(page([row({ id: 999 })]));

    expect((component as any).rows[0].id).not.toBe(999);
  });
});
