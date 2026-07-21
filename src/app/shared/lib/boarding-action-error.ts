import { extractApiErrorCode, mapApiErrorCode } from './api-error-code';
import { BoardingActionErrorCode } from '../interfaces/ticket-boarding.interface';

/**
 * Maps the OBRS-130 board/unboard actions' `error.error.errorCode` (stable
 * UPPER_SNAKE) to its i18n key under `STAFF.BOARDING.ACTION_ERROR.*`.
 * Parallel to `boarding-scan-error.ts`'s `mapBoardingScanErrorCode()`, but its
 * own code set (board/unboard take no token, so there is no
 * `INVALID_TICKET_TOKEN`/`EXPIRED_TICKET_TOKEN`/`WRONG_SCHEDULE_TICKET` here;
 * `NOT_BOARDED` is unique to the unboard action). Branch on the stable code,
 * never the localized `message` (design-system §9).
 */
export function mapBoardingActionErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    ALREADY_BOARDED: 'STAFF.BOARDING.ACTION_ERROR.ALREADY_BOARDED',
    NOT_BOARDED: 'STAFF.BOARDING.ACTION_ERROR.NOT_BOARDED',
    TICKET_NOT_CONFIRMED: 'STAFF.BOARDING.ACTION_ERROR.TICKET_NOT_CONFIRMED',
    BOARDING_WINDOW_NOT_OPEN: 'STAFF.BOARDING.ACTION_ERROR.BOARDING_WINDOW_NOT_OPEN',
    TICKET_ERROR_ID_NOT_FOUND: 'STAFF.BOARDING.ACTION_ERROR.TICKET_ERROR_ID_NOT_FOUND',
    // OBRS-256: board/unboard attempted after the schedule was marked
    // `arrived` (backend forward-transition guard).
    BOARDING_ROUND_ARRIVED: 'STAFF.BOARDING.ACTION_ERROR.BOARDING_ROUND_ARRIVED',
  };

  return mapApiErrorCode(errorCode, knownCodes, 'STAFF.BOARDING.ACTION_ERROR.GENERIC');
}

/** Extracts `error.error.errorCode` from a failed board/unboard HTTP call. */
export function extractBoardingActionErrorCode(error: unknown): BoardingActionErrorCode {
  return extractApiErrorCode(error, 'GENERIC') as BoardingActionErrorCode;
}
