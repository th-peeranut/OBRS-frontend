/**
 * OBRS-341 (staff walk-in carry-on-on-seat intake, `/staff/parcels/consign`,
 * carry-on mode) — client-side MIRROR of the server's classification rule
 * (`../OBRS-backend/docs/api/parcels.md` §"Classification (Business rule 1)"):
 * the item's LARGEST dimension compared against
 * `parcel.carry_on.free_size_max_inch`, a `SystemConfig` row (default 28in).
 *
 * The mirror exists so the form can show a LIVE hint ("free" vs "needs a
 * seat") as the salesperson types dimensions, without a network round trip
 * per keystroke. **The server remains authoritative** — it re-validates
 * independently and answers `400 PARCEL_SEAT_COUNT_REQUIRED` /
 * `400 PARCEL_SEAT_COUNT_NOT_ALLOWED` if the two ever disagree.
 *
 * OBRS-611: the threshold is a PARAMETER, not a constant here. It used to be
 * `CARRY_ON_FREE_SIZE_MAX_INCH = 28` typed into this file because no endpoint
 * served the config; `GET /api/parcel-policy` (OBRS-629) now does, so the
 * caller passes the served value and an operator moving the config moves the
 * hint without a deploy. There is deliberately NO default argument — a
 * default would be the same hardcoded 28 wearing a different hat, and would
 * let a caller that forgot to wire the config silently drift again.
 */
export type ParcelCarryOnClassification = 'free_aisle' | 'on_seat';

/**
 * `largestDimensionCm` must already be the MAX of length/width/height — this
 * function does not take the three separately so it can't accidentally
 * compare the wrong one. `freeSizeMaxInch` is `parcel.carry_on.free_size_max_inch`
 * as served by `GET /api/parcel-policy`; it is converted here (x2.54) so the
 * one place that knows the unit boundary is the one place that compares.
 * Strictly greater than the threshold classifies on-seat; equal-or-under is
 * free-aisle — matches the backend exactly (`parcels.md`: "Strictly greater ->
 * on-seat. Less-or-equal -> free-aisle."), so at 28in 71.12cm is free-aisle
 * and 71.13cm is on-seat.
 */
export function classifyCarryOn(
  largestDimensionCm: number,
  freeSizeMaxInch: number
): ParcelCarryOnClassification {
  return largestDimensionCm > freeSizeMaxInch * 2.54 ? 'on_seat' : 'free_aisle';
}
