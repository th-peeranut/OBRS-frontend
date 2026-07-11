import {
  capitalizeVehicleType,
  durationHours,
  durationMinutes,
  durationMinutesTotal,
  formatTimeHHMM,
  parsePricePerSeat,
  tripEstimateFromStops,
} from './trip-format';
import { RouteStop } from '../interfaces/route-map.interface';

function makeStop(
  distanceKmFromOrigin: number | null,
  offsetMinutesFromOrigin: number | null
): RouteStop {
  return {
    order: 1,
    slug: 'stop',
    name: 'Stop',
    address: 'Addr',
    approxTime: '05:00',
    distanceKmFromOrigin,
    offsetMinutesFromOrigin,
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

describe('trip-format', () => {
  describe('formatTimeHHMM', () => {
    it('formats a valid datetime to HH:mm', () => {
      expect(formatTimeHHMM('2026-06-30T08:05:00')).toBe('08:05');
    });

    it('returns empty string for null/empty/invalid input', () => {
      expect(formatTimeHHMM(null)).toBe('');
      expect(formatTimeHHMM('')).toBe('');
      expect(formatTimeHHMM('not-a-date')).toBe('');
    });
  });

  describe('duration', () => {
    const start = '2026-06-30T08:00:00';
    const end = '2026-06-30T10:30:00';

    it('splits total minutes into hours and minutes', () => {
      expect(durationMinutesTotal(start, end)).toBe(150);
      expect(durationHours(start, end)).toBe(2);
      expect(durationMinutes(start, end)).toBe(30);
    });

    it('clamps negative durations to 0', () => {
      expect(durationMinutesTotal(end, start)).toBe(0);
    });

    it('returns 0 for missing/invalid input', () => {
      expect(durationMinutesTotal(null, end)).toBe(0);
      expect(durationMinutesTotal(start, 'bad')).toBe(0);
    });
  });

  describe('capitalizeVehicleType', () => {
    it('capitalizes the first letter', () => {
      expect(capitalizeVehicleType('minibus')).toBe('Minibus');
    });

    it('returns empty string for missing input', () => {
      expect(capitalizeVehicleType(null)).toBe('');
      expect(capitalizeVehicleType('')).toBe('');
    });
  });

  describe('parsePricePerSeat', () => {
    it('parses numeric strings and numbers', () => {
      expect(parsePricePerSeat('450.5')).toBe(450.5);
      expect(parsePricePerSeat(120)).toBe(120);
    });

    it('falls back to 0 for non-finite/missing input', () => {
      expect(parsePricePerSeat(null)).toBe(0);
      expect(parsePricePerSeat('abc')).toBe(0);
    });
  });

  describe('tripEstimateFromStops', () => {
    it('computes the absolute delta for both distance and duration', () => {
      const pickup = makeStop(10, 15);
      const dropoff = makeStop(55, 60);
      expect(tripEstimateFromStops(pickup, dropoff)).toEqual({
        distanceKm: 45,
        durationMinutes: 45,
      });
    });

    it('is order-independent (abs of the delta)', () => {
      const pickup = makeStop(55, 60);
      const dropoff = makeStop(10, 15);
      expect(tripEstimateFromStops(pickup, dropoff)).toEqual({
        distanceKm: 45,
        durationMinutes: 45,
      });
    });

    it('never fabricates 0 — a missing distance yields null distanceKm only', () => {
      const pickup = makeStop(null, 15);
      const dropoff = makeStop(55, 60);
      expect(tripEstimateFromStops(pickup, dropoff)).toEqual({
        distanceKm: null,
        durationMinutes: 45,
      });
    });

    it('never fabricates 0 — a missing offset yields null durationMinutes only', () => {
      const pickup = makeStop(10, null);
      const dropoff = makeStop(55, 60);
      expect(tripEstimateFromStops(pickup, dropoff)).toEqual({
        distanceKm: 45,
        durationMinutes: null,
      });
    });

    it('returns both null when pickup or dropoff is missing entirely', () => {
      expect(tripEstimateFromStops(null, makeStop(55, 60))).toEqual({
        distanceKm: null,
        durationMinutes: null,
      });
      expect(tripEstimateFromStops(makeStop(10, 15), undefined)).toEqual({
        distanceKm: null,
        durationMinutes: null,
      });
    });
  });
});
