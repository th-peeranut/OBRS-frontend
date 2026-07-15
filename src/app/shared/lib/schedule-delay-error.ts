import { extractScheduleStatusErrorCode } from './schedule-status-error';

/**
 * OBRS-272: maps `PATCH /api/private/schedules/{id}/delay`'s
 * `error.error.errorCode` (stable UPPER_SNAKE) to its i18n key under
 * `STAFF.SCHEDULE_DELAY.ERROR.*`. Only `SCHEDULE_DELAY_NOT_SCHEDULED` (409)
 * and the fallback GENERIC are meant for an `AlertService.error()` toast —
 * `BoardingListComponent.submitDelaySchedule()` branches a 400
 * (`SCHEDULE_DELAY_ETA_INVALID` / bean-validation null-ETA) to an inline field
 * error instead, reusing this same map's `SCHEDULE_DELAY_ETA_INVALID` key.
 * Branch on the stable code, never the localized `message` (design-system §9).
 */
export function mapScheduleDelayErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    SCHEDULE_DELAY_NOT_SCHEDULED: 'STAFF.SCHEDULE_DELAY.ERROR.SCHEDULE_DELAY_NOT_SCHEDULED',
    SCHEDULE_DELAY_ETA_INVALID: 'STAFF.SCHEDULE_DELAY.ERROR.SCHEDULE_DELAY_ETA_INVALID',
  };

  return (errorCode && knownCodes[errorCode]) || 'STAFF.SCHEDULE_DELAY.ERROR.GENERIC';
}

/**
 * OBRS-272: the `error.error.errorCode` extraction is byte-identical across
 * `boarding-scan-error.ts` / `boarding-action-error.ts` / `schedule-status-error.ts`
 * / this feature — reuse `extractScheduleStatusErrorCode()` (already typed
 * `string`, not narrowed to a sibling-feature error-code union) rather than
 * forking a 4th copy of the same `HttpErrorResponse` unwrap.
 */
export const extractScheduleDelayErrorCode = extractScheduleStatusErrorCode;
