import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ManualRefundWorklistStore } from './manual-refund-worklist.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { PageResponse, PendingRefund } from '../../../../shared/interfaces/payment.interface';

describe('ManualRefundWorklistStore (OBRS-286)', () => {
  let store: ManualRefundWorklistStore;
  let adminApiServiceSpy: jasmine.SpyObj<AdminApiService>;
  let authStatusSubject: BehaviorSubject<boolean>;

  const emptyPage: PageResponse<PendingRefund> = {
    content: [],
    totalElements: 0,
    totalPages: 0,
    size: 20,
    number: 0,
    numberOfElements: 0,
  };

  function buildPage(overrides: Partial<PageResponse<PendingRefund>> = {}): PageResponse<PendingRefund> {
    return {
      content: [
        {
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
        },
      ],
      totalElements: 1,
      totalPages: 1,
      size: 20,
      number: 0,
      numberOfElements: 1,
      ...overrides,
    };
  }

  beforeEach(() => {
    authStatusSubject = new BehaviorSubject<boolean>(true);
    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', ['getPendingManualRefunds']);
    adminApiServiceSpy.getPendingManualRefunds.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );

    TestBed.configureTestingModule({
      providers: [
        ManualRefundWorklistStore,
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        { provide: AuthService, useValue: { authStatus$: authStatusSubject.asObservable() } },
      ],
    });

    store = TestBed.inject(ManualRefundWorklistStore);
  });

  it('fetches page 0 / size 20 on the first refresh()', async () => {
    await store.refresh();
    expect(adminApiServiceSpy.getPendingManualRefunds).toHaveBeenCalledWith(0, 20);
  });

  it('goToPage fetches the requested (0-based) page', async () => {
    await store.goToPage(2);
    expect(adminApiServiceSpy.getPendingManualRefunds).toHaveBeenCalledWith(2, 20);
  });

  // The UI spec's precedent correction: goToPage MUST clear() BEFORE
  // refresh(), or the previous page's rows flash under the new page while it
  // loads (ConfigChangeHistoryStore's F20 note).
  it('goToPage clears the cached value (no stale-page flash) when the page actually changes', async () => {
    adminApiServiceSpy.getPendingManualRefunds.and.returnValue(
      of({ code: 200, message: 'OK', data: buildPage() })
    );
    await store.goToPage(0);
    expect(store.value?.content.length).toBe(1);

    const emissions: (PageResponse<PendingRefund> | null)[] = [];
    store.data$.subscribe((v) => emissions.push(v));

    adminApiServiceSpy.getPendingManualRefunds.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );
    await store.goToPage(1);

    expect(emissions[0]).toEqual(buildPage(), 'replays the previous value first (BehaviorSubject)');
    expect(emissions).toContain(null as unknown as PageResponse<PendingRefund>);
  });

  it('does not clear the cache when goToPage is called with the same page again', async () => {
    await store.goToPage(1);

    let clearedToNull = false;
    store.data$.subscribe((v) => {
      if (v === null) clearedToNull = true;
    });

    await store.goToPage(1);
    expect(clearedToNull).withContext('same-page goToPage must not clear the cache').toBeFalse();
  });

  it('a 200 response with a missing data field falls back to a fully-populated zero PageResponse, never null', async () => {
    adminApiServiceSpy.getPendingManualRefunds.and.returnValue(
      of({ code: 200, message: 'OK' } as unknown as { code: number; message: string; data: PageResponse<PendingRefund> })
    );

    await store.refresh();

    expect(store.value).toEqual(emptyPage);
  });

  it('an HTTP failure keeps the prior cached value (base store contract), rather than nulling it', async () => {
    const page = buildPage();
    adminApiServiceSpy.getPendingManualRefunds.and.returnValue(
      of({ code: 200, message: 'OK', data: page })
    );
    await store.refresh();
    expect(store.value).toEqual(page);

    adminApiServiceSpy.getPendingManualRefunds.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );
    await store.refresh();

    expect(store.value).toEqual(page);
  });
});
