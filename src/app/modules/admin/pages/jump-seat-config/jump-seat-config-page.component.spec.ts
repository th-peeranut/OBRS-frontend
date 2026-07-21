import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { JumpSeatConfigPageComponent } from './jump-seat-config-page.component';
import { JumpSeatConfigDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

const CONFIG: JumpSeatConfigDto = { enabled: true };

function makeStoreStub() {
  const data$ = new BehaviorSubject<JumpSeatConfigDto | null>(null);
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
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const component = new JumpSeatConfigPageComponent(
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('JumpSeatConfigPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent({ getJumpSeatConfig: jasmine.createSpy() });

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('loads the store value into the form on the first emission', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    expect(component.jumpSeatConfigForm.get('enabled')?.value).toBe(true);
    expect(component.jumpSeatConfigForm.pristine).toBeTrue();
  });

  it('later store emissions only patch the control while it is still pristine (in-progress edit survives)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ enabled: true });

    component.jumpSeatConfigForm.get('enabled')?.markAsDirty();
    component.jumpSeatConfigForm.get('enabled')?.setValue(false);

    // Background revalidate lands with a different value.
    store.data$.next({ enabled: true });

    expect(component.jumpSeatConfigForm.get('enabled')?.value).toBe(false);
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must drop the cached
  // `config` reference, but must NOT touch the live reactive form or
  // hasLoadedOnce — resetting a form the admin may be mid-edit on a logout
  // emit would be a behavior change, out of scope for this null-handling sweep.
  it('drops the cached config but leaves the form and hasLoadedOnce untouched on a null emission (OBRS-506)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    expect(component.config).toEqual(CONFIG);
    expect(component['hasLoadedOnce']).toBeTrue();

    component.jumpSeatConfigForm.get('enabled')?.markAsDirty();
    component.jumpSeatConfigForm.get('enabled')?.setValue(false);

    store.data$.next(null);

    expect(component.config)
      .withContext('the discarded cache must not still read as the previous config')
      .toBeNull();
    expect(component.jumpSeatConfigForm.get('enabled')?.value)
      .withContext('a null emission must not reset the live form / wipe an in-progress edit')
      .toBe(false);
    expect(component['hasLoadedOnce'])
      .withContext('hasLoadedOnce must not be flipped back by a null emission')
      .toBeTrue();
  });

  it('surfaces the LOAD_FAILED message when the store errors with no cached value', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.error$.next(true);

    expect(component.errorMessage).toBe('ADMIN.JUMP_SEAT_CONFIG.LOAD_FAILED');
  });

  it('on save success: calls updateJumpSeatConfig, shows the success alert, marks the form pristine, and refreshes the store', async () => {
    const updateSpy = jasmine
      .createSpy('updateJumpSeatConfig')
      .and.returnValue(of({ code: 200, message: 'OK', data: CONFIG }));
    const { component, store, alert } = makeComponent({ updateJumpSeatConfig: updateSpy });

    component.ngOnInit();
    store.data$.next({ enabled: false });
    component.jumpSeatConfigForm.get('enabled')?.markAsDirty();
    component.jumpSeatConfigForm.get('enabled')?.setValue(true);

    await component.save();

    expect(updateSpy).toHaveBeenCalledOnceWith({ enabled: true });
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.UPDATED');
    expect(component.jumpSeatConfigForm.pristine).toBeTrue();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('on save failure: shows the error alert and does not mark the form pristine', async () => {
    const updateSpy = jasmine
      .createSpy('updateJumpSeatConfig')
      .and.returnValue(throwError(() => new Error('boom')));
    const { component, store, alert } = makeComponent({ updateJumpSeatConfig: updateSpy });

    component.ngOnInit();
    store.data$.next({ enabled: false });
    component.jumpSeatConfigForm.get('enabled')?.markAsDirty();
    component.jumpSeatConfigForm.get('enabled')?.setValue(true);

    await component.save();

    expect(alert.error).toHaveBeenCalled();
    expect(component.jumpSeatConfigForm.pristine).toBeFalse();
    expect(component.jumpSeatConfigForm.get('enabled')?.value).toBe(true);
  });
});
