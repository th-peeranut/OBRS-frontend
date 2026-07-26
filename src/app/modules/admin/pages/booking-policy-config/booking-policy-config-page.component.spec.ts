import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { BookingPolicyConfigPageComponent } from './booking-policy-config-page.component';
import { BookingPolicyConfigDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

const CONFIG: BookingPolicyConfigDto = {
  maxAdvanceDays: 30,
  cutoffMinutes: 20,
};

function makeStoreStub() {
  const data$ = new BehaviorSubject<BookingPolicyConfigDto | null>(null);
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
  const component = new BookingPolicyConfigPageComponent(
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('BookingPolicyConfigPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent({ getBookingPolicyConfig: jasmine.createSpy() });

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('loads the store values into the form on the first emission, maxAdvanceDays first', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    expect(component.bookingPolicyConfigForm.get('maxAdvanceDays')?.value).toBe(30);
    expect(component.bookingPolicyConfigForm.get('cutoffMinutes')?.value).toBe(20);
    expect(component.bookingPolicyConfigForm.pristine).toBeTrue();
    // maxAdvanceDays is declared first in the form group, matching the
    // reading order of the public policy copy (UX spec).
    expect(Object.keys(component.bookingPolicyConfigForm.controls)[0]).toBe('maxAdvanceDays');
  });

  it('later store emissions only patch controls that are still pristine (in-progress edits survive)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(60);

    // Background revalidate lands with different values for both fields.
    store.data$.next({ maxAdvanceDays: 45, cutoffMinutes: 25 });

    expect(component.bookingPolicyConfigForm.get('maxAdvanceDays')?.value).toBe(60);
    expect(component.bookingPolicyConfigForm.get('cutoffMinutes')?.value).toBe(25);
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must drop the cached
  // `config` reference, but must NOT touch the live reactive form or
  // hasLoadedOnce — resetting a form the admin may be mid-edit on a logout
  // emit would be a behavior change, out of scope for this null-handling
  // sweep (unlike the list-page sweep sites, where clearing IS the whole fix).
  it('drops the cached config but leaves the form and hasLoadedOnce untouched on a null emission (OBRS-506)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    expect(component.config).toEqual(CONFIG);
    expect(component['hasLoadedOnce']).toBeTrue();

    // Simulate an in-progress edit surviving the clear — this must NOT be wiped.
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(60);

    store.data$.next(null);

    expect(component.config)
      .withContext('the discarded cache must not still read as the previous config')
      .toBeNull();
    expect(component.bookingPolicyConfigForm.get('maxAdvanceDays')?.value)
      .withContext('a null emission must not reset the live form / wipe an in-progress edit')
      .toBe(60);
    expect(component['hasLoadedOnce'])
      .withContext('hasLoadedOnce must not be flipped back by a null emission')
      .toBeTrue();
  });

  describe('integerRangeValidator(1, 365) on maxAdvanceDays rejects invalid input (Save stays disabled)', () => {
    it('rejects blank with `required` -> ADMIN.VALIDATION.REQUIRED', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(null);

      const field = component.bookingPolicyConfigForm.get('maxAdvanceDays');
      expect(field?.invalid).toBeTrue();
      expect(field?.hasError('required')).toBeTrue();
      expect(component.errorKey('maxAdvanceDays')).toBe('ADMIN.VALIDATION.REQUIRED');
    });

    it('rejects a decimal (1.5) with `notInteger` -> WHOLE_NUMBER message', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(1.5);

      const field = component.bookingPolicyConfigForm.get('maxAdvanceDays');
      expect(field?.invalid).toBeTrue();
      expect(field?.hasError('notInteger')).toBeTrue();
      expect(component.errorKey('maxAdvanceDays')).toBe('ADMIN.VALIDATION.WHOLE_NUMBER');
    });

    it('rejects 0 (below min 1) with `outOfRange:{min:1,max:365}` -> INTEGER_RANGE', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(0);

      const field = component.bookingPolicyConfigForm.get('maxAdvanceDays');
      expect(field?.invalid).toBeTrue();
      expect(field?.errors?.['outOfRange']).toEqual({ min: 1, max: 365 });
      expect(component.errorKey('maxAdvanceDays')).toBe('ADMIN.VALIDATION.INTEGER_RANGE');
      expect(component.errorParams('maxAdvanceDays')).toEqual({ min: 1, max: 365 });
    });

    it('rejects 366 (above max 365) with `outOfRange:{min:1,max:365}` -> INTEGER_RANGE', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(366);

      const field = component.bookingPolicyConfigForm.get('maxAdvanceDays');
      expect(field?.invalid).toBeTrue();
      expect(field?.errors?.['outOfRange']).toEqual({ min: 1, max: 365 });
    });

    it('accepts the boundary values 1 and 365', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      const field = component.bookingPolicyConfigForm.get('maxAdvanceDays');
      field?.setValue(1);
      expect(field?.valid).toBeTrue();
      field?.setValue(365);
      expect(field?.valid).toBeTrue();
    });
  });

  describe('integerRangeValidator(1, 1440) on cutoffMinutes rejects invalid input', () => {
    it('rejects 1441 (above max 1440) with `outOfRange:{min:1,max:1440}` -> INTEGER_RANGE', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      component.bookingPolicyConfigForm.get('cutoffMinutes')?.setValue(1441);

      const field = component.bookingPolicyConfigForm.get('cutoffMinutes');
      expect(field?.invalid).toBeTrue();
      expect(field?.errors?.['outOfRange']).toEqual({ min: 1, max: 1440 });
      expect(component.errorKey('cutoffMinutes')).toBe('ADMIN.VALIDATION.INTEGER_RANGE');
    });

    it('accepts the boundary values 1 and 1440', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next({ ...CONFIG });

      const field = component.bookingPolicyConfigForm.get('cutoffMinutes');
      field?.setValue(1);
      expect(field?.valid).toBeTrue();
      field?.setValue(1440);
      expect(field?.valid).toBeTrue();
    });
  });

  it('a valid edit makes the form valid and dirty (Save enabled)', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(45);

    expect(component.bookingPolicyConfigForm.valid).toBeTrue();
    expect(component.bookingPolicyConfigForm.pristine).toBeFalse();
  });

  it('marks all fields touched, warns, and moves focus to the first invalid control when the form is invalid on save', async () => {
    const { component, alert } = makeComponent({ updateBookingPolicyConfig: jasmine.createSpy() });
    const focusSpy = jasmine.createSpy('focus');
    component.maxAdvanceDaysInput = { nativeElement: { focus: focusSpy } };

    component.ngOnInit();
    // Fields start null -> invalid (required).
    await component.save();

    expect(alert.warning).toHaveBeenCalledWith('ADMIN.VALIDATION.FORM_INVALID');
    expect(component.bookingPolicyConfigForm.get('maxAdvanceDays')?.touched).toBeTrue();
    expect(component.bookingPolicyConfigForm.get('cutoffMinutes')?.touched).toBeTrue();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('focuses cutoffMinutes when only that field is invalid', async () => {
    const { component, store } = makeComponent({ updateBookingPolicyConfig: jasmine.createSpy() });
    const maxAdvanceDaysFocusSpy = jasmine.createSpy('maxAdvanceDaysFocus');
    const cutoffMinutesFocusSpy = jasmine.createSpy('cutoffMinutesFocus');
    component.maxAdvanceDaysInput = { nativeElement: { focus: maxAdvanceDaysFocusSpy } };
    component.cutoffMinutesInput = { nativeElement: { focus: cutoffMinutesFocusSpy } };

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    component.bookingPolicyConfigForm.get('cutoffMinutes')?.setValue(9999);
    component.bookingPolicyConfigForm.get('cutoffMinutes')?.markAsDirty();

    await component.save();

    expect(cutoffMinutesFocusSpy).toHaveBeenCalled();
    expect(maxAdvanceDaysFocusSpy).not.toHaveBeenCalled();
  });

  it('on save success: calls updateBookingPolicyConfig with the FULL payload, shows the success alert, marks the form pristine, and refreshes the store', async () => {
    const updateSpy = jasmine
      .createSpy('updateBookingPolicyConfig')
      .and.returnValue(of({ code: 200, message: 'OK', data: CONFIG }));
    const { component, store, alert } = makeComponent({ updateBookingPolicyConfig: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(45);

    await component.save();

    // Full object match (not objectContaining) — a builder that conditionally
    // omits a field would pass a partial match but fail the real PUT's
    // required-field validation (design-system/DEV-GOTCHAS payload-builder
    // gotcha).
    expect(updateSpy).toHaveBeenCalledOnceWith({
      maxAdvanceDays: 45,
      cutoffMinutes: 20,
    });
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.UPDATED');
    expect(component.bookingPolicyConfigForm.pristine).toBeTrue();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('on save failure: shows the error alert and does not mark the form pristine', async () => {
    const updateSpy = jasmine
      .createSpy('updateBookingPolicyConfig')
      .and.returnValue(throwError(() => new Error('boom')));
    const { component, store, alert } = makeComponent({ updateBookingPolicyConfig: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...CONFIG });
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(45);

    await component.save();

    expect(alert.error).toHaveBeenCalled();
    expect(component.bookingPolicyConfigForm.pristine).toBeFalse();
    expect(component.bookingPolicyConfigForm.get('maxAdvanceDays')?.value).toBe(45);
  });

  it('describedBy always includes the helper id, and adds the error id only when invalid', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ ...CONFIG });

    expect(component.describedBy('maxAdvanceDays')).toBe('maxAdvanceDays-helper');

    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(0);
    component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsTouched();

    expect(component.describedBy('maxAdvanceDays')).toBe(
      'maxAdvanceDays-helper maxAdvanceDays-error'
    );
  });

  // OBRS-702: this page is the first tab of /admin/settings now, and leaving a
  // tab destroys it. The prompt keys off THIS page's own form — no other tab's
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
      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(45);

      await expectAsync(component.canDeactivate()).toBeResolvedTo(true);
      expect(alert.confirm).toHaveBeenCalledTimes(1);
    });

    it('stops asking once the edit is saved — save() clears the prompt', async () => {
      const updateSpy = jasmine
        .createSpy('updateBookingPolicyConfig')
        .and.returnValue(of(undefined));
      const { component, store, alert } = makeComponent({
        updateBookingPolicyConfig: updateSpy,
      });
      component.ngOnInit();
      store.data$.next({ ...CONFIG });
      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.markAsDirty();
      component.bookingPolicyConfigForm.get('maxAdvanceDays')?.setValue(45);

      await component.save();

      expect(component.canDeactivate()).toBeTrue();
      expect(alert.confirm).not.toHaveBeenCalled();
    });
  });
});
