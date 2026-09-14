import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';

/**
 * OBRS-1755 — the four strings this prompt is made of, so a screen whose
 * warning has to name what it is about to destroy can supply its own without
 * forking the function. Optional and defaulted below, so every /admin/settings
 * caller is untouched.
 */
export interface UnsavedPromptKeys {
  titleKey: string;
  textKey: string;
  confirmKey: string;
  cancelKey: string;
}

const SETTINGS_PROMPT_KEYS: UnsavedPromptKeys = {
  titleKey: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_TITLE',
  textKey: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_TEXT',
  confirmKey: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_CONFIRM',
  cancelKey: 'ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_CANCEL',
};

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
 *
 * <p>OBRS-1755 widened `form` from `FormGroup` to the one member this function
 * ever read, so a screen holding its dirty state in plain fields (the "ส่งยอด"
 * tab: a typed advance, an overridden head count) can pass `{ pristine }` and
 * reuse the guard instead of open-coding a second `alertService.confirm`. Every
 * FormGroup caller is assignable to it unchanged.
 */
export function confirmDiscardUnsavedSettings(
  form: { pristine: boolean },
  alertService: AlertService,
  translate: TranslateService,
  keys: UnsavedPromptKeys = SETTINGS_PROMPT_KEYS
): boolean | Promise<boolean> {
  if (form.pristine) {
    return true;
  }

  return alertService.confirm({
    title: translate.instant(keys.titleKey),
    text: translate.instant(keys.textKey),
    confirmButtonText: translate.instant(keys.confirmKey),
    cancelButtonText: translate.instant(keys.cancelKey),
  });
}
