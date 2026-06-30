import {
  capitalizeVehicleType,
  durationHours,
  durationMinutes,
  durationMinutesTotal,
  formatTimeHHMM,
  parsePricePerSeat,
} from './trip-format';

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
});
