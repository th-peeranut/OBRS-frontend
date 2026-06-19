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
