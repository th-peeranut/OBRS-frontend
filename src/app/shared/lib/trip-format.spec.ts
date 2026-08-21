import {
  arrivalDateWhenDayDiffers,
  arrivesOnLaterBangkokDay,
  capitalizeVehicleType,
  durationHours,
  durationMinutes,
  durationMinutesTotal,
  formatTimeHHMM,
  isLowSeatCount,
  parsePricePerSeat,
  tripEstimateFromStops,
} from './trip-format';
import { RouteStop } from '../interfaces/route-map.interface';
import { BookingTicketStop } from '../interfaces/booking-ticket.interface';

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

  describe('isLowSeatCount', () => {
    it('is true when seats equal the threshold (inclusive)', () => {
      expect(isLowSeatCount(5, 5)).toBe(true);
    });

    it('is false when seats exceed the threshold', () => {
      expect(isLowSeatCount(6, 5)).toBe(false);
    });

    it('is false when seats are 0 (sold-out rows never reach this component)', () => {
      expect(isLowSeatCount(0, 5)).toBe(false);
    });

    it('is false when seats are null/undefined', () => {
      expect(isLowSeatCount(null, 5)).toBe(false);
      expect(isLowSeatCount(undefined, 5)).toBe(false);
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

    it('accepts a BookingTicketStop-shaped object (widened TripStopOffsets signature)', () => {
      const pickup: BookingTicketStop = {
        code: 'a',
        label: 'Station A',
        distanceKmFromOrigin: 10,
        offsetMinutesFromOrigin: 15,
      };
      const dropoff: BookingTicketStop = {
        code: 'b',
        label: 'Station B',
        distanceKmFromOrigin: 55,
        offsetMinutesFromOrigin: 60,
      };

      expect(tripEstimateFromStops(pickup, dropoff)).toEqual({
        distanceKm: 45,
        durationMinutes: 45,
      });
    });
  });

  // OBRS-861. Every timestamp here carries an explicit offset, because that is
  // what the endpoint actually sends: `POST /api/schedules/search` on SIT returns
  // `"departureDateTime":"2026-08-23T07:00:00+07:00"` (measured 2026-08-21).
  describe('arrivalDateWhenDayDiffers', () => {
    it('returns null when the bus arrives at 23:59 on its departure day (AC4)', () => {
      expect(
        arrivalDateWhenDayDiffers('2026-08-23T08:00:00+07:00', '2026-08-23T23:59:00+07:00')
      ).toBeNull();
    });

    it('returns the arrival date the moment it lands at 00:00 the next day (AC1)', () => {
      expect(
        arrivalDateWhenDayDiffers('2026-08-23T18:00:00+07:00', '2026-08-24T00:00:00+07:00')
      ).toBe('24/08/2026');
    });

    it('returns the real date when the trip crosses two days — nothing counts to 1 (AC3)', () => {
      expect(
        arrivalDateWhenDayDiffers('2026-08-23T18:00:00+07:00', '2026-08-25T05:30:00+07:00')
      ).toBe('25/08/2026');
    });

    it('returns null when arrival precedes departure — corrupt data gets no date', () => {
      expect(
        arrivalDateWhenDayDiffers('2026-08-24T05:30:00+07:00', '2026-08-23T18:00:00+07:00')
      ).toBeNull();
    });

    it('returns null for missing or unparseable input', () => {
      expect(arrivalDateWhenDayDiffers(null, '2026-08-24T05:30:00+07:00')).toBeNull();
      expect(arrivalDateWhenDayDiffers('2026-08-23T18:00:00+07:00', undefined)).toBeNull();
      expect(arrivalDateWhenDayDiffers('not-a-date', 'also-not-a-date')).toBeNull();
    });

    // The discriminating case for AC7: both instants fall on 23 Aug in UTC, and
    // only the Bangkok day tells them apart. An implementation that compared UTC
    // days — the shape the card warned about, citing OBRS-371/OBRS-448 — returns
    // null here and this assertion goes red.
    it('compares Bangkok days, not UTC days (AC7)', () => {
      expect(arrivalDateWhenDayDiffers('2026-08-23T13:00:00Z', '2026-08-23T19:00:00Z')).toBe(
        '24/08/2026'
      );
    });

    it('is unmoved by which equivalent offset the same instant is written in', () => {
      // 2026-08-23T17:00:00Z IS 2026-08-24T00:00:00+07:00.
      expect(
        arrivalDateWhenDayDiffers('2026-08-23T18:00:00+07:00', '2026-08-23T17:00:00Z')
      ).toBe('24/08/2026');
    });
  });

  describe('arrivesOnLaterBangkokDay (OBRS-1502)', () => {
    it('answers the same question its sibling answers, without the formatting', () => {
      expect(
        arrivesOnLaterBangkokDay('2026-08-23T18:00:00+07:00', '2026-08-24T00:00:00+07:00')
      ).toBeTrue();
      expect(
        arrivesOnLaterBangkokDay('2026-08-23T08:00:00+07:00', '2026-08-23T23:59:00+07:00')
      ).toBeFalse();
      expect(arrivesOnLaterBangkokDay(null, undefined)).toBeFalse();
    });
  });
});
