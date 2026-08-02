import { BehaviorSubject, of, throwError } from 'rxjs';
import { ElementRef } from '@angular/core';
import { DriverCashPanelComponent } from './driver-cash-panel.component';

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

const DAY_RESP = {
  scheduleId: 42,
  routeLabel: 'BKK-CNX',
  departureDateTime: '2026-08-01T08:00:00',
  currency: 'THB',
  summary: { advanceTotal: '0.00', perHeadTotal: '0.00', expenseTotal: '0.00', netCash: '0.00' },
  perHeadRates: [],
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
