import { extractApiErrorCode, mapApiErrorCode } from './api-error-code';

/**
 * OBRS-256: maps `PATCH /api/private/schedules/{id}/status`'s
 * `error.error.errorCode` (stable UPPER_SNAKE) to its i18n key under
 * `STAFF.SCHEDULE_STATUS.ERROR.*`. Mirrors `boarding-scan-error.ts`'s
 * `mapBoardingScanErrorCode()` — branch on the stable code, never the
 * localized `message` (design-system §9).
 *
 * OBRS-471: `VEHICLE_PREVIOUS_TRIP_NOT_ARRIVED` is deliberately NOT in
 * `knownCodes` — `boarding-list.component.ts`'s `onScheduleStatusAction()`
 * handles it ahead of this generic mapper and shows the server's own
 * `error.error.message` verbatim (it names the stuck trip; a static FE
 * string would throw that away). This function is never called for that
 * code on the success path of that branch.
 */
export function mapScheduleStatusErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    SCHEDULE_TRANSITION_ILLEGAL: 'STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_TRANSITION_ILLEGAL',
    // OBRS-434: a driver may only transition the trip they are assigned to. Reachable
    // only by opening someone else's `:scheduleId` directly (see OBRS-451) — the
    // driver's own schedule list never links to another driver's trip.
    SCHEDULE_TRANSITION_NOT_ASSIGNED_DRIVER:
      'STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_TRANSITION_NOT_ASSIGNED_DRIVER',
    // OBRS-471: only reachable if the FE ever sends overrideTurnaroundGate=true
    // for a non-admin/owner session, which canOverrideTurnaroundGate prevents —
    // kept as a defensive fallback in case that gate is ever bypassed/stale.
    SCHEDULE_OVERRIDE_NOT_PERMITTED: 'STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_OVERRIDE_NOT_PERMITTED',
  };

  return mapApiErrorCode(errorCode, knownCodes, 'STAFF.SCHEDULE_STATUS.ERROR.GENERIC');
}

/** Extracts `error.error.errorCode` from a failed schedule-status-update HTTP
 * call. Mirrors `extractBoardingScanErrorCode()` exactly. */
export function extractScheduleStatusErrorCode(error: unknown): string {
  return extractApiErrorCode(error, 'GENERIC');
}
