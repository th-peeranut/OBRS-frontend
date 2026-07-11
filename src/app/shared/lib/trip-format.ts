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
 * Authoritative pickup→dropoff distance/duration, derived from the two stops'
 * offset-based fields on the seeded `route_stops` table (free — no Directions/
 * Distance-Matrix call). Each figure is resolved independently: a missing
 * value on either stop yields `null` for that figure rather than fabricating
 * a `0`, so a caller never renders a misleading "≈ 0 km"/"0 min".
 */
export function tripEstimateFromStops(
  pickup: RouteStop | null | undefined,
  dropoff: RouteStop | null | undefined
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
