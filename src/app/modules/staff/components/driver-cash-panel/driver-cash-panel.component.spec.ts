import { BehaviorSubject, of, throwError } from 'rxjs';
import { ElementRef } from '@angular/core';
import { DriverCashPanelComponent } from './driver-cash-panel.component';
import { DriverCashDayRespDto } from '../../../../shared/interfaces/driver-cash.interface';

function createStoreStub(): any {
  return {
    data$: new BehaviorSubject<any>(null),
    refreshing$: new BehaviorSubject(false),
    setScheduleId: jasmine.createSpy('setScheduleId'),
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
    mutate: jasmine.createSpy('mutate'),
  };
}

function createStaffApiStub(): any {
  return {
    postDriverCashAdvance: jasmine.createSpy('postDriverCashAdvance'),
    postDriverCashPerHead: jasmine.createSpy('postDriverCashPerHead'),
    postDriverCashExpense: jasmine.createSpy('postDriverCashExpense'),
  };
}

function createAlertServiceStub(): any {
  return { error: jasmine.createSpy('error') };
}

function createTranslateStub(): any {
  return { instant: (key: string) => key, onLangChange: of() };
}

// OBRS-960 — CORRECTED (2026-08-02, backend reconciliation): the real,
// flat DriverCashDayRespDto. The original fixture here had `scheduleId` /
// `routeLabel` / `departureDateTime` / `currency` / a nested `summary` —
// NONE of which exist on the real DTO, and `staffApi` being loosely typed
// `any` in this spec is exactly why that never surfaced as a compile
// error. Kept typed against the real interface now so a future shape drift
// fails loudly here instead of passing on a fiction.
const DAY_RESP: DriverCashDayRespDto = {
  dayId: 1,
  driverId: 5,
  driverName: 'Somchai',
  businessDate: '2026-08-01',
  vehicleId: 42,
  status: 'OPEN',
  entries: [],
  advanceTotal: '0.00',
  perHeadTotal: '0.00',
  expensePaidTotal: '0.00',
  parcelRemitTotal: '0.00',
  expectedReturnAmount: '0.00',
  returnedAmount: null,
  returnedAt: null,
  returnedByUserId: null,
  returnedByName: null,
  discrepancy: null,
  discrepancyReason: null,
  perHeadRates: [],
  hasUnmappedSalesPointRemit: false,
};

describe('DriverCashPanelComponent', () => {
  let store: any;
  let staffApi: any;
  let alertService: any;
  let translate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: any;

  beforeEach(() => {
    store = createStoreStub();
    staffApi = createStaffApiStub();
    alertService = createAlertServiceStub();
    translate = createTranslateStub();
    component = new DriverCashPanelComponent(store, staffApi, alertService, translate, new ElementRef(document.createElement('div')));
    component.scheduleId = 42;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('sets the store scheduleId and refreshes on init', () => {
    component.ngOnInit();
    expect(store.setScheduleId).toHaveBeenCalledWith(42);
    expect(store.refresh).toHaveBeenCalled();
  });

  // ── accordion: one open at a time ─────────────────────────────────────
  describe('toggleAction — one open at a time, no modal/navigation', () => {
    it('opens an action on first tap', () => {
      component['toggleAction']('advance');
      expect(component['isActionOpen']('advance')).toBeTrue();
    });

    it('closes the SAME action on a second tap', () => {
      component['toggleAction']('advance');
      component['toggleAction']('advance');
      expect(component['isActionOpen']('advance')).toBeFalse();
    });

    it('switching to a different action closes the first (one open at a time)', () => {
      component['toggleAction']('advance');
      component['toggleAction']('perHead');
      expect(component['isActionOpen']('advance')).toBeFalse();
      expect(component['isActionOpen']('perHead')).toBeTrue();
    });
  });

  // ── submit success collapses the accordion and mutates the cache ────────
  describe('onSubmitAdvance — success path', () => {
    it('mutates the store with the fresh day and collapses the accordion', () => {
      staffApi.postDriverCashAdvance.and.returnValue(of({ code: 200, message: 'OK', data: DAY_RESP }));
      component['toggleAction']('advance');

      component['onSubmitAdvance']({ amount: '100.00' });

      expect(store.mutate).toHaveBeenCalled();
      const transform = store.mutate.calls.mostRecent().args[0];
      expect(transform(null)).toEqual(DAY_RESP);
      expect(component['isActionOpen']('advance')).toBeFalse();
      expect(component.isSubmitting).toBeFalse();
    });
  });

  // Card: "On a POST failure, never reset the form ... raise AlertService.error()."
  describe('onSubmitAdvance — failure path', () => {
    it('keeps the accordion OPEN, raises AlertService.error(), and does not mutate the store', () => {
      staffApi.postDriverCashAdvance.and.returnValue(
        throwError(() => ({ error: { errorCode: 'SOME_ERROR' } }))
      );
      component['toggleAction']('advance');

      component['onSubmitAdvance']({ amount: '100.00' });

      expect(store.mutate).not.toHaveBeenCalled();
      expect(component['isActionOpen']('advance')).toBeTrue();
      expect(alertService.error).toHaveBeenCalled();
      expect(component['advanceError']).toBeTruthy();
      expect(component.isSubmitting).toBeFalse();
    });
  });

  it('a second submit call while one is in flight is a no-op (double-tap guard)', () => {
    staffApi.postDriverCashExpense.and.returnValue(of({ code: 200, message: 'OK', data: DAY_RESP }));
    component.isSubmitting = true;

    component['onSubmitExpense']({ category: 'FUEL', amount: '10.00' });

    expect(staffApi.postDriverCashExpense).not.toHaveBeenCalled();
  });
});
