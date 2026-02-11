import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AlertService } from '../services/alert.service';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const alertService = inject(AlertService);
  const shouldAlert = req.url.includes('/api/');

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (shouldAlert) {
        const message = getErrorMessage(error) || 'Request failed.';
        alertService.error(message);
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
