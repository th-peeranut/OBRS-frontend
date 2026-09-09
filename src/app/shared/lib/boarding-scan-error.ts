import { extractApiErrorCode, mapApiErrorCode } from './api-error-code';
import { BoardingScanErrorCode } from '../interfaces/ticket-boarding.interface';

/**
 * Maps the boarding-scan endpoint's `error.error.errorCode` (stable
 * UPPER_SNAKE) to its i18n key under `STAFF.BOARDING.SCAN.ERROR.*`. Mirrors
 * `reschedule-error.ts`'s `mapRescheduleErrorCode()` — branch on the stable
 * code, never the localized `message` (design-system §9).
 */
export function mapBoardingScanErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    INVALID_TICKET_TOKEN: 'STAFF.BOARDING.SCAN.ERROR.INVALID_TICKET_TOKEN',
    EXPIRED_TICKET_TOKEN: 'STAFF.BOARDING.SCAN.ERROR.EXPIRED_TICKET_TOKEN',
    WRONG_SCHEDULE_TICKET: 'STAFF.BOARDING.SCAN.ERROR.WRONG_SCHEDULE_TICKET',
    BOARDING_WINDOW_NOT_OPEN: 'STAFF.BOARDING.SCAN.ERROR.BOARDING_WINDOW_NOT_OPEN',
    TICKET_NOT_CONFIRMED: 'STAFF.BOARDING.SCAN.ERROR.TICKET_NOT_CONFIRMED',
    ALREADY_BOARDED: 'STAFF.BOARDING.SCAN.ERROR.ALREADY_BOARDED',
    TICKET_ERROR_ID_NOT_FOUND: 'STAFF.BOARDING.SCAN.ERROR.TICKET_ERROR_ID_NOT_FOUND',
    // OBRS-256: scan attempted after the schedule was marked `arrived` — the
    // count-lock has already frozen boarding client-side, but the backend is
    // the source of truth (a stale tab or a race with another operator).
    BOARDING_ROUND_ARRIVED: 'STAFF.BOARDING.SCAN.ERROR.BOARDING_ROUND_ARRIVED',
    // OBRS-142: reachable only through the offline replay batch (OBRS-243) —
    // the device's captured timestamp was in the future or outside the
    // departure day's capture window. The live scan path never stamps a
    // client clock, so it cannot produce this.
    INVALID_CAPTURED_AT: 'STAFF.BOARDING.SCAN.ERROR.INVALID_CAPTURED_AT',
    // OBRS-142: the batch's own code for a driver-scope refusal — the live
    // path surfaces the same refusal as a 403 the interceptor owns, so this
    // key only ever renders for a replayed item.
    FORBIDDEN_DRIVER_SCOPE: 'STAFF.BOARDING.SCAN.ERROR.FORBIDDEN_DRIVER_SCOPE',
  };

  // OBRS-601: `||` is no guard here — `knownCodes['constructor']` is the
  // `Object` function, which is truthy, so an errorCode naming a prototype
  // member would be handed to `translate.instant()` and throw on `.split('.')`
  // inside an error handler. The code is un-normalized server text, so all
  // eight `Object.prototype` members are reachable, not just two.
  return mapApiErrorCode(errorCode, knownCodes, 'STAFF.BOARDING.SCAN.ERROR.GENERIC');
}

/** `errorCode`s that describe an already-settled/timing state rather than a
 * hard-invalid token — rendered `is-warning`. Everything else (a forged/
 * tampered token, a cancelled/refunded/no-show ticket, an unknown id, or the
 * generic fallback) is `is-danger`. Design-system §11: never distinguish by
 * color alone — each severity also carries a distinct icon (see
 * `boardingScanErrorIcon`). */
const WARNING_ERROR_CODES: readonly string[] = [
  'EXPIRED_TICKET_TOKEN',
  'WRONG_SCHEDULE_TICKET',
  'BOARDING_WINDOW_NOT_OPEN',
  'ALREADY_BOARDED',
  // OBRS-256: an already-settled schedule state, not a hard-invalid token.
  'BOARDING_ROUND_ARRIVED',
  // OBRS-142: a timing/clock rejection of a replayed capture, not a forged
  // token — the ticket itself is fine.
  'INVALID_CAPTURED_AT',
];

export function boardingScanErrorSeverity(
  errorCode: string | null | undefined
): 'danger' | 'warning' {
  return errorCode && WARNING_ERROR_CODES.includes(errorCode) ? 'warning' : 'danger';
}

const ICON_BY_ERROR_CODE: Record<string, string> = {
  INVALID_TICKET_TOKEN: 'gpp_bad',
  EXPIRED_TICKET_TOKEN: 'schedule',
  WRONG_SCHEDULE_TICKET: 'directions_bus',
  BOARDING_WINDOW_NOT_OPEN: 'hourglass_empty',
  TICKET_NOT_CONFIRMED: 'block',
  ALREADY_BOARDED: 'how_to_reg',
  TICKET_ERROR_ID_NOT_FOUND: 'search_off',
  BOARDING_ROUND_ARRIVED: 'lock',
  // OBRS-142 (offline replay only).
  INVALID_CAPTURED_AT: 'update_disabled',
  FORBIDDEN_DRIVER_SCOPE: 'person_off',
  GENERIC: 'error',
};

/** Material Symbols Outlined glyph name for the result banner — always
 * rendered alongside the text/color so severity is never color-only. */
export function boardingScanErrorIcon(errorCode: string | null | undefined): string {
  return mapApiErrorCode(errorCode, ICON_BY_ERROR_CODE, ICON_BY_ERROR_CODE['GENERIC']);
}

/** Extracts `error.error.errorCode` from a failed boarding-scan HTTP call. */
export function extractBoardingScanErrorCode(error: unknown): BoardingScanErrorCode {
  return extractApiErrorCode(error, 'GENERIC') as BoardingScanErrorCode;
}
