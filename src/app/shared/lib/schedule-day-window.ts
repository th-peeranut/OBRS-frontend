import dayjs from 'dayjs';
import {
  ScheduleAvailabilityReq,
  ScheduleFilter,
} from '../interfaces/schedule.interface';
import { getStationSlugById, StationApi } from '../interfaces/station.interface';
import { MAX_PASSENGERS_PER_BOOKING } from '../constants/passenger-limits';

/**
 * OBRS-862 — the day window the results-page strip renders and the availability
 * question it asks, in ONE place.
 *
 * Two components read the same answer (the strip, and the list's empty state)
 * and they must agree byte-for-byte: `ScheduleService.getAvailabilityCached`
 * dedupes on the request fields, so a window computed twice with two different
 * rules would put two identical POSTs on the wire instead of none.
 */

/** 7 days = every weekday exactly once, on a weekly-repeating timetable. */
export const DAY_WINDOW_SIZE = 7;
/** How much of the window sits BEFORE the selected day when there is room. */
export const DAY_WINDOW_DAYS_BEFORE = 3;

/**
 * The window as ascending "YYYY-MM-DD", clamped into
 * `[today, today + maxAdvanceDays]` at BOTH ends.
 *
 * The upper clamp is not cosmetic: `POST /api/schedules/availability` answers
 * 400 BOOKING_ERROR_ADVANCE_CAP_EXCEEDED for a `fromDate` past the cap (and for
 * a past one, `@FutureOrPresent`) rather than clamping it itself, so the window
 * start this returns is also what makes the request legal.
 *
 * `maxAdvanceDays` comes from `BookingPolicyService`, never a constant — see the
 * strip's own note.
 */
export function buildDayWindow(
  departureDate: string | Date | null | undefined,
  today: Date,
  maxAdvanceDays: number
): string[] {
  const minDay = dayjs(today).startOf('day');
  const maxDay = minDay.add(maxAdvanceDays, 'day');

  const parsed = dayjs(departureDate ?? undefined);
  let selected = parsed.isValid() && departureDate ? parsed.startOf('day') : minDay;
  if (selected.isBefore(minDay)) selected = minDay;
  if (selected.isAfter(maxDay)) selected = maxDay;

  let start = selected.subtract(DAY_WINDOW_DAYS_BEFORE, 'day');
  if (start.isBefore(minDay)) start = minDay;

  let end = start.add(DAY_WINDOW_SIZE - 1, 'day');
  if (end.isAfter(maxDay)) {
    // Slide back rather than shrink: a control whose size changes under the
    // customer is worse than one that slides. Fewer than DAY_WINDOW_SIZE chips
    // only when the whole legal range is shorter than the window.
    end = maxDay;
    start = end.subtract(DAY_WINDOW_SIZE - 1, 'day');
    if (start.isBefore(minDay)) start = minDay;
  }

  const days: string[] = [];
  for (let day = start; !day.isAfter(end); day = day.add(1, 'day')) {
    days.push(day.format('YYYY-MM-DD'));
  }
  return days;
}

/**
 * The availability request for a window, or `null` when the filter cannot
 * produce a search at all — mirroring `ScheduleBookingFilterComponent
 * .isSearchable()`, plus the passenger ceiling the server validates
 * (`byte 1..MAX_PASSENGERS_PER_BOOKING`, a 400 otherwise).
 */
export function availabilityRequestFor(
  filter: ScheduleFilter | null | undefined,
  stations: StationApi[] | null | undefined,
  windowDays: string[]
): ScheduleAvailabilityReq | null {
  if (!windowDays.length) return null;

  const fromStop = getStationSlugById(filter?.startStationId, stations);
  const toStop = getStationSlugById(filter?.stopStationId, stations);
  if (!fromStop || !toStop) return null;

  const numberOfPassengers = (filter?.passengerInfo ?? []).reduce(
    (total, passenger) => total + (passenger?.count || 0),
    0
  );
  if (numberOfPassengers < 1 || numberOfPassengers > MAX_PASSENGERS_PER_BOOKING) {
    return null;
  }

  return {
    fromStop,
    toStop,
    numberOfPassengers,
    fromDate: windowDays[0],
    days: windowDays.length,
  };
}

/** The cache/dedup identity of a request — also what "the question changed"
 *  means for the `distinctUntilChanged` that decides when to re-ask. */
export function availabilityRequestKey(
  request: ScheduleAvailabilityReq | null
): string {
  if (!request) return '';
  return [
    request.fromStop,
    request.toStop,
    request.numberOfPassengers,
    request.fromDate,
    request.days,
  ].join('|');
}
