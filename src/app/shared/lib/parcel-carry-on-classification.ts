/**
 * OBRS-341 (staff walk-in carry-on-on-seat intake, `/staff/parcels/consign`,
 * carry-on mode) — client-side MIRROR of the server's classification rule
 * (`../OBRS-backend/docs/api/parcels.md` §"Classification (Business rule 1)"):
 * the item's LARGEST dimension compared against
 * `parcel.carry_on.free_size_max_inch`, a `SystemConfig` row (default 28in).
 *
 * This constant mirrors that default so the form can show a LIVE hint
 * ("free" vs "needs a seat") as the salesperson types dimensions, without a
 * network round trip per keystroke. **The server remains authoritative** —
 * no endpoint exposes `parcel.carry_on.free_size_max_inch` today (a follow-up
 * card to expose it is tracked as a sibling of OBRS-438). If an operator ever
 * changes that config away from 28in, this hint silently drifts from the
 * server's real threshold — the failure mode is NOT a mischarge: the server
 * re-validates independently and answers `400 PARCEL_SEAT_COUNT_REQUIRED` (a
 * carry-on this hint called "free" that the server classifies on-seat) or
 * `400 PARCEL_SEAT_COUNT_NOT_ALLOWED` (the reverse), surfaced to the
 * salesperson via the normal submit-error path rather than silently
 * mis-charging. See the OBRS-341 card brief.
 */
export const CARRY_ON_FREE_SIZE_MAX_INCH = 28;

/** 28in * 2.54 cm/in, computed once — the exact boundary the backend compares
 * against (`parcels.md`: "Strictly greater -> on-seat. Less-or-equal ->
 * free-aisle."). 71.12cm is free-aisle; 71.13cm is on-seat. */
export const CARRY_ON_FREE_SIZE_MAX_CM = CARRY_ON_FREE_SIZE_MAX_INCH * 2.54;

export type ParcelCarryOnClassification = 'free_aisle' | 'on_seat';

/**
 * `largestDimensionCm` must already be the MAX of length/width/height — this
 * function does not take the three separately so it can't accidentally
 * compare the wrong one. Strictly greater than the threshold classifies
 * on-seat; equal-or-under is free-aisle (matches the backend exactly, see
 * the boundary note above).
 */
export function classifyCarryOn(largestDimensionCm: number): ParcelCarryOnClassification {
  return largestDimensionCm > CARRY_ON_FREE_SIZE_MAX_CM ? 'on_seat' : 'free_aisle';
}
