import { HttpErrorResponse } from '@angular/common/http';
import { ChildFareFlagErrorCode } from '../interfaces/ticket-boarding.interface';

/**
 * Maps the OBRS-296 flag/unflag-child-fare actions' `error.error.errorCode`
 * (stable UPPER_SNAKE) to its i18n key under `STAFF.BOARDING.CHILD_FARE_ERROR.*`.
 * Mirrors `boarding-action-error.ts`'s `mapBoardingActionErrorCode()`, but its
 * own code set — flag/unflag take no token and have no boarding-window/
 * ticket-confirmed guard, so `ALREADY_FLAGGED`/`NOT_FLAGGED` are the only
 * domain codes. Branch on the stable code, never the localized `message`
 * (design-system §9).
 */
export function mapChildFareFlagErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    ALREADY_FLAGGED: 'STAFF.BOARDING.CHILD_FARE_ERROR.ALREADY_FLAGGED',
    NOT_FLAGGED: 'STAFF.BOARDING.CHILD_FARE_ERROR.NOT_FLAGGED',
  };

  return (errorCode && knownCodes[errorCode]) || 'STAFF.BOARDING.CHILD_FARE_ERROR.GENERIC';
}

/** Extracts `error.error.errorCode` from a failed flag/unflag HTTP call. */
export function extractChildFareFlagErrorCode(error: unknown): ChildFareFlagErrorCode {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      return code as ChildFareFlagErrorCode;
    }
  }
  return 'GENERIC';
}
