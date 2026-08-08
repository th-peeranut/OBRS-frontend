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
    // OBRS-1073: ngOnInit calls this unconditionally now, so it must return an
    // observable in EVERY test, not only the ones that assert on it.
    getDriverCashMyDay: jasmine.createSpy('getDriverCashMyDay')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
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
  holderRole: 'DRIVER',
  businessDate: '2026-08-01',
  vehicleId: 42,
  status: 'OPEN',
  entries: [],
  advanceTotal: '0.00',
  perHeadTotal: '0.00',
  fareCollectedTotal: '0.00',
  cashRefundedTotal: '0.00',
  expensePaidTotal: '0.00',
  parcelRemitTotal: '0.00',
  // OBRS-992/OBRS-1053: already INSIDE expectedReturnAmount, never an addend.
  parcelClawbackTotal: '0.00',
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

  // ── OBRS-1073: the salesperson's own box must SURVIVE a reload ───────────
  // It did not. `myDay` was written only by the per-head POST handler, so the
  // block existed solely inside the tab that recorded a head — reload, open a
  // second round, or come back after lunch and the money the salesperson owes
  // tonight was invisible, while the row itself was sitting in the database.
  // Found by looking at the AFTER capture, not by any test: `GET /my-day`,
  // which this same card added, had no caller anywhere in the frontend.
  describe('loadMyDay — the caller\'s own box is fetched, not only pushed', () => {
    it('fetches my-day on init for TODAY and renders what comes back', () => {
      const MINE = { ...DAY_RESP, dayId: 7, holderRole: 'SALESPERSON' as const, perHeadTotal: '140.00' };
      staffApi.getDriverCashMyDay.and.returnValue(of({ code: 200, message: 'OK', data: MINE }));

      component.ngOnInit();

      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(staffApi.getDriverCashMyDay).toHaveBeenCalledWith(expected);
      expect(component['myDay']).toBe(MINE);
    });

    it('renders nothing and raises nothing when the caller has no box open', () => {
      staffApi.getDriverCashMyDay.and.returnValue(of({ code: 200, message: 'OK', data: null }));
      component.ngOnInit();
      expect(component['myDay']).toBeNull();
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it('stays silent on failure — a boarding list must not be covered by a banner', () => {
      staffApi.getDriverCashMyDay.and.returnValue(throwError(() => new Error('boom')));
      component.ngOnInit();
      expect(component['myDay']).toBeNull();
      expect(alertService.error).not.toHaveBeenCalled();
    });
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

  // ── OBRS-1073: the per-head response is a DIFFERENT person's day ────────
  describe('onSubmitPerHead — the caller\'s own day, never the driver\'s', () => {
    // The per-head fee is the salesperson's pay, so the POST answers about
    // THEIR box. Before this card the handler ran the same onActionSuccess as
    // advance/expense, which store.mutate()-ed that response over the driver's
    // day — swapping one person's running totals for another's on the strip
    // the salesperson reads standing at the vehicle.
    const MY_DAY = {
      ...DAY_RESP,
      dayId: 99,
      driverId: 77,
      driverName: 'Salesperson',
      holderRole: 'SALESPERSON' as const,
      perHeadTotal: '60.00',
      expectedReturnAmount: '-60.00',
    };

    it('does NOT mutate the driver-day store', () => {
      staffApi.postDriverCashPerHead.and.returnValue(of({ code: 201, message: 'Created', data: MY_DAY }));
      component['toggleAction']('perHead');

      component['onSubmitPerHead']({ stopId: 1, headCount: 3 });

      expect(store.mutate).not.toHaveBeenCalled();
    });

    it('holds the response as myDay and collapses the accordion', () => {
      staffApi.postDriverCashPerHead.and.returnValue(of({ code: 201, message: 'Created', data: MY_DAY }));
      component['toggleAction']('perHead');

      component['onSubmitPerHead']({ stopId: 1, headCount: 3 });

      expect(component['myDay']).toEqual(MY_DAY);
      expect(component['isActionOpen']('perHead')).toBeFalse();
      expect(component.isSubmitting).toBeFalse();
    });

    it('falls back to myDay for the stop list when the driver has no day yet', () => {
      const rates = [
        { stopId: 1, stopName: 'Origin', salesPointId: 11, salesPointName: 'บ้านบึง', ratePerHead: '20.00', configured: true },
      ];
      staffApi.postDriverCashPerHead.and.returnValue(
        of({ code: 201, message: 'Created', data: { ...MY_DAY, perHeadRates: rates } })
      );
      component['day'] = null;

      component['onSubmitPerHead']({ stopId: 1, headCount: 3 });

      expect(component['perHeadRates']).toEqual(rates);
    });

    it('prefers the DRIVER day for the stop list when both exist', () => {
      const driverRates = [
        { stopId: 2, stopName: 'Midway', salesPointId: null, salesPointName: null, ratePerHead: '0.00', configured: false },
      ];
      component['day'] = { ...DAY_RESP, perHeadRates: driverRates };
      component['myDay'] = { ...MY_DAY, perHeadRates: [] };

      expect(component['perHeadRates']).toEqual(driverRates);
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
