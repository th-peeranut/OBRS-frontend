import { inject } from '@angular/core';
import {
  HttpEvent,
  HttpErrorResponse,
  HttpHandlerFn,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, mergeMap, shareReplay, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { APP_LANGUAGE_KEY, DEFAULT_LANGUAGE } from '../shared/services/language.service';
import { SKIP_AUTH_LOGOUT } from '../shared/interceptors/http-context-tokens';
import { AlertService } from '../shared/services/alert.service';
import { hasOwnKey } from '../shared/lib/own-key';

let isHandlingAuthError = false;

// OBRS-855: the in-flight refresh, shared by every request that hit a 401 while it was running.
// Module-level because an HttpInterceptorFn is re-invoked per request with a fresh injection
// context — there is no instance to hang this on, the same reason isHandlingAuthError lives here.
//
// It has to be shared. A booking page fires several authenticated calls at once, so an expired
// token produces N simultaneous 401s; N independent refreshes would each ROTATE, and the backend
// treats the second presentation of an already-rotated token as replay and revokes every live
// token the user has (RefreshTokenService#rotate). Unguarded, the recovery would reliably destroy
// the session it exists to save — and only under concurrency, which is to say only in production.
let refreshInFlight$: Observable<string> | null = null;

// Inline (non-ngx-translate) copy for the session-expired toast — see the
// injection-context note below for why. Mirrors AUTH.SESSION_EXPIRED in
// public/i18n/{en,th,zh}.json; keep both in sync if the copy changes.
// Exported solely so auth.interceptor.spec.ts can assert against the same
// source of truth instead of duplicating the copy in the test file.
export const SESSION_EXPIRED_MESSAGE: Record<string, string> = {
  en: 'Your session has expired. Please sign in again.',
  th: 'เซสชันของคุณหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง',
  zh: '您的登录已过期，请重新登录。',
};

// OBRS-856: the message above is a LIE when the request carried no token at all.
// A visitor who never registered can walk the whole booking flow (customer-area
// routes let guests browse by design — auth.guard.ts) and only meets the wall at
// POST /api/private/bookings, which resolves the caller server-side. Telling them
// a session "expired" describes a session they never had, and the clearAuthData()
// that came with it had nothing to clear. Same inline-map reasoning and same raw-
// localStorage lookup discipline as SESSION_EXPIRED_MESSAGE; mirrors
// AUTH.LOGIN_REQUIRED in public/i18n/{en,th,zh}.json — keep both in sync.
export const LOGIN_REQUIRED_MESSAGE: Record<string, string> = {
  en: 'Please sign in to continue.',
  th: 'กรุณาเข้าสู่ระบบเพื่อทำรายการนี้ต่อ',
  zh: '请先登录后再继续。',
};

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  // Injected here (top-level injection context), NOT inside the setTimeout in
  // handleUnauthorized() below — inject() only works synchronously during
  // construction/factory execution, so it must be captured now and passed down.
  const alertService = inject(AlertService);
  const token = authService.getToken();
  // OBRS-856: captured at REQUEST time, not response time, because that is the
  // question the 401 actually answers — "did the browser present a credential
  // that the server rejected?" A 401 on a request that sent no Authorization
  // header is the server refusing an anonymous caller, not a session dying.
  const sentCredential = !!token;
  // Read localStorage directly (NOT via LanguageService): the TranslateModule
  // HTTP loader runs this interceptor, so injecting LanguageService here — which
  // depends on TranslateService — creates a circular DI and breaks language
  // switching. The key/default constants keep it centralized without the cycle.
  // The session-expired toast below reuses this same value (via an inline
  // { en, th, zh } message map) for the same reason — no TranslateService here.
  const appLanguage = localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE;
  const isAuthEndpoint = req.url.includes('/api/auth/');
  // SKIP_AUTH_LOGOUT (independent of SKIP_GLOBAL_ERROR_ALERT, which only
  // suppresses the global toast) opts a call out of the force-logout. Only
  // genuinely public or tolerate-transient-401 calls set it — e.g. a silent
  // preview like promo-code validate (POST /api/private/promotions/validate)
  // can hit a transient 401 (a SIT cold-start blip); nuking the whole session
  // + booking over a non-critical preview is wrong — surface the error to the
  // caller instead. A genuinely dead session is still caught by the next
  // non-silent request. (OBRS-181) Every other authenticated call — including
  // ones that suppress the toast via SKIP_GLOBAL_ERROR_ALERT — still
  // force-logouts on a real 401 (OBRS-187).
  const suppressAuthLogout = req.context.get(SKIP_AUTH_LOGOUT);

  let headers = req.headers;

  if (!headers.has('Accept-Language')) {
    headers = headers.set('Accept-Language', appLanguage);
  }

  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const requestWithAuth = req.clone({ headers });

  // OBRS-855: whether a 401 on this request is worth trying to recover from rather than
  // surrendering to. Read here, once, alongside sentCredential and for the same reason — by the
  // time a response arrives, storage may have been cleared by whatever else the page was doing.
  const canAttemptRefresh = sentCredential && !!authService.getRefreshToken();

  return next(requestWithAuth).pipe(
    mergeMap((event: HttpEvent<unknown>) => {
      if (!isAuthEndpoint && event instanceof HttpResponse) {
        if (isUnauthorizedPayload(event.body)) {
          // A 200 whose BODY says 401 (OBRS-181's shape). Synthesised into the same
          // HttpErrorResponse the transport-level path produces, so both reach one recovery.
          const asError = new HttpErrorResponse({
            status: 401,
            statusText: 'Unauthorized',
            url: req.url,
            error: event.body,
          });

          if (suppressAuthLogout) {
            return throwError(() => asError);
          }

          return recoverOrSurrender(
            asError, req, headers, next, authService, router, alertService,
            appLanguage, sentCredential, canAttemptRefresh
          );
        }
      }

      return of(event);
    }),
    catchError((error: HttpErrorResponse) => {
      if (!isAuthEndpoint && error?.status === 401 && !suppressAuthLogout) {
        return recoverOrSurrender(
          error, req, headers, next, authService, router, alertService,
          appLanguage, sentCredential, canAttemptRefresh
        );
      }

      return throwError(() => error);
    })
  );
};

/**
 * OBRS-855: the 401 fork. Before this card there was only one answer to a 401 — sign the user out
 * — and for the customer this feature exists for that answer was wrong: their token had merely
 * aged past the one hour the backend issues it for, at the payment button, after they had spent
 * longer than that filling in passenger details.
 *
 * When a refresh token is held, the expired access token is exchanged for a fresh one and the
 * ORIGINAL request is replayed with it, so the 401 never reaches the page that made the call.
 * When there is no refresh token, or the exchange is refused, behaviour is exactly what it was:
 * the OBRS-187 force-logout, with OBRS-856's distinction between an expired session and a caller
 * who never had one.
 */
function recoverOrSurrender(
  error: HttpErrorResponse,
  req: HttpRequest<any>,
  headers: HttpHeaders,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router,
  alertService: AlertService,
  appLanguage: string,
  sentCredential: boolean,
  canAttemptRefresh: boolean
): Observable<HttpEvent<any>> {
  if (!canAttemptRefresh) {
    handleUnauthorized(authService, router, alertService, appLanguage, sentCredential);
    return throwError(() => error);
  }

  return sharedRefresh(authService).pipe(
    switchMap((freshToken) =>
      next(req.clone({ headers: headers.set('Authorization', `Bearer ${freshToken}`) }))
    ),
    catchError((retryError: unknown) => {
      // Two different failures land here and they are NOT interchangeable:
      //   - the exchange itself was refused (refreshSession threw, or /api/auth/refresh 401'd)
      //   - the replayed request came back 401 anyway, i.e. a brand-new token is not enough
      // Both mean the session is genuinely over, so both force-logout.
      //
      // Anything else — a 500 on the replay, a dropped connection — is NOT an auth verdict, and
      // logging the user out over it would turn a transient backend blip into a lost booking,
      // which is the same mistake OBRS-181 fixed for promo-code previews. Those propagate
      // untouched, and the caller handles them as it always did.
      const isAuthVerdict =
        !(retryError instanceof HttpErrorResponse) ||
        retryError.status === 401;

      if (isAuthVerdict) {
        handleUnauthorized(authService, router, alertService, appLanguage, sentCredential);
        return throwError(() => error);
      }

      return throwError(() => retryError);
    })
  );
}

/**
 * OBRS-855: one refresh at a time, whatever the burst looks like.
 *
 * `finalize` sits BEFORE `shareReplay` on purpose: it fires when the SOURCE settles, which
 * releases the slot as soon as the exchange is done rather than waiting for the last replayed
 * subscriber to unsubscribe. Subscribers already attached still receive the buffered value; the
 * next 401 after that starts a genuinely new exchange, which is correct — it is a new failure of
 * a token that was fresh when it was sent.
 */
function sharedRefresh(authService: AuthService): Observable<string> {
  if (!refreshInFlight$) {
    refreshInFlight$ = authService.refreshSession().pipe(
      finalize(() => {
        refreshInFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
  }

  return refreshInFlight$;
}

function handleUnauthorized(
  authService: AuthService,
  router: Router,
  alertService: AlertService,
  appLanguage: string,
  sentCredential: boolean
): void {
  if (isHandlingAuthError) {
    return;
  }

  isHandlingAuthError = true;
  // Kept on BOTH paths: the guest still has to come back to where they were
  // once they sign in, which is the whole point of not stranding them.
  authService.setPostLoginRedirectUrl(router.url);

  // OBRS-856: only a rejected credential is worth clearing. Wiping storage for
  // a visitor who never had a token is a no-op dressed up as a security action,
  // and it is what made the flow feel like it had thrown away something real.
  if (sentCredential) {
    authService.clearAuthData();
  }

  // OBRS-601 (Scrutinize): `appLanguage` is a RAW `localStorage.getItem()` —
  // never normalized into the `en|th|zh` union that every other locale-keyed
  // map in this repo relies on — so `SESSION_EXPIRED_MESSAGE['constructor']`
  // resolved to the `Object` function, which `??` accepts as present. Swal
  // rejects a non-string title, so the force-logout dialog opened blank.
  // Same map-lookup family, same user-editable-localStorage threat model as
  // `AuthService.ROLE_GRANTS` above. OBRS-856 added a second map behind the
  // same lookup — both are equally reachable from user-editable localStorage.
  const messages = sentCredential ? SESSION_EXPIRED_MESSAGE : LOGIN_REQUIRED_MESSAGE;
  const message = hasOwnKey(messages, appLanguage)
    ? messages[appLanguage]
    : messages[DEFAULT_LANGUAGE];
  void alertService.warning(message);

  setTimeout(() => {
    void router.navigate(['/login']).finally(() => {
      isHandlingAuthError = false;
    });
  });
}

function isUnauthorizedPayload(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') {
    return false;
  }

  const body = payload as { status?: unknown; message?: unknown };

  if (body.status !== 401) {
    return false;
  }

  if (typeof body.message !== 'string') {
    return true;
  }

  const normalized = body.message.toLowerCase();
  return (
    normalized.includes('authentication is required') ||
    normalized.includes('unauthorized')
  );
}
