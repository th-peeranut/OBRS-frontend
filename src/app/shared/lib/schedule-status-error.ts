import { HttpErrorResponse } from '@angular/common/http';

/**
 * OBRS-256: maps `PATCH /api/private/schedules/{id}/status`'s
 * `error.error.errorCode` (stable UPPER_SNAKE) to its i18n key under
 * `STAFF.SCHEDULE_STATUS.ERROR.*`. Mirrors `boarding-scan-error.ts`'s
 * `mapBoardingScanErrorCode()` — branch on the stable code, never the
 * localized `message` (design-system §9).
 */
export function mapScheduleStatusErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    SCHEDULE_TRANSITION_ILLEGAL: 'STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_TRANSITION_ILLEGAL',
  };

  return (errorCode && knownCodes[errorCode]) || 'STAFF.SCHEDULE_STATUS.ERROR.GENERIC';
}

/** Extracts `error.error.errorCode` from a failed schedule-status-update HTTP
 * call. Mirrors `extractBoardingScanErrorCode()` exactly. */
export function extractScheduleStatusErrorCode(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      return code;
    }
  }
  return 'GENERIC';
}
