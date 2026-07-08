import { HttpErrorResponse } from '@angular/common/http';
import { ChangeStopErrorCode } from '../interfaces/change-stop.interface';

/**
 * Maps a change-stop endpoint's `error.error.errorCode` (stable UPPER_SNAKE,
 * e.g. `CHANGE_STOP_ERROR_NO_SEATS`) to its i18n key under
 * `MY_BOOKINGS.CHANGE_STOP.ERROR.*`. Mirrors `reschedule-error.ts`'s
 * `mapRescheduleErrorCode()` — branch on the stable code, never the
 * localized `message` (design-system §9).
 */
export function mapChangeStopErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    CHANGE_STOP_ERROR_NOT_CONFIRMED: 'MY_BOOKINGS.CHANGE_STOP.ERROR.NOT_CONFIRMED',
    CHANGE_STOP_ERROR_MAX_COUNT: 'MY_BOOKINGS.CHANGE_STOP.ERROR.MAX_COUNT',
    CHANGE_STOP_ERROR_WINDOW_CLOSED: 'MY_BOOKINGS.CHANGE_STOP.ERROR.WINDOW_CLOSED',
    CHANGE_STOP_ERROR_INVALID_SEGMENT: 'MY_BOOKINGS.CHANGE_STOP.ERROR.INVALID_SEGMENT',
    CHANGE_STOP_ERROR_ROUTE_MISMATCH: 'MY_BOOKINGS.CHANGE_STOP.ERROR.ROUTE_MISMATCH',
    CHANGE_STOP_ERROR_SAME_SEGMENT: 'MY_BOOKINGS.CHANGE_STOP.ERROR.SAME_SEGMENT',
    CHANGE_STOP_ERROR_NO_SEATS: 'MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS',
    CHANGE_STOP_ERROR_NET_AMOUNT_CHANGED: 'MY_BOOKINGS.CHANGE_STOP.ERROR.NET_AMOUNT_CHANGED',
    CHANGE_STOP_ERROR_UNAUTHORIZED: 'MY_BOOKINGS.CHANGE_STOP.ERROR.UNAUTHORIZED',
    CHANGE_STOP_ERROR_BOOKING_NOT_FOUND: 'MY_BOOKINGS.CHANGE_STOP.ERROR.BOOKING_NOT_FOUND',
    CHANGE_STOP_ERROR_MULTI_LEG_NOT_SUPPORTED:
      'MY_BOOKINGS.CHANGE_STOP.ERROR.MULTI_LEG_NOT_SUPPORTED',
  };

  return errorCode && knownCodes[errorCode]
    ? knownCodes[errorCode]
    : 'MY_BOOKINGS.CHANGE_STOP.ERROR.GENERIC';
}

/** `errorCode`s that are terminal for the current dialog session — the
 * booking can no longer change its stops at all, so the dialog closes and
 * this is surfaced as a toast rather than an inline banner. Every other code
 * (INVALID_SEGMENT/SAME_SEGMENT are client-guarded before any request, but
 * WINDOW_CLOSED/ROUTE_MISMATCH/NO_SEATS/NET_AMOUNT_CHANGED/UNAUTHORIZED/
 * BOOKING_NOT_FOUND/MULTI_LEG_NOT_SUPPORTED can still arrive from the
 * server) stays inline on the estimate step — mirrors reschedule's (not
 * change-seat's) terminal set, since change-stop has the same "only two
 * codes truly end the whole session" shape as reschedule. */
const TERMINAL_ERROR_CODES: readonly string[] = [
  'CHANGE_STOP_ERROR_NOT_CONFIRMED',
  'CHANGE_STOP_ERROR_MAX_COUNT',
];

export function isTerminalChangeStopError(errorCode: string | null | undefined): boolean {
  return !!errorCode && TERMINAL_ERROR_CODES.includes(errorCode);
}

/** Extracts `error.error.errorCode` from a failed change-stop HTTP call. */
export function extractChangeStopErrorCode(error: unknown): ChangeStopErrorCode {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      return code as ChangeStopErrorCode;
    }
  }
  return 'GENERIC';
}
