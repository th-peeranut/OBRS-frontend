import {
  splitDateTime,
  toDateControlValue,
  toDateInputValue,
  toTimeControlValue,
  toTimeInputValue,
} from './date-input-value';

describe('date-input-value', () => {
  describe('toDateInputValue', () => {
    it('formats a local date as YYYY-MM-DD with zero padding', () => {
      expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(toDateInputValue(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('ignores the time component', () => {
      expect(toDateInputValue(new Date(2026, 5, 9, 23, 59, 59))).toBe('2026-06-09');
    });

    it('returns an empty string for a missing or invalid date', () => {
      expect(toDateInputValue(null)).toBe('');
      expect(toDateInputValue(undefined)).toBe('');
      expect(toDateInputValue(new Date(NaN))).toBe('');
    });
  });

  describe('toDateControlValue', () => {
    it('parses YYYY-MM-DD into a local-midnight Date', () => {
      const parsed = toDateControlValue('2026-01-05');
      expect(parsed).toEqual(new Date(2026, 0, 5));
      expect(parsed?.getHours()).toBe(0);
    });

    it('trims surrounding whitespace', () => {
      expect(toDateControlValue('  2026-01-05 ')).toEqual(new Date(2026, 0, 5));
    });

    it('returns null for empty, missing, zero or non-numeric parts', () => {
      expect(toDateControlValue('')).toBeNull();
      expect(toDateControlValue(null)).toBeNull();
      expect(toDateControlValue(undefined)).toBeNull();
      expect(toDateControlValue('2026-00-10')).toBeNull();
      expect(toDateControlValue('2026-01')).toBeNull();
      expect(toDateControlValue('not-a-date')).toBeNull();
    });

    it('round-trips with toDateInputValue', () => {
      const value = '2026-02-28';
      expect(toDateInputValue(toDateControlValue(value))).toBe(value);
    });
  });

  describe('toTimeInputValue', () => {
    it('formats HH:mm with zero padding', () => {
      expect(toTimeInputValue(new Date(2026, 0, 1, 8, 5))).toBe('08:05');
      expect(toTimeInputValue(new Date(2026, 0, 1, 23, 59))).toBe('23:59');
    });

    it('returns an empty string for a missing or invalid date', () => {
      expect(toTimeInputValue(null)).toBe('');
      expect(toTimeInputValue(new Date(NaN))).toBe('');
    });
  });

  describe('toTimeControlValue', () => {
    it("parses HH:mm into today's Date at that time", () => {
      const parsed = toTimeControlValue('08:30');
      expect(parsed?.getHours()).toBe(8);
      expect(parsed?.getMinutes()).toBe(30);
      expect(parsed?.getSeconds()).toBe(0);
    });

    it('ignores seconds beyond the first five characters', () => {
      expect(toTimeControlValue('08:30:45')?.getMinutes()).toBe(30);
    });

    it('returns null for out-of-range or malformed values', () => {
      expect(toTimeControlValue('')).toBeNull();
      expect(toTimeControlValue(undefined)).toBeNull();
      expect(toTimeControlValue('24:00')).toBeNull();
      expect(toTimeControlValue('12:60')).toBeNull();
      expect(toTimeControlValue('noon')).toBeNull();
    });
  });

  describe('splitDateTime', () => {
    it('splits an ISO date-time on the T separator', () => {
      expect(splitDateTime('2026-01-05T08:30:00')).toEqual({ date: '2026-01-05', time: '08:30' });
    });

    it('splits a space-separated date-time', () => {
      expect(splitDateTime('2026-01-05 08:30')).toEqual({ date: '2026-01-05', time: '08:30' });
    });

    it('returns empty halves for a missing value', () => {
      expect(splitDateTime(null)).toEqual({ date: '', time: '' });
      expect(splitDateTime('   ')).toEqual({ date: '', time: '' });
    });

    it('leaves the time empty when only a date is given', () => {
      expect(splitDateTime('2026-01-05')).toEqual({ date: '2026-01-05', time: '' });
    });
  });
});
