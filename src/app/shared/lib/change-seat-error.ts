import { HttpErrorResponse } from '@angular/common/http';
import { ChangeSeatErrorCode } from '../interfaces/change-seat.interface';
import { HttpFallbackTier } from './http-error-fallback';

/**
 * Maps a change-seat endpoint's `error.error.errorCode` (stable UPPER_SNAKE,
 * e.g. `CHANGE_SEAT_ERROR_NO_SEATS`) to its i18n key under
 * `MY_BOOKINGS.CHANGE_SEAT.ERROR.*`. Mirrors `reschedule-error.ts`'s
 * `mapRescheduleErrorCode()` — branch on the stable code, never the localized
 * `message` (design-system §9).
 *
 * When there is NO recognized `errorCode` (network failure, backend outage,
 * or a rejected-but-code-less 4xx), `fallbackTier` picks between the two
 * generic-copy keys instead of one vague message (OBRS-170) — see
 * `classifyHttpFallback` in `http-error-fallback.ts`.
 */
export function mapChangeSeatErrorCode(
  errorCode: string | null | undefined,
  fallbackTier: HttpFallbackTier = 'ACTION_UNAVAILABLE'
): string {
  const knownCodes: Record<string, string> = {
    CHANGE_SEAT_ERROR_NOT_CONFIRMED: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.NOT_CONFIRMED',
    CHANGE_SEAT_ERROR_MAX_COUNT: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.MAX_COUNT',
    CHANGE_SEAT_ERROR_WINDOW_CLOSED: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.WINDOW_CLOSED',
    CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_UNAVAILABLE',
    CHANGE_SEAT_ERROR_NO_SEATS: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS',
    CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_NOT_IN_MAP',
    CHANGE_SEAT_ERROR_TICKET_MISMATCH: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.TICKET_MISMATCH',
    CHANGE_SEAT_ERROR_MULTI_LEG_NOT_SUPPORTED:
      'MY_BOOKINGS.CHANGE_SEAT.ERROR.MULTI_LEG_NOT_SUPPORTED',
    CHANGE_SEAT_ERROR_UNAUTHORIZED: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.UNAUTHORIZED',
    CHANGE_SEAT_ERROR_BOOKING_NOT_FOUND: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.BOOKING_NOT_FOUND',
    // OBRS-358: shared jump-seat channel-guard code (a non-staff request
    // targeting the walk-in-only seat) — the SAME `COMMON.ERROR.*` key is
    // referenced from `change-stop-error.ts`/`reschedule-error.ts` too;
    // never duplicate this string per flow.
    SEAT_ERROR_WALK_IN_ONLY: 'COMMON.ERROR.SEAT_WALK_IN_ONLY',
  };

  if (errorCode && knownCodes[errorCode]) {
    return knownCodes[errorCode];
  }

  return fallbackTier === 'SERVICE_UNAVAILABLE'
    ? 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SERVICE_UNAVAILABLE'
    : 'MY_BOOKINGS.CHANGE_SEAT.ERROR.ACTION_UNAVAILABLE';
}

/** `errorCode`s that are terminal for the current dialog session — the
 * booking can no longer have its seat changed at all, so the dialog closes
 * and this is surfaced as a toast rather than an inline banner. Every other
 * code (SEAT_UNAVAILABLE/NO_SEATS/SEAT_NOT_IN_MAP/TICKET_MISMATCH) means "the
 * seat map moved under you" — re-fetch availability and stay on the map. */
const TERMINAL_ERROR_CODES: readonly string[] = [
  'CHANGE_SEAT_ERROR_NOT_CONFIRMED',
  'CHANGE_SEAT_ERROR_MAX_COUNT',
  'CHANGE_SEAT_ERROR_WINDOW_CLOSED',
  'CHANGE_SEAT_ERROR_MULTI_LEG_NOT_SUPPORTED',
  'CHANGE_SEAT_ERROR_UNAUTHORIZED',
  'CHANGE_SEAT_ERROR_BOOKING_NOT_FOUND',
];

export function isTerminalChangeSeatError(errorCode: string | null | undefined): boolean {
  return !!errorCode && TERMINAL_ERROR_CODES.includes(errorCode);
}

/** Extracts `error.error.errorCode` from a failed change-seat HTTP call. */
export function extractChangeSeatErrorCode(error: unknown): ChangeSeatErrorCode {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      return code as ChangeSeatErrorCode;
    }
  }
  return 'GENERIC';
}
