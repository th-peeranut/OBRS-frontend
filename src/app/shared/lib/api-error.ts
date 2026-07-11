import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extracts a human-readable message from a failed HTTP call.
 *
 * Prefers the backend's `ApiErrorResponse.message` (a localized, actionable
 * reason such as "Lookup with category: ... and slug: ... already exists"),
 * falling back through the raw string body and the transport-level message.
 * Returns '' when nothing usable is present so callers can supply their own
 * generic fallback.
 *
 * Shared by the global error interceptor and by feature pages (e.g. admin
 * screens) that opt out of the global error alert via SKIP_GLOBAL_ERROR_ALERT
 * and render their own alert — so both surface the same backend message.
 */
export function extractApiErrorMessage(error: unknown): string {
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

/**
 * Maps a transport-level HTTP status to a dedicated i18n message key for the
 * global error alert, or null when the backend-provided message should be used.
 *
 * A 503 (Service Unavailable) means a dependency outage (DB unreachable / pool
 * exhausted — see OBRS-210), for which the backend returns a generic
 * `UNEXPECTED_ERROR` body that reads like a code fault. Surfacing a dedicated
 * "temporarily unavailable, try again later" message is clearer and honest
 * about it being transient. Every other status returns null so its handling
 * (the backend message via extractApiErrorMessage) is unchanged.
 */
export function statusAlertMessageKey(error: unknown): string | null {
  if (error instanceof HttpErrorResponse && error.status === 503) {
    return 'COMMON.ERROR.SERVICE_UNAVAILABLE';
  }
  return null;
}
