import {
  isWithinCurrentIsoWeekBangkok,
  isWithinRecentIsoWeeksBangkok,
  isoWeeksAgoBangkok,
} from './inspection-week';

// Thursday 2026-07-16 12:00 Bangkok (+07:00) — a stable mid-week anchor.
const NOW = new Date('2026-07-16T12:00:00+07:00');

describe('inspection-week', () => {
  describe('isoWeeksAgoBangkok', () => {
    it('returns 0 for a timestamp inside the same Bangkok ISO week', () => {
      // Monday of the same week, 00:05 Bangkok.
      expect(isoWeeksAgoBangkok('2026-07-13T00:05:00+07:00', NOW)).toBe(0);
      // Sunday 23:55 Bangkok, still the same week.
      expect(isoWeeksAgoBangkok('2026-07-19T23:55:00+07:00', NOW)).toBe(0);
    });

    it('returns 1 for a timestamp in the previous Bangkok ISO week', () => {
      expect(isoWeeksAgoBangkok('2026-07-12T23:55:00+07:00', NOW)).toBe(1);
      expect(isoWeeksAgoBangkok('2026-07-06T00:05:00+07:00', NOW)).toBe(1);
    });

    it('returns 2 for a timestamp two Bangkok ISO weeks back', () => {
      expect(isoWeeksAgoBangkok('2026-06-29T00:05:00+07:00', NOW)).toBe(2);
    });

    it('returns a negative number for a future week', () => {
      expect(isoWeeksAgoBangkok('2026-07-20T00:05:00+07:00', NOW)).toBe(-1);
    });

    it('returns null for empty/unparseable input', () => {
      expect(isoWeeksAgoBangkok(null, NOW)).toBeNull();
      expect(isoWeeksAgoBangkok(undefined, NOW)).toBeNull();
      expect(isoWeeksAgoBangkok('not-a-date', NOW)).toBeNull();
    });

    it('is stable across a UTC-day boundary that Bangkok has already crossed', () => {
      // 2026-07-12 18:00 UTC is still 2026-07-13 01:00 Bangkok (Monday, same
      // week as NOW) — a naive UTC-date comparison would misclassify this as
      // Sunday of the PREVIOUS week.
      expect(isoWeeksAgoBangkok('2026-07-12T18:00:00Z', NOW)).toBe(0);
    });
  });

  describe('isWithinCurrentIsoWeekBangkok', () => {
    it('is true for the current week and false for the previous one', () => {
      expect(isWithinCurrentIsoWeekBangkok('2026-07-14T09:00:00+07:00', NOW)).toBeTrue();
      expect(isWithinCurrentIsoWeekBangkok('2026-07-12T09:00:00+07:00', NOW)).toBeFalse();
    });
  });

  describe('isWithinRecentIsoWeeksBangkok', () => {
    it('includes the current + previous week when weeksBack=1, excludes older', () => {
      expect(isWithinRecentIsoWeeksBangkok('2026-07-14T09:00:00+07:00', 1, NOW)).toBeTrue();
      expect(isWithinRecentIsoWeeksBangkok('2026-07-06T09:00:00+07:00', 1, NOW)).toBeTrue();
      expect(isWithinRecentIsoWeeksBangkok('2026-06-29T09:00:00+07:00', 1, NOW)).toBeFalse();
    });

    it('returns false for empty input', () => {
      expect(isWithinRecentIsoWeeksBangkok(null, 1, NOW)).toBeFalse();
    });
  });
});
