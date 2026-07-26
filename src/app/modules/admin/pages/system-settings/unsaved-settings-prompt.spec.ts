import { FormBuilder } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { confirmDiscardUnsavedSettings } from './unsaved-settings-prompt';

/**
 * OBRS-702 — switching tabs is a route change, so the tab being left is
 * DESTROYED and anything typed into it is unrecoverable. The AC is that such a
 * value must not vanish silently; this is the prompt that makes the loss the
 * user's own decision.
 */
describe('OBRS-702 confirmDiscardUnsavedSettings', () => {
  let alertService: jasmine.SpyObj<AlertService>;
  let translate: jasmine.SpyObj<TranslateService>;

  function dirtyForm() {
    const form = new FormBuilder().group({ value: [1] });
    form.get('value')!.setValue(2);
    form.markAsDirty();
    return form;
  }

  beforeEach(() => {
    alertService = jasmine.createSpyObj<AlertService>('AlertService', ['confirm']);
    translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string | string[]) => key as string);
  });

  it('lets a pristine tab go without a dialog', () => {
    const form = new FormBuilder().group({ value: [1] });

    expect(confirmDiscardUnsavedSettings(form, alertService, translate)).toBeTrue();
    expect(alertService.confirm).not.toHaveBeenCalled();
  });

  it('lets a SAVED edit go without a dialog', () => {
    // Every tab's save() calls markAsPristine(), so the ordinary
    // edit -> Save -> switch tabs flow must not nag.
    const form = dirtyForm();
    form.markAsPristine();

    expect(confirmDiscardUnsavedSettings(form, alertService, translate)).toBeTrue();
    expect(alertService.confirm).not.toHaveBeenCalled();
  });

  it('asks before dropping an unsaved edit, and leaves when confirmed', async () => {
    alertService.confirm.and.resolveTo(true);

    await expectAsync(
      confirmDiscardUnsavedSettings(dirtyForm(), alertService, translate) as Promise<boolean>
    ).toBeResolvedTo(true);
    expect(alertService.confirm).toHaveBeenCalledTimes(1);
  });

  it('keeps the user on the tab when they cancel', () => {
    alertService.confirm.and.resolveTo(false);

    return expectAsync(
      confirmDiscardUnsavedSettings(dirtyForm(), alertService, translate) as Promise<boolean>
    ).toBeResolvedTo(false);
  });

  it('asks in the four keys the locales define', () => {
    alertService.confirm.and.resolveTo(true);

    void confirmDiscardUnsavedSettings(dirtyForm(), alertService, translate);

    expect(alertService.confirm).toHaveBeenCalledWith({
      title: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_TITLE',
      text: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_TEXT',
      confirmButtonText: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_CONFIRM',
      cancelButtonText: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_CANCEL',
    });
  });
});
