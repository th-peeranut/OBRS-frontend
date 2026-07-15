/**
 * Canonical seat-label normalizer (OBRS-362). Strips every non-digit
 * character so a UI seat label ('A1', 'B12', ...) can be matched against the
 * backend's plain-numeric seat keys (`Schedule.availableSeatNumbers`,
 * `SeatMapRespDto.seatNumber`, booking-payload `seatNumber`).
 *
 * This consolidates what used to be a private, duplicated regex
 * (`passenger-seat-van.component.ts`'s own `normalizeSeatNumber`, and an
 * equivalent inline `.match(/\d+/g)` in `PassengerInfoComponent`) into one
 * shared util — every seat-label normalization in the app should call this,
 * not re-implement the regex.
 */
export function normalizeSeatNumber(seat: string | null | undefined): string {
  return (seat || '').replace(/\D/g, '');
}
