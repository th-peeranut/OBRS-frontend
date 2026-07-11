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

  describe('positiveIntegerValidator rejects invalid input (Save stays disabled)', () => {
    [0, -5, 1.5].forEach((invalidValue) => {
      it(`rejects ${invalidValue}`, () => {
        const { component, store } = makeComponent({});
        component.ngOnInit();
        store.data$.next({ ...CONFIG });

        component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.setValue(invalidValue);

        expect(component.reminderConfigForm.get('reminderHoursBeforeDeparture')?.invalid).toBeTrue();
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
});
