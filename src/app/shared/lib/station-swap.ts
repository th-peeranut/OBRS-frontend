/**
 * OBRS-1035 — the origin/destination swap predicate, in one place.
 *
 * Three screens carry the same origin/destination pair (`home-booking`,
 * `schedule-booking-filter`, `parcel-trip-form`) and each one had already been
 * copy-pasted from the next; OBRS-1021 / OBRS-1023 / OBRS-1028 were all the
 * same propagation failure on this exact block. The swap *action* stays in each
 * component (each writes to its own form group and re-runs its own option-sync),
 * but the "may these two values be swapped at all?" rule lives here so it cannot
 * drift between the three.
 */

/** `startStationId`/`stopStationId` are seeded with `''`, so a plain falsy check
 *  would also read a legitimate station id of `0` as "empty". */
export function isEmptyStationValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * OBRS-1035 AC#7: swapping empty-with-empty is a no-op, and a button that
 * visibly does nothing is this very bug in a new costume — so the control is
 * disabled until at least one side holds a station. One side filled IS
 * swappable: it moves that station across, which is a real edit.
 */
export function canSwapStationPair(startValue: unknown, stopValue: unknown): boolean {
  return !(isEmptyStationValue(startValue) && isEmptyStationValue(stopValue));
}
