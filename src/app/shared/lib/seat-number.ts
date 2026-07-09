/**
 * Seat-number normalization for the change-seat flow (OBRS-171).
 *
 * The seat-map components (`app-passenger-seat-van`/`app-passenger-seat-bus`)
 * render/emit letter-prefixed labels (van `A1..A13`, bus `B1..B21`) — a fixed
 * layout keyed off `vehicleType` (see `ChangeSeatMapComponent`/
 * `docs/adr/0009-change-seat-dialog.md`). The backend's change-seat endpoints
 * (`GET .../change-seat/availability`, `POST .../change-seat`) instead speak
 * BARE NUMERIC seat numbers (`"1".."N"`) — the same convention the normal
 * booking flow already normalizes to just before submit
 * (`PassengerInfoComponent.normalizeSeatNumber`). Change-seat forgot to do
 * the same on its confirm path, so every confirm 400'd
 * (`CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP`/`CHANGE_SEAT_ERROR_TICKET_MISMATCH`).
 *
 * This is a dedicated copy for the change-seat dialog/service rather than a
 * shared extraction over the van/bus components' own private
 * `normalizeSeatNumber` — the booking flow's seat components are shared with
 * walk-in/trip-details-edit and must not be touched by this fix.
 */

/** Strips everything but digits, e.g. `"A5"` / `"B12"` / `"5"` → `"5"`/`"12"`/`"5"`. */
export function normalizeSeatNumber(seatNumber: string | null | undefined): string {
  return (seatNumber || '').replace(/\D/g, '');
}

/**
 * The inverse — reconstructs the letter-prefixed label the seat-map
 * components render, from a bare numeric seat number and the schedule's
 * `vehicleType`. Positionally 1:1 (`A{N}`/`B{N}` ↔ `{N}`) — mirrors
 * `ChangeSeatMapComponent.isVan`'s van/minibus check.
 *
 * Idempotent against an already-prefixed input (e.g. legacy/test data that's
 * already `"B1"`): digits are extracted first, then re-prefixed, so the
 * result only ever depends on the digits + `vehicleType`.
 */
export function toSeatLabel(vehicleType: string | null | undefined, seatNumber: string): string {
  const digits = normalizeSeatNumber(seatNumber);
  if (!digits) {
    return seatNumber;
  }

  const normalizedType = (vehicleType || '').toLowerCase();
  const prefix = normalizedType === 'van' || normalizedType === 'minibus' ? 'A' : 'B';
  return `${prefix}${digits}`;
}

/** Normalizes every value of a ticketId → seatLabel map to bare digits —
 * the shape `POST .../change-seat` (and `.../change-stop`) require. */
export function normalizeSeatAssignments(
  seatAssignments: Record<number, string>
): Record<number, string> {
  const normalized: Record<number, string> = {};
  for (const [ticketId, seatNumber] of Object.entries(seatAssignments)) {
    normalized[Number(ticketId)] = normalizeSeatNumber(seatNumber);
  }
  return normalized;
}
