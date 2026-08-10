import dayjs from 'dayjs';

/**
 * OBRS-1185 — the round-trip return date, in one place.
 *
 * `home-booking` and `schedule-booking-filter` are copies of each other and
 * have leaked a one-page-only date fix four times already (OBRS-1021 / 1028 /
 * 1023 / 1036). The rule this file encodes: the return date can never precede
 * the departure date, and its DEFAULT must not silently equal the departure
 * date either — a same-day round trip is not what "round trip" defaults to on
 * any reference site the owner cited (Traveloka 11→13 Aug, Airpaz 11→12 Aug —
 * both default the return 1-2 days after the outbound).
 */

/**
 * One day after `departureDate`, capped at `maxDate` (the resolved
 * booking-policy advance-sale cap the calendars themselves enforce) so the
 * default never asks for a date the calendar would refuse to show as
 * selectable. Falls back to `departureDate` itself only in the degenerate
 * case where `maxDate` is not after `departureDate` at all (a booking-policy
 * edge case, not a normal day) — returning an invalid (pre-departure) date
 * would be worse than a same-day one.
 */
export function defaultReturnDate(departureDate: Date, maxDate: Date): Date {
  const candidate = dayjs(departureDate).add(1, 'day');
  const cap = dayjs(maxDate);

  if (candidate.isAfter(cap)) {
    return cap.isAfter(departureDate) ? cap.toDate() : new Date(departureDate);
  }

  return candidate.toDate();
}

/**
 * Re-derives `returnDate` after `departureDate` changes (OBRS-1185 AC#4:
 * "moving departureDate past returnDate must carry returnDate with it — never
 * leave a pair in the form the backend would reject").
 *
 * Returns the SAME `currentReturn` reference, unchanged, when it is still on
 * or after the new departure date (day granularity — this UI never picks a
 * time component) — so a caller can detect "nothing to do" with `!==` rather
 * than re-comparing dates itself. Otherwise returns a freshly derived
 * `defaultReturnDate`.
 */
export function carryReturnDate(
  newDepartureDate: Date,
  currentReturn: Date,
  maxDate: Date
): Date {
  if (!dayjs(currentReturn).isBefore(dayjs(newDepartureDate), 'day')) {
    return currentReturn;
  }

  return defaultReturnDate(newDepartureDate, maxDate);
}
