import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';
import { ParcelShareConfigPageComponent } from './parcel-share-config-page.component';
import { ParcelShareOwnerConfigDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

const CONFIG: ParcelShareOwnerConfigDto = {
  driverPct: 40,
  driverPctConfigured: true,
  salespersonPct: 20,
  salespersonPctConfigured: true,
};

function makeStoreStub() {
  const data$ = new BehaviorSubject<ParcelShareOwnerConfigDto | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate'),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub()) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
  };
  const component = new ParcelShareConfigPageComponent(
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('ParcelShareConfigPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  // OBRS-960: "not configured" banner whenever EITHER field is still false.
  describe('isNotConfigured', () => {
    it('is false when both fields are configured', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(CONFIG);
      expect(component['isNotConfigured']).toBeFalse();
    });

    it('is true when driverPctConfigured is false', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG, driverPctConfigured: false });
      expect(component['isNotConfigured']).toBeTrue();
    });

    it('is true when salespersonPctConfigured is false', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG, salespersonPctConfigured: false });
      expect(component['isNotConfigured']).toBeTrue();
    });
  });

  // Client-side sum > 100 guard mirroring the server's rule.
  describe('sumExceeds100', () => {
    it('is false for a sum of exactly 100', () => {
      const { component } = makeComponent({});
      component.form.patchValue({ driverPct: 60, salespersonPct: 40 });
      expect(component['sumExceeds100']).toBeFalse();
    });

    it('is true for a sum over 100', () => {
      const { component } = makeComponent({});
      component.form.patchValue({ driverPct: 60, salespersonPct: 41 });
      expect(component['sumExceeds100']).toBeTrue();
    });

    it('blocks save() when the sum exceeds 100 — never calls updateParcelShareOwnerConfig', async () => {
      const updateSpy = jasmine.createSpy('updateParcelShareOwnerConfig');
      const { component } = makeComponent({ updateParcelShareOwnerConfig: updateSpy });
      component.ngOnInit();
      component.form.patchValue({ driverPct: 60, salespersonPct: 41 });

      await component['save']();

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // Card 2: repair — source is a FIXED literal, never user-selectable.
  describe('runRepair', () => {
    it('posts the fixed source literal and stores the result persistently', async () => {
      const repairSpy = jasmine.createSpy('repairParcelShare').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { parcelsRepaired: 3, entriesRepaired: 6, driverPctApplied: 40, salespersonPctApplied: 20 },
        })
      );
      const { component, alert } = makeComponent({ repairParcelShare: repairSpy });
      alert.confirm.and.resolveTo(true);

      await component['runRepair']();

      expect(repairSpy).toHaveBeenCalledWith({ source: 'OWNER_SETTINGS_PARCEL_SHARE' });
      expect(component['repairResult']).toEqual({
        parcelsRepaired: 3,
        entriesRepaired: 6,
        driverPctApplied: 40,
        salespersonPctApplied: 20,
      });
    });

    it('does not call the API when the confirm dialog is dismissed', async () => {
      const repairSpy = jasmine.createSpy('repairParcelShare');
      const { component, alert } = makeComponent({ repairParcelShare: repairSpy });
      alert.confirm.and.resolveTo(false);

      await component['runRepair']();

      expect(repairSpy).not.toHaveBeenCalled();
    });
  });
});
