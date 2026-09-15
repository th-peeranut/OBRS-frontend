import { BehaviorSubject, of, throwError } from 'rxjs';
import { ElementRef } from '@angular/core';
import { DriverCashPanelComponent } from './driver-cash-panel.component';
import { DriverCashDayRespDto } from '../../../../shared/interfaces/driver-cash.interface';
import { DriverCashDayStore } from './driver-cash-day.store';

function createStoreStub(): any {
  return {
    data$: new BehaviorSubject<any>(null),
    refreshing$: new BehaviorSubject(false),
    setScheduleId: jasmine.createSpy('setScheduleId'),
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
    mutate: jasmine.createSpy('mutate'),
    set: jasmine.createSpy('set'),
  };
}

function createStaffApiStub(): any {
  return {
    // OBRS-1073: ngOnInit calls this unconditionally now, so it must return an
    // observable in EVERY test, not only the ones that assert on it.
    getDriverCashMyDay: jasmine.createSpy('getDriverCashMyDay')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    // OBRS-1579: same reason - ngOnInit calls this unconditionally too.
    getScheduleById: jasmine.createSpy('getScheduleById')
      .and.returnValue(of({ code: 200, message: 'OK', data: { id: 42, departureDateTime: '2026-08-24T07:30:00+07:00' } })),
  };
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
  reopenCount: 0,
  reopens: [],
  hasUnmappedSalesPointRemit: false,
};

describe('DriverCashPanelComponent', () => {
  let store: any;
  let staffApi: any;
  let translate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: any;

  beforeEach(() => {
    store = createStoreStub();
    staffApi = createStaffApiStub();
    translate = createTranslateStub();
    component = new DriverCashPanelComponent(store, staffApi, translate, new ElementRef(document.createElement('div')));
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
    });

    it('stays silent on failure — a boarding list must not be covered by a banner', () => {
      staffApi.getDriverCashMyDay.and.returnValue(throwError(() => new Error('boom')));
      component.ngOnInit();
      expect(component['myDay']).toBeNull();
    });
  });

  // ── OBRS-1579: which cash box is this? ──────────────────────────────────
  // The strip printed a bare `yyyy-MM-dd` with no label, and the expense form
  // showed no date at all, so a fuel bill handed over the morning after its
  // round was keyed into TODAY's box with nothing on screen to contradict it.
  describe('boxBusinessDate — the box an entry lands in, before the box exists', () => {
    it('falls back to the SCHEDULE when the round has no box yet', () => {
      component.ngOnInit();
      expect(staffApi.getScheduleById).toHaveBeenCalledWith(42);
      // Derived the same way the backend does: Bangkok-local calendar date of
      // the departure, NOT a UTC-shifted one.
      expect(component['boxBusinessDate']).toBe('2026-08-24');
    });

    it('prefers the box own date once the box exists', () => {
      component.ngOnInit();
      component['day'] = { ...DAY_RESP, businessDate: '2026-08-01' };
      expect(component['boxBusinessDate']).toBe('2026-08-01');
    });

    it('stays silent when the schedule fetch fails - this is signposting, not the boarding list', () => {
      staffApi.getScheduleById.and.returnValue(throwError(() => new Error('boom')));
      component.ngOnInit();
      expect(component['boxBusinessDate']).toBeNull();
    });

    it('ignores a schedule with no departure rather than showing a wrong date', () => {
      staffApi.getScheduleById.and.returnValue(of({ code: 200, message: 'OK', data: { id: 42 } }));
      component.ngOnInit();
      expect(component['boxBusinessDate']).toBeNull();
    });

    /**
     * ⛔ The case the first version of this got wrong. `departureDateTime` is
     * one of the fields this API emits WITHOUT an offset
     * (`ParcelScheduleTabsPageComponent`'s doc names it), and `new Date(raw)`
     * + local getters reads the result in the VIEWER's zone while prod and SIT
     * run UTC — so the label this card exists to add could name the wrong box
     * with total confidence.
     *
     * ⚠️ Honest about what these three can and cannot catch. Only the
     * UTC-offset one below discriminates the two implementations at all, and
     * only when the runner is NOT on Bangkok time — when ambient == Bangkok
     * the old and new answers are equal for every possible input, so no spec
     * can go red here. Measured on this machine 2026-08-25:
     * `new Date('2026-08-23T18:00:00Z')` gives the 24th under Asia/Bangkok and
     * the 23rd under TZ=UTC, while this code gives the 24th under both. CI
     * runs UTC, so that is where the red would appear. `TZ=UTC` does NOT reach
     * Karma's Chrome on this box, so the local mutant run stayed green and is
     * not evidence either way.
     *
     * The other two pin the two offset-less SHAPES the API emits (`T` and
     * space separated) parse at all - `toApiOffsetDateTime` is what turns the
     * space into a `T` before anything reads it.
     */
    it('reads an offset-LESS after-midnight departure as the Bangkok calendar day', () => {
      staffApi.getScheduleById.and.returnValue(
        of({ code: 200, message: 'OK', data: { id: 42, departureDateTime: '2026-08-24T00:15:00' } })
      );
      component.ngOnInit();
      expect(component['boxBusinessDate']).toBe('2026-08-24');
    });

    it('reads the space-separated offset-less shape the same way', () => {
      staffApi.getScheduleById.and.returnValue(
        of({ code: 200, message: 'OK', data: { id: 42, departureDateTime: '2026-08-24 00:15:00' } })
      );
      component.ngOnInit();
      expect(component['boxBusinessDate']).toBe('2026-08-24');
    });

    it('reads a UTC-offset late-evening departure as the NEXT Bangkok day', () => {
      // 2026-08-23T18:00Z is 2026-08-24 01:00 in Bangkok. A plain string split
      // of the wire value would have said the 23rd.
      staffApi.getScheduleById.and.returnValue(
        of({ code: 200, message: 'OK', data: { id: 42, departureDateTime: '2026-08-23T18:00:00Z' } })
      );
      component.ngOnInit();
      expect(component['boxBusinessDate']).toBe('2026-08-24');
    });
  });

});
