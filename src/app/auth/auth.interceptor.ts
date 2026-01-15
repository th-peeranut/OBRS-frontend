import { inject } from '@angular/core';
import {
  HttpEvent,
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

let isHandlingAuthError = false;

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const isAuthEndpoint = req.url.includes('/api/auth/');

  const requestWithAuth = token
    ? req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`),
      })
    : req;

  return next(requestWithAuth).pipe(
    catchError((error: HttpErrorResponse) => {
      if (token && !isAuthEndpoint && error?.status === 401) {
        const message = getErrorMessage(error);
        const isJwtExpired = message.includes('JWT expired');

        if (isJwtExpired && !isHandlingAuthError) {
          isHandlingAuthError = true;
          authService.clearAuthData();

          void router.navigate(['/login']).finally(() => {
            isHandlingAuthError = false;
          });
        }
      }

      return throwError(() => error);
    })
  );
};

function getErrorMessage(error: HttpErrorResponse): string {
  if (!error || error.error == null) {
    return '';
  }

  if (typeof error.error === 'string') {
    return error.error;
  }

  if (typeof error.error?.message === 'string') {
    return error.error.message;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  return '';
}
