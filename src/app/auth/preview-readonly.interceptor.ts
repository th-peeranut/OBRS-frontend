import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { APP_LANGUAGE_KEY, DEFAULT_LANGUAGE } from '../shared/services/language.service';
import { hasOwnKey } from '../shared/lib/own-key';

/**
 * OBRS-1721 — the read-only half of the "ดูในมุมมองของ…" role preview.
 *
 * The preview renders another role's layout over the VIEWER'S OWN data: the
 * backend scopes every staff/owner query by the authenticated identity, not by
 * the role the frontend is pretending to have. So a write issued from a preview
 * would be a real write, made by the real user, from a screen that is telling
 * them they are somebody else — and nothing server-side would stop it, because
 * the backend hierarchy (ROLE_ADMIN > ROLE_OWNER > ROLE_SALESPERSON >
 * ROLE_DRIVER) means the real role already passes every previewed role's
 * @PreAuthorize. Disabling buttons is not enough for the same reason: it is one
 * missed button away from being no gate at all. This is the gate.
 *
 * Registered LAST in app.module.ts so `errorInterceptor` (which wraps it) still
 * sees the rejection and shows the message below as the usual global toast.
 *
 * Accepted consequence, agreed on the card: the sell/write flows cannot be
 * exercised while previewing. That is the trade, not a bug.
 *
 * NOT a security boundary — see docs/adr/0042-view-as-role-preview.md.
 */
const BLOCKED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** The only /api/auth/ paths a preview may still write to — session upkeep. */
const ALLOWED_AUTH_PATHS = ['/api/auth/refresh', '/api/auth/logout'];

/**
 * Inline (non-ngx-translate) copy, for the reason `auth.interceptor.ts` spells
 * out on SESSION_EXPIRED_MESSAGE: injecting TranslateService into an
 * interceptor re-enters it through its own HTTP loader (NG0200) and has broken
 * i18n app-wide twice. Mirrors ROLE_PREVIEW.BLOCKED in
 * public/i18n/{en,th,zh}.json — keep both in sync if the copy changes.
 * Exported so the spec asserts against this same source of truth.
 */
export const PREVIEW_READONLY_MESSAGE: Record<string, string> = {
  en: 'You are viewing as another role, so nothing can be saved. Exit the preview first.',
  th: 'คุณกำลังดูในมุมมองของบทบาทอื่น จึงบันทึกข้อมูลไม่ได้ กรุณาออกจากมุมมองนี้ก่อน',
  zh: '您正在以其他角色预览，因此无法保存任何更改。请先退出预览。',
};

export const previewReadonlyInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);

  // Two endpoints are exempt, and ONLY these two: the session's own upkeep is
  // not the previewed role's doing. Blocking POST /api/auth/refresh would sign
  // the viewer out mid-preview, and POST /api/auth/logout is how they leave.
  //
  // Deliberately not the whole `/api/auth/` prefix, which this check used to
  // exempt: that prefix also covers change-email/confirm, change-email/resend,
  // password-reset/request and password-reset/confirm — real credential writes,
  // reachable from the viewer's own account pages, which they can walk to while
  // a preview is running. The exemption has to be the two the reason names.
  const isSessionUpkeep = ALLOWED_AUTH_PATHS.some((path) => req.url.includes(path));
  const isBlockable =
    req.url.includes('/api/') &&
    !isSessionUpkeep &&
    BLOCKED_METHODS.includes(req.method.toUpperCase());

  if (!isBlockable || !authService.getPreviewRole()) {
    return next(req);
  }

  // Raw localStorage read, never LanguageService — same cycle avoidance as the
  // message map above. hasOwnKey, not a bare lookup: the stored value is
  // user-editable and `['constructor']` would resolve to the Object function
  // (OBRS-601).
  const appLanguage = localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE;
  const message = hasOwnKey(PREVIEW_READONLY_MESSAGE, appLanguage)
    ? PREVIEW_READONLY_MESSAGE[appLanguage]
    : PREVIEW_READONLY_MESSAGE[DEFAULT_LANGUAGE];

  return throwError(
    () =>
      new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
        url: req.url,
        error: { message },
      })
  );
};
