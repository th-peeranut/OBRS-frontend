import { BehaviorSubject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DriverCashRatesPageComponent } from './driver-cash-rates-page.component';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeStoreStub() {
  const data$ = new BehaviorSubject<any>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub()) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new DriverCashRatesPageComponent(store as any, adminApi as any, alert as any, createTranslateStub());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

function rateRow(id: number, salesPointId: number, effectiveFrom: string, ratePerHead: string) {
  return {
    id,
    salesPointId,
    salesPointCode: salesPointId === 11 ? 'BAN_BUENG' : 'MO_CHIT',
    salesPointName: salesPointId === 11 ? 'บ้านบึง' : 'หมอชิต',
    effectiveFrom,
    ratePerHead,
  };
}

describe('DriverCashRatesPageComponent', () => {
  // OBRS-1073 — the picker lists SALES POINTS, not stops. Its label is the
  // sales point's own `name` (a place name the owner wrote), deliberately not
  // run through the station-label translator the stop version used.
  it('subscribes to store.data$ and builds the picker from sales points', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({
      rates: [],
      salesPoints: [{ id: 11, code: 'BAN_BUENG', name: 'บ้านบึง' }],
    });

    expect(component['salesPointOptions'].length).toBe(1);
    expect(component['salesPointOptions'][0].value).toBe('BAN_BUENG');
    expect(component['salesPointOptions'][0].label).toBe('บ้านบึง');
  });

  // "the latest row per SALES POINT with effectiveFrom <= today gets a current chip"
  describe('isCurrent', () => {
    it('is true for the single row of a sales point whose effectiveFrom is in the past', () => {
      const { component } = makeComponent({});
      component['rates'] = [rateRow(1, 11, '2020-01-01', '20.00')];
      expect(component['isCurrent'](component['rates'][0])).toBeTrue();
    });

    it('is false for a row whose effectiveFrom is in the FUTURE', () => {
      const { component } = makeComponent({});
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const futureStr = future.toISOString().slice(0, 10);
      component['rates'] = [rateRow(1, 11, futureStr, '20.00')];
      expect(component['isCurrent'](component['rates'][0])).toBeFalse();
    });

    it('is true only for the LATEST of two past-dated rows for the same sales point', () => {
      const { component } = makeComponent({});
      component['rates'] = [rateRow(1, 11, '2020-01-01', '10.00'), rateRow(2, 11, '2021-01-01', '20.00')];
      expect(component['isCurrent'](component['rates'][0])).toBeFalse();
      expect(component['isCurrent'](component['rates'][1])).toBeTrue();
    });

    it('OBRS-1073: two sales points never shadow each other - each keeps its own current row', () => {
      const { component } = makeComponent({});
      component['rates'] = [rateRow(1, 11, '2020-01-01', '20.00'), rateRow(2, 12, '2019-01-01', '35.00')];
      // Grouping by the wrong key (or not grouping at all) would leave only the
      // globally-latest row current and silently mark หมอชิต's rate as historic.
      expect(component['isCurrent'](component['rates'][0])).toBeTrue();
      expect(component['isCurrent'](component['rates'][1])).toBeTrue();
    });
  });

  it('submits salesPointId, resolved from the selected code', async () => {
    const createSpy = jasmine
      .createSpy('createDriverCashRate')
      .and.returnValue(of({ code: 201, message: 'Created', data: null }));
    const { component } = makeComponent({ createDriverCashRate: createSpy });
    component['selectedSalesPointCode'] = 'BAN_BUENG';
    component['salesPointIdByCode'] = new Map([['BAN_BUENG', 11]]);
    component['effectiveFromDate'] = new Date(2026, 0, 1);
    component['ratePerHeadInput'] = '20.00';

    await component['submit']();

    expect(createSpy).toHaveBeenCalledWith({
      salesPointId: 11,
      effectiveFrom: '2026-01-01',
      ratePerHead: '20.00',
    });
  });

  it('maps PER_HEAD_RATE_DUPLICATE to the duplicate error key on submit', async () => {
    // extractApiErrorCode()'s instanceof HttpErrorResponse guard is load-bearing
    // (api-error-code.ts) — a plain object literal is silently rejected.
    const createSpy = jasmine.createSpy('createDriverCashRate').and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'PER_HEAD_RATE_DUPLICATE' },
          })
      )
    );
    const { component } = makeComponent({ createDriverCashRate: createSpy });
    component['selectedSalesPointCode'] = 'BAN_BUENG';
    component['salesPointIdByCode'] = new Map([['BAN_BUENG', 11]]);
    component['effectiveFromDate'] = new Date('2026-01-01');
    component['ratePerHeadInput'] = '20.00';

    await component['submit']();

    expect(component['submitError']).toBe('ADMIN.DRIVER_CASH_RATES.ERROR.DUPLICATE');
  });
});
