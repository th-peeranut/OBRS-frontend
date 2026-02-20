import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { AlertService } from '../services/alert.service';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const alertService = inject(AlertService);
  const shouldAlert = req.url.includes('/api/');
  if (shouldAlert) {
    alertService.showLoading();
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (shouldAlert) {
        const message = getErrorMessage(error) || 'Request failed.';
        alertService.error(message);
      }
      return throwError(() => error);
    }),
    finalize(() => {
      if (shouldAlert) {
        alertService.hideLoading();
      }
    })
  );
};

function getErrorMessage(error: unknown): string {
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
