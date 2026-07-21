import { extractApiErrorCode } from './api-error-code';
import { hasOwnKey } from './own-key';
import { HttpFallbackTier } from './http-error-fallback';

/**
 * OBRS-312: weekly vehicle inspection submission error codes. Mirrors
 * `change-seat-error.ts`'s `mapChangeSeatErrorCode()`/`extractChangeSeatErrorCode()`
 * shape exactly — branch on the stable `errorCode` (design-system §9), never the
 * localized `message`.
 *
 * Three of the five documented codes are handled OUTSIDE this map, by the
 * submitting component itself, because their copy is either the backend's
 * verbatim `message` (never a translated key) or triggers a side effect:
 * - `INSPECTION_ITEMS_INCOMPLETE` / `INSPECTION_NOTE_REQUIRED` — pre-empted
 *   client-side; a server round-trip is defensive only, shown as a toast with
 *   `extractApiErrorMessage(error)` verbatim.
 * - `INSPECTION_ITEM_INACTIVE` — warns, then silently refreshes the items
 *   store (preserving already-entered verdicts/notes for itemIds still active).
 * - `ODOMETER_BELOW_LAST_RECORDED` — an inline field error under the odometer
 *   input rendering the backend's interpolated `message` verbatim (no `args`
 *   field on the error envelope; never parse numbers back out of the string).
 *
 * `mapVehicleInspectionErrorCode()` only ever needs to resolve the
 * unrecognized/network fallback tier for this flow (mirroring
 * `mapChangeSeatErrorCode`'s `ACTION_UNAVAILABLE`/`SERVICE_UNAVAILABLE` split),
 * but keeps the same known-codes table shape as its sibling so a future
 * generic-toast use of a known code doesn't need a second lookup table.
 */
export function mapVehicleInspectionErrorCode(
  errorCode: string | null | undefined,
  fallbackTier: HttpFallbackTier = 'ACTION_UNAVAILABLE'
): string {
  const knownCodes: Record<string, string> = {
    INSPECTION_ITEMS_INCOMPLETE: 'STAFF.INSPECTION.ERROR.ITEMS_INCOMPLETE',
    INSPECTION_NOTE_REQUIRED: 'STAFF.INSPECTION.ERROR.NOTE_REQUIRED',
    INSPECTION_ITEM_INACTIVE: 'STAFF.INSPECTION.ERROR.ITEM_INACTIVE',
    ODOMETER_BELOW_LAST_RECORDED: 'STAFF.INSPECTION.ERROR.ODOMETER_BELOW_LAST_RECORDED',
  };

  // OBRS-601: `hasOwnKey` closes the `Object.prototype` hole (e.g.
  // `knownCodes['constructor']`) that plain `knownCodes[errorCode]` opens.
  if (errorCode && hasOwnKey(knownCodes, errorCode)) {
    return knownCodes[errorCode];
  }

  return fallbackTier === 'SERVICE_UNAVAILABLE'
    ? 'STAFF.INSPECTION.ERROR.SERVICE_UNAVAILABLE'
    : 'STAFF.INSPECTION.ERROR.ACTION_UNAVAILABLE';
}

/** Extracts `error.error.errorCode` from a failed inspection-submit HTTP call. */
export function extractVehicleInspectionErrorCode(error: unknown): string | null {
  return extractApiErrorCode(error, null);
}
