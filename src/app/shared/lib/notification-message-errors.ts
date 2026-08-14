import { HttpErrorResponse } from '@angular/common/http';
import { PlaceholderErrorDto } from '../interfaces/notification-message-override.interface';

/**
 * OBRS-1308 — the ONE reader of `POST /notification-messages`'s 400 body
 * (system spec: `{ "data": { "reason", "missingIndices", "extraIndices",
 * "formatError" } }` — deliberately NOT the app-wide `ApiErrorResponse`
 * shape `extractApiErrorCode`/`apiErrorCode` read, since this endpoint's 400
 * carries the exact violation instead of a bare `errorCode`).
 *
 * Returns `null` for anything that doesn't look like this shape (a 4xx from
 * a different failure, a network error, …) so the caller falls through to
 * the generic `AlertService.error(SAVE_FAILED)` path — the frontend never
 * re-derives WHY a body isn't shaped like this, the backend 400 is the
 * tested authority (system spec, Business rule 3).
 */
export function extractPlaceholderError(error: unknown): PlaceholderErrorDto | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const data = (error.error as { data?: unknown } | null)?.data;
  if (data && typeof data === 'object' && 'reason' in data) {
    return data as PlaceholderErrorDto;
  }
  return null;
}
