import { inject } from '@angular/core';
import {
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../services/alert.service';
import { extractApiErrorMessage, statusAlertMessageKey } from '../lib/api-error';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from './http-context-tokens';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const alertService = inject(AlertService);
  const translate = inject(TranslateService);
  const isApiRequest = req.url.includes('/api/');
  const skipGlobalErrorAlert = req.context.get(SKIP_GLOBAL_ERROR_ALERT);
  const skipGlobalLoadingAlert = req.context.get(SKIP_GLOBAL_LOADING_ALERT);
  const shouldShowLoading = isApiRequest && !skipGlobalLoadingAlert;
  const shouldShowError = isApiRequest && !skipGlobalErrorAlert;

  if (shouldShowLoading) {
    alertService.showLoading();
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (shouldShowError) {
        // A dedicated message for transient-outage statuses (503 -> dependency
        // outage, OBRS-216); every other status keeps the backend-provided text.
        const statusKey = statusAlertMessageKey(error);
        const message = statusKey
          ? translate.instant(statusKey)
          : extractApiErrorMessage(error) || 'Request failed.';
        alertService.error(message);
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
