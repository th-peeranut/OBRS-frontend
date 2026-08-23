import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEventType,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Subscription, throwError } from 'rxjs';
import { catchError, finalize, tap, timeout } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../services/alert.service';
import { readStoredLanguage } from '../services/language.service';
import { resolveApiAlertMessage } from '../lib/api-error';
import {
  ApiLatencyTelemetryService,
  ApiRequestOutcome,
} from '../../services/analytics/api-latency-telemetry.service';
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
 *
 * ⚠️ THIS NUMBER IS STILL A JUDGEMENT CALL, AND OBRS-1223 IS THE CARD THAT ENDS THAT.
 * The baseline above is one endpoint measured from a wired desktop; the ceiling has to
 * cover a customer's phone on mobile data, which nobody has measured. So it defends
 * "unlikely to kill anything" and does NOT defend "why 30 and not 15 or 60".
 * `ApiLatencyTelemetryService` now counts what customers actually wait, and
 * `docs/api-latency-telemetry.md` is how to read it. WHEN THAT DATA EXISTS, REPLACE
 * THIS PARAGRAPH AND THE ONE ABOVE with a citation of it — including if the answer
 * turns out to be 30s, because then it will be a measurement rather than this.
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
  /** Live language binding for this request's overlay title — see below (OBRS-930). */
  let titleSub: Subscription | null = null;

  if (shouldShowLoading) {
    // AlertService.showLoading() used to default its title to the English
    // 'Loading...', and this interceptor is its ONLY production caller — so that
    // word was the spinner every Thai and Chinese user saw on every /api/
    // request (OBRS-569). OBRS-930 emptied that default rather than restoring it
    // here, for the reason written on the parameter.
    // Translating here rather than inside AlertService keeps the service free of
    // TranslateService, whose HTTP loader would otherwise re-enter this very
    // interceptor (the NG0200 cycle documented above).
    //
    // OBRS-930. Two ways this line put the wrong thing on a customer's screen,
    // and NEITHER is visible in what `instant()` returns — which is why the
    // answer is not read off its return value at all:
    //
    //   1. Before GET /i18n/{lang}.json lands there is nothing in the store, and
    //      `instant()` hands the KEY back as if it were text. That is the
    //      literal `COMMON.LOADING` on the spinner (reproduced by holding the
    //      bundle 4s).
    //   2. `getParsedResult` falls back to `defaultLang` (`th`), and
    //      `use('en')` leaves `currentLang` on the previous language until
    //      en.json finishes loading. So `instant()` answers in Thai for an
    //      English visitor and looks entirely healthy doing it.
    //
    // So the question asked is the one the card's AC3 asks: has the language the
    // CUSTOMER chose actually arrived? Nothing else may reach this overlay.
    // Until it has, the overlay opens with no title, because nothing is the only
    // string that is neither a key nor the wrong language.
    //
    // The escape hatch's own two strings go through the same door rather than
    // becoming two more keys on screen. It still opens on time (OBRS-642) — the
    // close button, Esc and outside-click all arrive — just unlabelled, and only
    // for a bundle still missing 8s in.
    const inChosenLanguage = (key: string): string | undefined => {
      if (!translate) {
        return undefined;
      }
      const chosen = readStoredLanguage();
      if (!translate.translations?.[chosen]) {
        return undefined;
      }
      const value = translate.instant(key);
      return value && value !== key ? value : undefined;
    };
    const initialTitle = inChosenLanguage('COMMON.LOADING');
    alertService.showLoading(
      initialTitle,
      inChosenLanguage('COMMON.LOADING_SLOW'),
      inChosenLanguage('COMMON.CLOSE')
    );
    // ...and a title read once stays wrong: the bundle lands a second later, the
    // whole page turns, and the overlay is still holding the string it was given
    // at open. `onLangChange` is exactly that moment — `changeLang()` fires it
    // when a pending bundle finishes loading and on every later switch — and the
    // title is RE-RESOLVED through the same gate rather than taken from the
    // event, whose payload carries the default-language fallback too.
    // `finalize` drops the subscription with the overlay it belongs to.
    if (translate) {
      titleSub = translate.onLangChange.subscribe(() => {
        const title = inChosenLanguage('COMMON.LOADING');
        if (title && title !== initialTitle) {
          alertService.updateLoadingTitle(title);
        }
      });
    }
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

  // OBRS-1223: measure exactly the population the ceiling APPLIES to, which is
  // `shouldTimeOut` and not a condition of its own. Anything carrying
  // SKIP_REQUEST_TIMEOUT is excluded for the reason it is exempt in the first
  // place — `ExportService.export()` waits while the server builds a file, so a
  // 40s reading there is the feature working, and counting it would pad the tail
  // with samples that say nothing about whether 30s is right for the requests
  // 30s can actually kill. Two conditions that must move together, so they are
  // one condition.
  const telemetry = shouldTimeOut ? inject(ApiLatencyTelemetryService) : null;
  const startedAt = telemetry ? performance.now() : 0;
  // Starts as 'cancelled' on purpose: `finalize` also runs when the caller
  // unsubscribes (a component destroyed mid-flight), and that is neither a
  // success nor a failure. Defaulting to 'ok' would quietly relabel every
  // abandoned request as a healthy one.
  let outcome: ApiRequestOutcome = 'cancelled';
  let timedOut = false;

  const response$ = shouldTimeOut
    ? next(req).pipe(
        timeout({
          each: IDEMPOTENT_REQUEST_TIMEOUT_MS,
          with: () => {
            // OBRS-1223 AC4: recorded HERE rather than sniffed out of
            // `statusText` downstream. The error below is deliberately shaped
            // like the transport's own dead-connection error so no `catchError`
            // in the app can tell them apart -- which means nothing downstream
            // CAN tell them apart either, including this counter.
            timedOut = true;
            return throwError(
              () =>
                new HttpErrorResponse({
                  status: 0,
                  statusText: 'Request timed out',
                  url: req.url,
                })
            );
          },
        })
      )
    : next(req);

  return response$.pipe(
    // OBRS-1223. `tap` and not `map`: this must not touch the stream. The
    // Response event is the only one that means the request finished on its own
    // terms -- Sent and the DownloadProgress events also flow through here.
    tap((event) => {
      if (telemetry && event.type === HttpEventType.Response) {
        outcome = 'ok';
      }
    }),
    catchError((error: unknown) => {
      if (telemetry) {
        outcome = timedOut ? 'timed_out' : 'error';
      }
      if (shouldShowError) {
        // A dedicated message for the statuses whose body says nothing a user
        // can act on (0 / 502 / 503 / 504 — OBRS-216, OBRS-567); every
        // other status keeps the backend-provided text, which is written for
        // the user and must not be blanketed over.
        // OBRS-1381: 429 used to be on that list, and the note here asked for
        // this the day a 429 body became useful. It did — our limiters name the
        // ceiling they hit — so 429 now prefers its body and falls back to the
        // generic key only when the refusal came from the edge.
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
      // OBRS-930. `onLangChange` never completes, so the overlay's language
      // binding has to be dropped with the overlay itself — same place, same
      // ending, or every /api/ call in the session leaves one behind.
      titleSub?.unsubscribe();
      if (shouldShowLoading) {
        alertService.hideLoading();
      }

      // OBRS-1223. In `finalize` because it is the ONE place that runs on every
      // ending -- response, error, and unsubscribe. A `tap({ complete })` would
      // miss the abandoned request, which is a reading we specifically want to
      // be able to tell apart from a healthy one.
      //
      // `record` swallows its own failures (AC5). That is its contract, not an
      // assumption made here: this callback runs on the success path too, so a
      // throw would turn a request that worked into one that reported an error.
      telemetry?.record({
        url: req.url,
        method: req.method,
        durationMs: performance.now() - startedAt,
        outcome,
      });
    })
  );
};
