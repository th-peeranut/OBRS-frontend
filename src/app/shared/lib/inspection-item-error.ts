import { extractApiErrorCode, mapApiErrorCode } from './api-error-code';

/**
 * OBRS-509: maps the inspection-item admin CRUD/reorder endpoints'
 * `error.error.errorCode` (stable UPPER_SNAKE) to its i18n key under
 * `ADMIN.INSPECTION_ITEMS.ERROR.*`. Mirrors `schedule-status-error.ts`'s
 * `mapScheduleStatusErrorCode()` — branch on the stable code, never the
 * localized `message` (design-system §9).
 *
 * `409 DATA_INTEGRITY_VIOLATION` is deliberately NOT in `knownCodes` and
 * falls through to `GENERIC` — SPEC §3.5 documents it as "a constraint
 * backstop, unreachable through the API if the 400 guards are correct" (UX
 * spec §9.2); a dedicated key would imply a distinguishing case that isn't real.
 */
export function mapInspectionItemErrorCode(errorCode: string | null | undefined): string {
  const knownCodes: Record<string, string> = {
    INSPECTION_ITEM_LOCALES_INVALID: 'ADMIN.INSPECTION_ITEMS.ERROR.LOCALES_INVALID',
    INSPECTION_ITEM_CODE_TAKEN: 'ADMIN.INSPECTION_ITEMS.ERROR.CODE_TAKEN',
    VEHICLE_INSPECTION_ITEM_ERROR_ID_NOT_FOUND: 'ADMIN.INSPECTION_ITEMS.ERROR.ID_NOT_FOUND',
    INSPECTION_ITEM_REORDER_MISSING_IDS: 'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_MISSING_IDS',
    INSPECTION_ITEM_REORDER_UNKNOWN_ID: 'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_UNKNOWN_ID',
    INSPECTION_ITEM_REORDER_DUPLICATE_ID: 'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_DUPLICATE_ID',
    INSPECTION_ITEM_REORDER_INVALID_SEQUENCE: 'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_INVALID_SEQUENCE',
  };

  return mapApiErrorCode(errorCode, knownCodes, 'ADMIN.INSPECTION_ITEMS.ERROR.GENERIC');
}

/** Extracts `error.error.errorCode` from a failed inspection-item HTTP call.
 * Mirrors `extractScheduleStatusErrorCode()` exactly. */
export function extractInspectionItemErrorCode(error: unknown): string {
  return extractApiErrorCode(error, 'GENERIC');
}
