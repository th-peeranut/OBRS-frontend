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

let isHandlingAuthError = false;

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const appLanguage = localStorage.getItem('app_language') || 'th';
  const isAuthEndpoint = req.url.includes('/api/auth/');

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
          handleUnauthorized(authService, router);
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
      if (!isAuthEndpoint && error?.status === 401) {
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
