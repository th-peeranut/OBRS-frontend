import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AlertService } from '../services/alert.service';

const API_TIMEOUT_MS = 120_000;

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const alertService = inject(AlertService);
  const shouldAlert = req.url.includes('/api/');
  const request$ = shouldAlert
    ? next(req).pipe(timeout(API_TIMEOUT_MS))
    : next(req);

  return request$.pipe(
    catchError((error: unknown) => {
      if (shouldAlert) {
        const message = getErrorMessage(error) || 'Request failed.';
        alertService.error(message);
      }
      return throwError(() => error);
    })
  );
};

function getErrorMessage(error: unknown): string {
  if (error instanceof TimeoutError) {
    return 'Request timed out after 1 minute.';
  }

  if (error instanceof HttpErrorResponse) {
    if (error.error == null) {
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

  if (error instanceof Error) {
    return error.message;
  }

  return '';
}
