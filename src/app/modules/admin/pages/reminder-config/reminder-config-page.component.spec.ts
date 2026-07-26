import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ReminderConfigPageComponent } from './reminder-config-page.component';
import { ReminderConfigDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

const CONFIG: ReminderConfigDto = {
  reminderHoursBeforeDeparture: 24,
  boardingReminderMinutesBeforeDeparture: 45,
};

function makeStoreStub() {
  const data$ = new BehaviorSubject<ReminderConfigDto | null>(null);
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
    // OBRS-702: the unsaved-changes prompt shown when this tab is left.
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
  };
  const component = new ReminderConfigPageComponent(
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('ReminderConfigPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent({ getReminderConfig: jasmine.createSpy() });

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('loads the store values into the form on the first emission', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    expect(component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.value).toBe(24);
    expect(
      component.reminderConfigForm.get('boardingReminderMinutesBeforeDeparture')?.value
    ).toBe(45);
    expect(component.reminderConfigForm.pristine).toBeTrue();
  });

  it('later store emissions only patch controls that are still pristine (in-progress edits survive)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(30);

    // Background revalidate lands with a different value for both fields.
    store.data$.next({ reminderHoursBeforeDeparture: 24, boardingReminderMinutesBeforeDeparture: 60 });

    expect(component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.value).toBe(30);
    expect(
      component.reminderConfigForm.get('boardingReminderMinutesBeforeDeparture')?.value
    ).toBe(60);
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

    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(30);

    store.data$.next(null);

    expect(component.config)
      .withContext('the discarded cache must not still read as the previous config')
      .toBeNull();
    expect(component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.value)
      .withContext('a null emission must not reset the live form / wipe an in-progress edit')
      .toBe(30);
    expect(component['hasLoadedOnce'])
      .withContext('hasLoadedOnce must not be flipped back by a null emission')
      .toBeTrue();
  });

  describe('positiveIntegerValidator rejects invalid input (Save stays disabled)', () => {
    it('rejects a decimal (1.5) with `notInteger` -> WHOLE_NUMBER message (NOT "must be > 0", since 1.5 IS > 0)', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(1.5);

      const field = component.reminderConfigForm.get('reminderHoursBeforeDeparture');
      expect(field?.invalid).toBeTrue();
      expect(field?.hasError('notInteger')).toBeTrue();
      expect(component.errorKey('reminderHoursBeforeDeparture')).toBe('ADMIN.VALIDATION.WHOLE_NUMBER');
      expect(component.reminderConfigForm.invalid).toBeTrue();
    });

    [0, -5].forEach((invalidValue) => {
      it(`rejects ${invalidValue} with \`positiveNumber\` -> POSITIVE_NUMBER message`, () => {
        const { component, store } = makeComponent({});
        component.ngOnInit();
        store.data$.next({ ...CONFIG });

        component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(invalidValue);

        const field = component.reminderConfigForm.get('reminderHoursBeforeDeparture');
        expect(field?.invalid).toBeTrue();
        expect(field?.hasError('positiveNumber')).toBeTrue();
        expect(component.errorKey('reminderHoursBeforeDeparture')).toBe(
          'ADMIN.VALIDATION.POSITIVE_NUMBER'
        );
        expect(component.reminderConfigForm.invalid).toBeTrue();
      });
    });

    it('rejects an empty value', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(null);

      expect(component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.invalid).toBeTrue();
      expect(component.reminderConfigForm.invalid).toBeTrue();
    });
  });

  it('a valid edit makes the form valid and dirty (Save enabled)', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(12);

    expect(component.reminderConfigForm.valid).toBeTrue();
    expect(component.reminderConfigForm.pristine).toBeFalse();
  });

  it('marks all fields touched and warns when the form is invalid on save', async () => {
    const { component, alert } = makeComponent({ updateReminderConfig: jasmine.createSpy() });

    component.ngOnInit();
    // Fields are required and start null -> invalid.
    await component.save();

    expect(alert.warning).toHaveBeenCalledWith('ADMIN.VALIDATION.FORM_INVALID');
    expect(
      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.touched
    ).toBeTrue();
  });

  it('on save success: calls updateReminderConfig, shows the success alert, marks the form pristine, and refreshes the store', async () => {
    const updateSpy = jasmine
      .createSpy('updateReminderConfig')
      .and.returnValue(of({ code: 200, message: 'OK', data: CONFIG }));
    const { component, store, alert } = makeComponent({ updateReminderConfig: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(12);

    await component.save();

    expect(updateSpy).toHaveBeenCalledOnceWith({
      reminderHoursBeforeDeparture: 12,
      boardingReminderMinutesBeforeDeparture: 45,
    });
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.UPDATED');
    expect(component.reminderConfigForm.pristine).toBeTrue();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('on save failure: shows the error alert and does not mark the form pristine', async () => {
    const updateSpy = jasmine
      .createSpy('updateReminderConfig')
      .and.returnValue(throwError(() => new Error('boom')));
    const { component, store, alert } = makeComponent({ updateReminderConfig: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
    component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(12);

    await component.save();

    expect(alert.error).toHaveBeenCalled();
    expect(component.reminderConfigForm.pristine).toBeFalse();
    // The admin's typed value must survive the failed save.
    expect(component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.value).toBe(12);
  });

  // OBRS-702: this page is a tab of /admin/settings now, and leaving a tab
  // destroys it. The prompt keys off THIS page's own form — no other tab's
  // state can make it fire or stay silent.
  describe('canDeactivate (OBRS-702 tab switch)', () => {
    it('leaves silently while nothing has been typed', () => {
      const { component, store, alert } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      expect(component.canDeactivate()).toBeTrue();
      expect(alert.confirm).not.toHaveBeenCalled();
    });

    it('asks once a value has been edited but not saved', async () => {
      const { component, store, alert } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });
      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(12);

      await expectAsync(component.canDeactivate()).toBeResolvedTo(true);
      expect(alert.confirm).toHaveBeenCalledTimes(1);
    });

    it('stops asking once the edit is saved — save() clears the prompt', async () => {
      const updateSpy = jasmine.createSpy('updateReminderConfig').and.returnValue(of(undefined));
      const { component, store, alert } = makeComponent({ updateReminderConfig: updateSpy });
      component.ngOnInit();
      store.data$.next({ ...CONFIG });
      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.markAsDirty();
      component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(12);

      await component.save();

      expect(component.canDeactivate()).toBeTrue();
      expect(alert.confirm).not.toHaveBeenCalled();
    });
  });
});
