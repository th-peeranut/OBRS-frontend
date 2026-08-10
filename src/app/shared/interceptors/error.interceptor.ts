import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../services/alert.service';
import { resolveApiAlertMessage } from '../lib/api-error';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
  SKIP_REQUEST_TIMEOUT,
} from './http-context-tokens';

/**
 * Ceiling on how long a request may stay pending before the app gives up on it
 * (OBRS-642). Nothing in this app had one: `grep -rn 'timeout(' src/app` returned 0
 * hits, so a request that never answered stayed pending until the browser itself gave
 * up — minutes — holding the global loading overlay over the page the whole time.
 *
 * ⚠️ APPLIED TO GET/HEAD ONLY, AND THAT ASYMMETRY IS THE POINT. Those are idempotent:
 * abandoning one has no effect on the server, so the worst case is an error the customer
 * can retry. A mutation is the opposite — a POST /payments aborted here would still have
 * been charged, and we would show "failed" for a booking that exists. Mutations are
 * covered by AlertService's LOADING_ESCAPE_AFTER_MS instead, which frees the SCREEN
 * without abandoning the REQUEST. Do not "simplify" this into a blanket timeout.
 *
 * 30s against a measured prod baseline of 0.15-0.26s TTFB for `GET /api/stops` (curl,
 * 3 runs, 2026-08-10) is ~115x headroom: it can only fire on a request that is dead.
 *
 * ⚠️ AND THAT MEASUREMENT COVERS ONE ENDPOINT, NOT THE FAMILY. Two exclusions exist
 * because the reasoning above does NOT transfer to them, both caught in review:
 *   - non-`/api/` requests — above all `GET /i18n/{lang}.json`. Cancelling the
 *     translation bundle at 30s leaves the app rendering raw i18n keys, which is worse
 *     than a slow load and is the OBRS-352/OBRS-930 failure mode all over again.
 *   - anything carrying `SKIP_REQUEST_TIMEOUT` — a GET whose latency IS the work, i.e.
 *     `ExportService.export()`, where the server is generating a report before it can
 *     answer. `timeout({each})` only resets per emitted HttpEvent, so with
 *     `reportProgress` off it is a time-to-first-byte limit and would abort a healthy
 *     long export.
 */
export const IDEMPOTENT_REQUEST_TIMEOUT_MS = 30_000;

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
      translate ? translate.instant('COMMON.LOADING') : undefined,
      translate ? translate.instant('COMMON.LOADING_SLOW') : undefined,
      translate ? translate.instant('COMMON.CLOSE') : undefined
    );
  }

  // OBRS-642: idempotent requests get a hard ceiling; mutations deliberately do not.
  // The reasoning is on IDEMPOTENT_REQUEST_TIMEOUT_MS above. The timeout raises the
  // same `status: 0` HttpErrorResponse the transport already raises for a dead
  // connection, rather than RxJS's own TimeoutError, so every downstream `catchError`
  // in the app keeps receiving the one error type it was written against — and
  // `resolveApiAlertMessage` maps it to the translated SERVICE_UNAVAILABLE/OFFLINE
  // text instead of leaking the English string "Timeout has occurred" to a customer.
  const isIdempotent = req.method === 'GET' || req.method === 'HEAD';
  const shouldTimeOut =
    isApiRequest && isIdempotent && !req.context.get(SKIP_REQUEST_TIMEOUT);
  const response$ = shouldTimeOut
    ? next(req).pipe(
        timeout({
          each: IDEMPOTENT_REQUEST_TIMEOUT_MS,
          with: () =>
            throwError(
              () =>
                new HttpErrorResponse({
                  status: 0,
                  statusText: 'Request timed out',
                  url: req.url,
                })
            ),
        })
      )
    : next(req);

  return response$.pipe(
    catchError((error: unknown) => {
      if (shouldShowError) {
        // A dedicated message for the statuses whose body says nothing a user
        // can act on (0 / 429 / 502 / 503 / 504 — OBRS-216, OBRS-567); every
        // other status keeps the backend-provided text, which is written for
        // the user and must not be blanketed over.
        // Note for whoever throttles /external/otp (OBRS-136): if the backend
        // starts sending a useful 429 body ("try again in 5 minutes"), this
        // rule would suppress it — make 429 prefer the body then.
        // OBRS-1072: the rule itself now lives in resolveApiAlertMessage, so a
        // page that opts out of this alert for one error code shows the same
        // text as this interceptor for every other one.
        // translate is non-null here in practice (shouldShowError implies
        // isApiRequest implies it was injected), but the type says otherwise.
        alertService.error(
          resolveApiAlertMessage(error, translate ? (k) => translate.instant(k) : null)
        );
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
