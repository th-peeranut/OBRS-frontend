import { extractApiErrorCode } from './api-error-code';
import { ChangeStopErrorCode } from '../interfaces/change-stop.interface';
import { classifyHttpFallback, HttpFallbackTier } from './http-error-fallback';

/**
 * Maps a change-stop endpoint's `error.error.errorCode` (stable UPPER_SNAKE,
 * e.g. `CHANGE_STOP_ERROR_NO_SEATS`) to its i18n key under
 * `MY_BOOKINGS.CHANGE_STOP.ERROR.*`. Mirrors `reschedule-error.ts`'s
 * `mapRescheduleErrorCode()` — branch on the stable code, never the
 * localized `message` (design-system §9).
 *
 * When there is NO recognized `errorCode` (network failure, backend outage,
 * or a rejected-but-code-less 4xx), `fallbackTier` picks between the two
 * generic-copy keys instead of one vague message (OBRS-170) — see
 * `classifyHttpFallback` in `http-error-fallback.ts`.
 */
export function mapChangeStopErrorCode(
  errorCode: string | null | undefined,
  fallbackTier: HttpFallbackTier = 'ACTION_UNAVAILABLE'
): string {
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
    // OBRS-358: shared jump-seat channel-guard code — see the identical
    // entry in `change-seat-error.ts` for the full rationale; same
    // `COMMON.ERROR.*` key, never duplicated per flow.
    SEAT_ERROR_WALK_IN_ONLY: 'COMMON.ERROR.SEAT_WALK_IN_ONLY',
  };

  if (errorCode && knownCodes[errorCode]) {
    return knownCodes[errorCode];
  }

  return fallbackTier === 'SERVICE_UNAVAILABLE'
    ? 'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE'
    : 'MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE';
}

/**
 * Resolves the fallback key for a failed **background load** on the
 * change-stop dialog (station list / route stops / tickets) — these
 * endpoints carry no domain `errorCode` of their own, so every failure used
 * to collapse into the single vague `STOPS_LOAD_ERROR` message regardless of
 * whether the backend was down or just rejected the call (OBRS-170). Reuses
 * the same `ERROR.SERVICE_UNAVAILABLE` / `ERROR.ACTION_UNAVAILABLE` copy as
 * `mapChangeStopErrorCode`'s fallback — the message is intentionally generic
 * either way, so a separate key set would just duplicate the same two
 * strings.
 */
export function mapChangeStopStopsLoadError(error: unknown): string {
  return classifyHttpFallback(error) === 'SERVICE_UNAVAILABLE'
    ? 'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE'
    : 'MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE';
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
  return extractApiErrorCode(error, 'GENERIC') as ChangeStopErrorCode;
}
