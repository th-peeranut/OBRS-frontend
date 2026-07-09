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
import { SKIP_GLOBAL_ERROR_ALERT } from '../shared/interceptors/http-context-tokens';

let isHandlingAuthError = false;

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  // Read localStorage directly (NOT via LanguageService): the TranslateModule
  // HTTP loader runs this interceptor, so injecting LanguageService here — which
  // depends on TranslateService — creates a circular DI and breaks language
  // switching. The key/default constants keep it centralized without the cycle.
  const appLanguage = localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE;
  const isAuthEndpoint = req.url.includes('/api/auth/');
  // Silent calls (SKIP_GLOBAL_ERROR_ALERT) own their error handling and must not
  // trigger a global logout. A silent preview like promo-code validate
  // (POST /api/private/promotions/validate) can hit a transient 401 (e.g. a SIT
  // cold-start blip); nuking the whole session + booking over a non-critical
  // preview is wrong — surface the error to the caller instead. A genuinely dead
  // session is still caught by the next non-silent request. (OBRS-181)
  const suppressAuthLogout = req.context.get(SKIP_GLOBAL_ERROR_ALERT);

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
            handleUnauthorized(authService, router);
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
        handleUnauthorized(authService, router);
      }

      return throwError(() => error);
    })
  );
};

function handleUnauthorized(authService: AuthService, router: Router): void {
  if (isHandlingAuthError) {
    return;
  }

  isHandlingAuthError = true;
  authService.setPostLoginRedirectUrl(router.url);
  authService.clearAuthData();

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
