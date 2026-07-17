import { extractApiErrorCode } from './api-error-code';
import { RescheduleErrorCode } from '../interfaces/reschedule.interface';

/**
 * Maps a reschedule endpoint's `error.error.errorCode` (stable UPPER_SNAKE,
 * e.g. `RESCHEDULE_ERROR_NO_SEATS`) to its i18n key under
 * `MY_BOOKINGS.RESCHEDULE.ERROR.*`. Mirrors
 * `report-usability-fab.component.ts`'s `mapErrorCode()` pattern — branch on
 * the stable code, never the localized `message` (design-system §9).
 */
export function mapRescheduleErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    RESCHEDULE_ERROR_NOT_CONFIRMED: 'MY_BOOKINGS.RESCHEDULE.ERROR.NOT_CONFIRMED',
    RESCHEDULE_ERROR_MAX_COUNT: 'MY_BOOKINGS.RESCHEDULE.ERROR.MAX_COUNT',
    RESCHEDULE_ERROR_MULTI_LEG_NOT_SUPPORTED:
      'MY_BOOKINGS.RESCHEDULE.ERROR.MULTI_LEG_NOT_SUPPORTED',
    RESCHEDULE_ERROR_SAME_SCHEDULE: 'MY_BOOKINGS.RESCHEDULE.ERROR.SAME_SCHEDULE',
    RESCHEDULE_ERROR_BOOKING_NOT_FOUND: 'MY_BOOKINGS.RESCHEDULE.ERROR.BOOKING_NOT_FOUND',
    RESCHEDULE_ERROR_WINDOW_CLOSED: 'MY_BOOKINGS.RESCHEDULE.ERROR.WINDOW_CLOSED',
    RESCHEDULE_ERROR_DATE_TOO_FAR: 'MY_BOOKINGS.RESCHEDULE.ERROR.DATE_TOO_FAR',
    RESCHEDULE_ERROR_ROUTE_MISMATCH: 'MY_BOOKINGS.RESCHEDULE.ERROR.ROUTE_MISMATCH',
    RESCHEDULE_ERROR_NO_SEATS: 'MY_BOOKINGS.RESCHEDULE.ERROR.NO_SEATS',
    RESCHEDULE_ERROR_NET_AMOUNT_CHANGED: 'MY_BOOKINGS.RESCHEDULE.ERROR.NET_AMOUNT_CHANGED',
    RESCHEDULE_ERROR_UNAUTHORIZED: 'MY_BOOKINGS.RESCHEDULE.ERROR.UNAUTHORIZED',
    // Client-side-only guard (acceptance criterion #9) — not a backend code.
    RESCHEDULE_PRICE_CHANGED: 'MY_BOOKINGS.RESCHEDULE.PRICE_CHANGED',
    // OBRS-358: shared jump-seat channel-guard code — see the identical
    // entry in `change-seat-error.ts` for the full rationale; same
    // `COMMON.ERROR.*` key, never duplicated per flow.
    SEAT_ERROR_WALK_IN_ONLY: 'COMMON.ERROR.SEAT_WALK_IN_ONLY',
  };

  return errorCode && knownCodes[errorCode]
    ? knownCodes[errorCode]
    : 'MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC';
}

/** `errorCode`s that are terminal for the current dialog session — the
 * booking can no longer be rescheduled at all (unlike `NO_SEATS`, which just
 * means "pick a different candidate"), so the dialog closes and this is
 * surfaced as a toast rather than an inline banner. */
const TERMINAL_ERROR_CODES: readonly string[] = [
  'RESCHEDULE_ERROR_NOT_CONFIRMED',
  'RESCHEDULE_ERROR_MAX_COUNT',
];

export function isTerminalRescheduleError(errorCode: string | null | undefined): boolean {
  return !!errorCode && TERMINAL_ERROR_CODES.includes(errorCode);
}

/** `errorCode`s that should bounce the dialog back to the options list rather
 * than staying on the estimate step (the chosen candidate is no longer
 * viable, but the booking itself can still be rescheduled to another one). */
const RETURN_TO_OPTIONS_ERROR_CODES: readonly string[] = ['RESCHEDULE_ERROR_NO_SEATS'];

export function shouldReturnToOptions(errorCode: string | null | undefined): boolean {
  return !!errorCode && RETURN_TO_OPTIONS_ERROR_CODES.includes(errorCode);
}

/** Extracts `error.error.errorCode` from a failed reschedule HTTP call. */
export function extractRescheduleErrorCode(error: unknown): RescheduleErrorCode {
  return extractApiErrorCode(error, 'GENERIC') as RescheduleErrorCode;
}
