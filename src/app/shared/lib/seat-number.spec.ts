import { normalizeSeatAssignments, normalizeSeatNumber, toSeatLabel } from './seat-number';

describe('seat-number (OBRS-171)', () => {
  describe('normalizeSeatNumber', () => {
    it('strips a letter prefix down to bare digits', () => {
      expect(normalizeSeatNumber('A5')).toBe('5');
      expect(normalizeSeatNumber('B12')).toBe('12');
    });

    it('is a no-op on an already-bare numeric seat number', () => {
      expect(normalizeSeatNumber('7')).toBe('7');
    });

    it('returns an empty string for null/undefined/empty input', () => {
      expect(normalizeSeatNumber(null)).toBe('');
      expect(normalizeSeatNumber(undefined)).toBe('');
      expect(normalizeSeatNumber('')).toBe('');
    });
  });

  describe('toSeatLabel', () => {
    it('prefixes a bare numeric seat with "A" for a van vehicleType', () => {
      expect(toSeatLabel('van', '5')).toBe('A5');
    });

    it('also treats "minibus" as a van layout', () => {
      expect(toSeatLabel('minibus', '5')).toBe('A5');
    });

    it('prefixes a bare numeric seat with "B" for a bus (or any other) vehicleType', () => {
      expect(toSeatLabel('bus', '12')).toBe('B12');
    });

    it('is idempotent against an already letter-prefixed seat matching the vehicleType', () => {
      expect(toSeatLabel('bus', 'B1')).toBe('B1');
      expect(toSeatLabel('van', 'A1')).toBe('A1');
    });

    it('is case-insensitive on vehicleType', () => {
      expect(toSeatLabel('VAN', '3')).toBe('A3');
    });

    it('returns the input unchanged when it has no digits at all', () => {
      expect(toSeatLabel('van', '')).toBe('');
    });
  });

  describe('normalizeSeatAssignments', () => {
    it('normalizes every value in a ticketId -> seat map to bare digits', () => {
      expect(normalizeSeatAssignments({ 11: 'A5', 12: 'B12', 13: '7' })).toEqual({
        11: '5',
        12: '12',
        13: '7',
      });
    });

    it('returns an empty map unchanged', () => {
      expect(normalizeSeatAssignments({})).toEqual({});
    });
  });
});
