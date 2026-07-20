import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfigChangeHistoryStore } from './config-change-history.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { PageResponse } from '../../../../shared/interfaces/payment.interface';
import { ConfigHistoryRow } from '../../../../shared/interfaces/config-history.interface';

describe('ConfigChangeHistoryStore', () => {
  let store: ConfigChangeHistoryStore;
  let adminApiServiceSpy: jasmine.SpyObj<AdminApiService>;
  let authStatusSubject: BehaviorSubject<boolean>;

  const emptyPage: PageResponse<ConfigHistoryRow> = {
    content: [],
    totalElements: 0,
    totalPages: 0,
    size: 20,
    number: 0,
    numberOfElements: 0,
  };

  beforeEach(() => {
    authStatusSubject = new BehaviorSubject<boolean>(true);
    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', ['getConfigChangeHistory']);
    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );

    TestBed.configureTestingModule({
      providers: [
        ConfigChangeHistoryStore,
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        { provide: AuthService, useValue: { authStatus$: authStatusSubject.asObservable() } },
      ],
    });

    store = TestBed.inject(ConfigChangeHistoryStore);
  });

  it('fetches with no filter/range before any setter is called, page 0 / size 20', async () => {
    await store.refresh();
    expect(adminApiServiceSpy.getConfigChangeHistory).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      0,
      20
    );
  });

  it('setConfigKey fetches with the given key', async () => {
    await store.setConfigKey('booking_max_advance_days');
    expect(adminApiServiceSpy.getConfigChangeHistory).toHaveBeenCalledWith(
      'booking_max_advance_days',
      undefined,
      undefined,
      0,
      20
    );
  });

  it('setRange fetches with the given from/to', async () => {
    await store.setRange('2026-07-01', '2026-07-20');
    expect(adminApiServiceSpy.getConfigChangeHistory).toHaveBeenCalledWith(
      undefined,
      '2026-07-01',
      '2026-07-20',
      0,
      20
    );
  });

  // G6: clear() before refresh() on every setter — asserted the same way
  // usability-reports.store.spec.ts pins it: a stale value must flash to
  // null (BehaviorSubject replay) before the fresh fetch lands.
  it('setConfigKey clears the cached value (no stale-filter flash) when the key actually changes', async () => {
    const page: PageResponse<ConfigHistoryRow> = {
      content: [
        {
          id: 1,
          configKey: 'booking_max_advance_days',
          operation: 'UPDATE',
          changedAt: '2026-07-20T14:32:11.482+07:00',
          oldValue: 30,
          newValue: 45,
          actorSource: 'USER',
          actorName: 'สมชาย ใจดี',
          actorRole: 'owner',
        },
      ],
      totalElements: 1,
      totalPages: 1,
      size: 20,
      number: 0,
      numberOfElements: 1,
    };
    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      of({ code: 200, message: 'OK', data: page })
    );
    await store.setConfigKey('booking_max_advance_days');
    expect(store.value).toEqual(page);

    const emissions: (PageResponse<ConfigHistoryRow> | null)[] = [];
    store.data$.subscribe((v) => emissions.push(v));

    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );
    await store.setConfigKey('jump_seat_enabled');

    expect(emissions[0]).toEqual(page, 'replays the previous value first (BehaviorSubject)');
    expect(emissions).toContain(null as unknown as PageResponse<ConfigHistoryRow>);
  });

  it('does not clear the cache when setConfigKey is called with the same key again', async () => {
    await store.setConfigKey('jump_seat_enabled');

    let clearedToNull = false;
    store.data$.subscribe((v) => {
      if (v === null) {
        clearedToNull = true;
      }
    });

    await store.setConfigKey('jump_seat_enabled');
    expect(clearedToNull).withContext('same-key setConfigKey must not clear the cache').toBeFalse();
  });

  it('setPage fetches the requested (0-based) page with filter/range preserved', async () => {
    await store.setConfigKey('jump_seat_enabled');
    adminApiServiceSpy.getConfigChangeHistory.calls.reset();

    await store.setPage(2);

    expect(adminApiServiceSpy.getConfigChangeHistory).toHaveBeenCalledWith(
      'jump_seat_enabled',
      undefined,
      undefined,
      2,
      20
    );
  });

  it('setConfigKey (filter change) resets the page back to 0', async () => {
    await store.setConfigKey('jump_seat_enabled');
    await store.setPage(3);
    adminApiServiceSpy.getConfigChangeHistory.calls.reset();

    await store.setConfigKey('booking_max_advance_days');

    expect(adminApiServiceSpy.getConfigChangeHistory).toHaveBeenCalledWith(
      'booking_max_advance_days',
      undefined,
      undefined,
      0,
      20
    );
  });

  it('a 200 response with a missing data field falls back to a fully-populated zero PageResponse, never null', async () => {
    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      // response.data itself missing — a malformed-but-200 response, distinct
      // from an HTTP error (which the base AdminCollectionStore.run() catches
      // separately and keeps the prior cached value for).
      of({ code: 200, message: 'OK' } as unknown as { code: number; message: string; data: PageResponse<ConfigHistoryRow> })
    );

    await store.refresh();

    expect(store.value).toEqual({
      content: [],
      totalElements: 0,
      totalPages: 0,
      size: 20,
      number: 0,
      numberOfElements: 0,
    });
  });

  it('an HTTP failure keeps the prior cached value (base store contract), rather than nulling it', async () => {
    const page: PageResponse<ConfigHistoryRow> = {
      content: [
        {
          id: 1,
          configKey: 'jump_seat_enabled',
          operation: 'UPDATE',
          changedAt: '2026-07-20T14:32:11.482+07:00',
          oldValue: true,
          newValue: false,
          actorSource: 'SYSTEM',
          actorName: null,
          actorRole: null,
        },
      ],
      totalElements: 1,
      totalPages: 1,
      size: 20,
      number: 0,
      numberOfElements: 1,
    };
    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      of({ code: 200, message: 'OK', data: page })
    );
    await store.refresh();
    expect(store.value).toEqual(page);

    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );
    await store.refresh();

    expect(store.value).toEqual(page);
  });

  it('surfaces the server errorCode via lastErrorCode on a failed fetch', async () => {
    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errorCode: 'CONFIG_HISTORY_RANGE_INVALID' },
          })
      )
    );

    await store.refresh();

    expect(store.lastErrorCode).toBe('CONFIG_HISTORY_RANGE_INVALID');
  });

  it('clears lastErrorCode on a subsequent successful fetch', async () => {
    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      throwError(
        () => new HttpErrorResponse({ status: 400, error: { errorCode: 'CONFIG_HISTORY_RANGE_INVALID' } })
      )
    );
    await store.refresh();
    expect(store.lastErrorCode).toBe('CONFIG_HISTORY_RANGE_INVALID');

    adminApiServiceSpy.getConfigChangeHistory.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );
    await store.refresh();

    expect(store.lastErrorCode).toBeNull();
  });
});
