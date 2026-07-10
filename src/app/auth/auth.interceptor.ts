import { inject } from '@angular/core';
import {
  HttpEvent,
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { APP_LANGUAGE_KEY, DEFAULT_LANGUAGE } from '../shared/services/language.service';
import { SKIP_AUTH_LOGOUT } from '../shared/interceptors/http-context-tokens';
import { AlertService } from '../shared/services/alert.service';

let isHandlingAuthError = false;

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

  return next(requestWithAuth).pipe(
    mergeMap((event: HttpEvent<unknown>) => {
      if (!isAuthEndpoint && event instanceof HttpResponse) {
        if (isUnauthorizedPayload(event.body)) {
          if (!suppressAuthLogout) {
            handleUnauthorized(authService, router, alertService, appLanguage);
          }
          return throwError(
            () =>
              new HttpErrorResponse({
                status: 401,
                statusText: 'Unauthorized',
                url: req.url,
                error: event.body,
              })
          );
        }
      }

      return of(event);
    }),
    catchError((error: HttpErrorResponse) => {
      if (!isAuthEndpoint && error?.status === 401 && !suppressAuthLogout) {
        handleUnauthorized(authService, router, alertService, appLanguage);
      }

      return throwError(() => error);
    })
  );
};

function handleUnauthorized(
  authService: AuthService,
  router: Router,
  alertService: AlertService,
  appLanguage: string
): void {
  if (isHandlingAuthError) {
    return;
  }

  isHandlingAuthError = true;
  authService.setPostLoginRedirectUrl(router.url);
  authService.clearAuthData();

  const message =
    SESSION_EXPIRED_MESSAGE[appLanguage] ?? SESSION_EXPIRED_MESSAGE[DEFAULT_LANGUAGE];
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
