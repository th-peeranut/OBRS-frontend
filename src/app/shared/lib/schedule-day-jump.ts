import dayjs from 'dayjs';
import { ScheduleFilter } from '../interfaces/schedule.interface';
import { carryReturnDate } from './return-date';

/**
 * OBRS-862 AC#4 — moving the search to another day, in ONE place.
 *
 * The day strip drives the OUTBOUND leg only. Two reasons, and neither is
 * convenience:
 *   1. The availability endpoint answers for one ordered stop pair. A round
 *      trip would have to ask twice (stops swapped) and INTERSECT the answers,
 *      which would grey out a day that genuinely has an outbound trip because
 *      the customer's separately-chosen return date has none. That is a false
 *      statement to a customer, and greying is a statement (owner, 2026-08-11).
 *   2. The return date is a second, independent intent. A strip that moved
 *      both legs together would silently re-decide how long the customer stays.
 *
 * The return leg does NOT drift, because it moves by the rule that already
 * owns it: `carryReturnDate` (OBRS-1185, shared/lib/return-date.ts) — unchanged
 * when it is still on or after the new departure, re-derived from it otherwise.
 * It is written into the SAME dispatch as the departure date, so the store, the
 * filter form and the search payload can never disagree about it.
 */
export function scheduleFilterForDay(
  filter: ScheduleFilter,
  day: Date | string,
  maxDate: Date
): ScheduleFilter {
  const departure = dayjs(day);
  const departureDate = departure.format('YYYY-MM-DD');

  // `roundTrip` reaches the store as either the Dropdown or its bare id, and
  // `?? 2` is the same round-trip-is-the-default read the filter component's
  // store subscription does (OBRS-1185). No `returnDate` in the filter means
  // there is nothing to carry — this must never INVENT one.
  const roundTrip = filter.roundTrip as { id?: number } | number | undefined;
  const roundTripId = typeof roundTrip === 'object' ? roundTrip?.id : roundTrip;
  if ((roundTripId ?? 2) !== 2 || !filter.returnDate) {
    return { ...filter, departureDate };
  }

  return {
    ...filter,
    departureDate,
    returnDate: dayjs(
      carryReturnDate(departure.toDate(), new Date(filter.returnDate), maxDate)
    ).format('YYYY-MM-DD'),
  };
}
