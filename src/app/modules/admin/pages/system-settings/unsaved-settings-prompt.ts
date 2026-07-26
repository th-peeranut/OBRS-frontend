import { FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';

/**
 * OBRS-702: the confirm every editable /admin/settings tab shows before its
 * unsaved edits are dropped.
 *
 * <p>Switching tabs is a route change, which destroys the tab being left — the
 * value typed into it is unrecoverable the moment it goes. The AC that drove
 * this is "an unsaved value must not vanish SILENTLY"; a prompt is what makes
 * the loss the user's decision. Cancelling keeps the tab open with the edit
 * intact.
 *
 * <p>A pristine form returns `true` synchronously, so the ordinary case (read a
 * number, switch tabs) never sees a dialog. Every tab's `save()` marks its form
 * pristine, so a saved edit does not prompt either.
 *
 * <p>Shared rather than copied into each tab: three pages asking the same
 * question with three copies of the wording is how one of them ends up saying
 * something slightly different, and this text is a promise about what is about
 * to be destroyed.
 */
export function confirmDiscardUnsavedSettings(
  form: FormGroup,
  alertService: AlertService,
  translate: TranslateService
): boolean | Promise<boolean> {
  if (form.pristine) {
    return true;
  }

  return alertService.confirm({
    title: translate.instant('ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_TITLE'),
    text: translate.instant('ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_TEXT'),
    confirmButtonText: translate.instant('ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_CONFIRM'),
    cancelButtonText: translate.instant('ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_CANCEL'),
  });
}
