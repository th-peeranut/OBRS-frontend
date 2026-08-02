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

describe('DriverCashRatesPageComponent', () => {
  it('subscribes to store.data$ and builds stop options from stopLookups', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({
      rates: [],
      stopLookups: [{ id: 1, category: 'stop', slug: 'bkk', translations: [{ locale: 'th', label: 'กรุงเทพ' }] }],
    });

    expect(component['stopOptions'].length).toBe(1);
    expect(component['stopOptions'][0].value).toBe('bkk');
  });

  // "the latest row per stop with effectiveFrom <= today gets a current chip"
  describe('isCurrent', () => {
    it('is true for the single row of a stop whose effectiveFrom is in the past', () => {
      const { component } = makeComponent({});
      component['rates'] = [{ id: 1, stopId: 1, stopSlug: 'bkk', effectiveFrom: '2020-01-01', ratePerHead: '20.00' }];
      expect(component['isCurrent'](component['rates'][0])).toBeTrue();
    });

    it('is false for a row whose effectiveFrom is in the FUTURE', () => {
      const { component } = makeComponent({});
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const futureStr = future.toISOString().slice(0, 10);
      component['rates'] = [{ id: 1, stopId: 1, stopSlug: 'bkk', effectiveFrom: futureStr, ratePerHead: '20.00' }];
      expect(component['isCurrent'](component['rates'][0])).toBeFalse();
    });

    it('is true only for the LATEST of two past-dated rows for the same stop', () => {
      const { component } = makeComponent({});
      component['rates'] = [
        { id: 1, stopId: 1, stopSlug: 'bkk', effectiveFrom: '2020-01-01', ratePerHead: '10.00' },
        { id: 2, stopId: 1, stopSlug: 'bkk', effectiveFrom: '2021-01-01', ratePerHead: '20.00' },
      ];
      expect(component['isCurrent'](component['rates'][0])).toBeFalse();
      expect(component['isCurrent'](component['rates'][1])).toBeTrue();
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
    component['selectedStopSlug'] = 'bkk';
    component['stopIdBySlug'] = new Map([['bkk', 1]]);
    component['effectiveFromDate'] = new Date('2026-01-01');
    component['ratePerHeadInput'] = '20.00';

    await component['submit']();

    expect(component['submitError']).toBe('ADMIN.DRIVER_CASH_RATES.ERROR.DUPLICATE');
  });
});
