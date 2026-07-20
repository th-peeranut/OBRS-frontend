import { inject } from '@angular/core';
import {
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../services/alert.service';
import { extractApiErrorMessage, statusAlertMessageKey } from '../lib/api-error';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from './http-context-tokens';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const alertService = inject(AlertService);
  const isApiRequest = req.url.includes('/api/');
  // Resolve TranslateService lazily — only for /api/ requests. Injecting it
  // unconditionally re-enters TranslateService while its own HTTP loader
  // (GET /i18n/{lang}.json — a non-/api/ request that also flows through this
  // interceptor) is still constructing, tripping NG0200 circular DI and
  // breaking i18n app-wide on cold page load (OBRS-352). The i18n loader
  // request is never /api/ and never shows an error toast (shouldShowError
  // requires isApiRequest), so gating the inject here is behavior-preserving.
  // Mirrors the same cycle-avoidance auth.interceptor documents.
  const translate = isApiRequest ? inject(TranslateService) : null;
  const skipGlobalErrorAlert = req.context.get(SKIP_GLOBAL_ERROR_ALERT);
  const skipGlobalLoadingAlert = req.context.get(SKIP_GLOBAL_LOADING_ALERT);
  const shouldShowLoading = isApiRequest && !skipGlobalLoadingAlert;
  const shouldShowError = isApiRequest && !skipGlobalErrorAlert;

  if (shouldShowLoading) {
    // AlertService.showLoading() defaults its title to the English 'Loading...',
    // and this interceptor is its ONLY production caller — so that word was the
    // spinner every Thai and Chinese user saw on every /api/ request (OBRS-569).
    // Translating here rather than inside AlertService keeps the service free of
    // TranslateService, whose HTTP loader would otherwise re-enter this very
    // interceptor (the NG0200 cycle documented above).
    alertService.showLoading(
      translate ? translate.instant('COMMON.LOADING') : undefined
    );
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (shouldShowError) {
        // A dedicated message for the statuses whose body says nothing a user
        // can act on (0 / 429 / 502 / 503 / 504 — OBRS-216, OBRS-567); every
        // other status keeps the backend-provided text, which is written for
        // the user and must not be blanketed over.
        const statusKey = statusAlertMessageKey(error);
        // Skip the body entirely once a status key applies: on those statuses
        // the body is a ProgressEvent or the gateway's HTML, never our message.
        // Note for whoever throttles /external/otp (OBRS-136): if the backend
        // starts sending a useful 429 body ("try again in 5 minutes"), this
        // rule would suppress it — make 429 prefer the body then.
        const backendMessage = statusKey ? '' : extractApiErrorMessage(error);
        // translate is non-null here in practice (shouldShowError implies
        // isApiRequest implies it was injected), but the type says otherwise.
        const message =
          backendMessage ||
          (translate
            ? translate.instant(statusKey ?? 'COMMON.ERROR.REQUEST_FAILED')
            : 'Request failed.');
        alertService.error(message);
      }
      return throwError(() => error);
    }),
    finalize(() => {
      if (shouldShowLoading) {
        alertService.hideLoading();
      }
    })
  );
};
