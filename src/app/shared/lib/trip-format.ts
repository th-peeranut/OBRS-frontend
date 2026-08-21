import dayjs from 'dayjs';
import { RouteStop, TripEstimate } from '../interfaces/route-map.interface';

/**
 * Pure presentation formatters for a trip/schedule row — departure time, journey
 * duration, vehicle-type label, per-seat price, and seat-availability status. These
 * were duplicated verbatim across the schedule-booking, payment, review,
 * passenger-info and e-ticket components; this is their single home so a formatting
 * fix lands in one place and the logic is unit-testable without a component harness.
 */

/** Formats an ISO/date string to `HH:mm` (24h). Empty string for missing/invalid input. */
export function formatTimeHHMM(dateTime: string | null | undefined): string {
  if (!dateTime) return '';
  const parsed = dayjs(dateTime);
  return parsed.isValid() ? parsed.format('HH:mm') : '';
}

/**
 * Thailand's UTC offset, in minutes. A constant is EXACT here, not an
 * approximation: the country has kept a single +07:00 offset with no DST since
 * 1920. It buys the one thing a browser-local `format()` cannot give — the
 * calendar day as Bangkok sees it, whatever timezone the viewer's device is set
 * to — without pulling in dayjs's utc/timezone plugins, which this app loads
 * nowhere (`dayjs.extend` appears in no file under `src/`).
 */
const BANGKOK_OFFSET_MINUTES = 7 * 60;

/**
 * The Bangkok calendar day of an instant, in two shapes: `iso` sorts, `display`
 * renders. `null` for missing/invalid input.
 *
 * Shifting the instant by the offset and then reading the UTC fields is what
 * makes the day Bangkok's rather than the device's.
 */
function bangkokDay(
  dateTime: string | null | undefined
): { iso: string; display: string } | null {
  if (!dateTime) return null;
  const parsed = dayjs(dateTime);
  if (!parsed.isValid()) return null;

  const wallClock = new Date(parsed.valueOf() + BANGKOK_OFFSET_MINUTES * 60_000);
  const year = String(wallClock.getUTCFullYear());
  const month = String(wallClock.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wallClock.getUTCDate()).padStart(2, '0');

  return { iso: `${year}-${month}-${day}`, display: `${day}/${month}/${year}` };
}

/**
 * OBRS-861 — the arrival's calendar date as `DD/MM/YYYY`, but ONLY when the trip
 * lands on a LATER Bangkok day than it departed; `null` otherwise.
 *
 * `null` is the common case and is what keeps a same-day row byte-identical to
 * before this card (AC4) — an 18:00 → 05:30 overnight was showing a bare
 * `05:30`, which a customer reads as the day they picked in the form, a day
 * earlier than the bus actually arrives.
 *
 * The comparison is between the two TIMESTAMPS' own days, deliberately not the
 * date chosen in the search form (a delayed round can already sit under an
 * earlier date — OBRS-1099) and not `durationMinutesTotal > 24h` (an 8-hour
 * round leaving at 22:00 crosses midnight without coming near 24 hours).
 *
 * A `+2` needs nothing special: the date says which day it is, so nothing here
 * counts days (AC3). Arrival before departure — corrupt data — returns `null`
 * rather than a date in the past.
 */
export function arrivalDateWhenDayDiffers(
  departureDateTime: string | null | undefined,
  arrivalDateTime: string | null | undefined
): string | null {
  const departureDay = bangkokDay(departureDateTime);
  const arrivalDay = bangkokDay(arrivalDateTime);
  if (!departureDay || !arrivalDay) return null;

  return arrivalDay.iso > departureDay.iso ? arrivalDay.display : null;
}

/** Whole minutes between two date strings, clamped to `>= 0`. `0` for missing/invalid input. */
export function durationMinutesTotal(
  startDateTime: string | null | undefined,
  endDateTime: string | null | undefined
): number {
  if (!startDateTime || !endDateTime) return 0;
  const start = dayjs(startDateTime);
  const end = dayjs(endDateTime);
  if (!start.isValid() || !end.isValid()) return 0;
  const diff = end.diff(start, 'minute');
  return diff >= 0 ? diff : 0;
}

/** Hours component of the journey duration. */
export function durationHours(
  startDateTime: string | null | undefined,
  endDateTime: string | null | undefined
): number {
  return Math.floor(durationMinutesTotal(startDateTime, endDateTime) / 60);
}

/** Minutes component (0–59) of the journey duration. */
export function durationMinutes(
  startDateTime: string | null | undefined,
  endDateTime: string | null | undefined
): number {
  return durationMinutesTotal(startDateTime, endDateTime) % 60;
}

/** Capitalizes the first letter of a vehicle-type label. Empty string for missing input. */
export function capitalizeVehicleType(type: string | null | undefined): string {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Coerces a price-like value to a finite number, falling back to `0`. */
export function parsePricePerSeat(value: string | number | null | undefined): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether a schedule row's remaining-seat count should be surfaced as a
 * scarcity warning: `1..threshold` seats (inclusive). `0`/missing seats is
 * deliberately `false` (no warning) — the search endpoint
 * (`ScheduleRepository.searchSchedulesWithAvailability`) already filters out
 * any schedule without enough seats for the party, so a sold-out row never
 * reaches this component; every row shown here is bookable. Above the
 * threshold is also `false` — the exact count is only shown when scarce.
 */
export function isLowSeatCount(
  availableSeats: number | null | undefined,
  threshold: number
): boolean {
  return availableSeats != null && availableSeats > 0 && availableSeats <= threshold;
}

/**
 * Structural subset of `RouteStop` carrying only the two offset-based fields
 * `tripEstimateFromStops` reads. Lets other API shapes that carry the same
 * two fields (e.g. `BookingTicketStop`) type-check without widening to the
 * full `RouteStop` shape.
 */
export type TripStopOffsets = Pick<
  RouteStop,
  'distanceKmFromOrigin' | 'offsetMinutesFromOrigin'
>;

/**
 * Authoritative pickup→dropoff distance/duration, derived from the two stops'
 * offset-based fields on the seeded `route_stops` table (free — no Directions/
 * Distance-Matrix call). Each figure is resolved independently: a missing
 * value on either stop yields `null` for that figure rather than fabricating
 * a `0`, so a caller never renders a misleading "≈ 0 km"/"0 min".
 */
export function tripEstimateFromStops(
  pickup: TripStopOffsets | null | undefined,
  dropoff: TripStopOffsets | null | undefined
): TripEstimate {
  const pickupDistance = pickup?.distanceKmFromOrigin;
  const dropoffDistance = dropoff?.distanceKmFromOrigin;
  const distanceKm =
    pickupDistance != null && dropoffDistance != null
      ? Math.round(Math.abs(dropoffDistance - pickupDistance))
      : null;

  const pickupOffset = pickup?.offsetMinutesFromOrigin;
  const dropoffOffset = dropoff?.offsetMinutesFromOrigin;
  const durationMinutes =
    pickupOffset != null && dropoffOffset != null
      ? Math.round(Math.abs(dropoffOffset - pickupOffset))
      : null;

  return { distanceKm, durationMinutes };
}
