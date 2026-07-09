import { formatDisplayDateTime } from './display-date-time';

describe('formatDisplayDateTime', () => {
  const ISO = '2026-07-08T08:32:44.105575+07:00'; // Bangkok 08:32

  it('returns "-" for empty / nullish input', () => {
    expect(formatDisplayDateTime('')).toBe('-');
    expect(formatDisplayDateTime(null)).toBe('-');
    expect(formatDisplayDateTime(undefined)).toBe('-');
  });

  it('echoes the raw value when it cannot be parsed', () => {
    expect(formatDisplayDateTime('not-a-date')).toBe('not-a-date');
  });

  it('formats in Thai by default — Gregorian year, Latin digits, no raw ISO', () => {
    const out = formatDisplayDateTime(ISO);
    expect(out).toContain('ก.ค.'); // Thai short month
    expect(out).toContain('2026'); // Gregorian, not Buddhist 2569
    expect(out).not.toContain('2569');
    expect(out).toContain('08:32'); // 24h, pinned to Asia/Bangkok
    expect(out).not.toContain('+07:00'); // offset stripped
    expect(out).not.toContain('105575'); // microseconds stripped
  });

  it('formats in the en-US house style when lang starts with "en"', () => {
    const out = formatDisplayDateTime(ISO, 'en');
    expect(out).toContain('Jul');
    expect(out).toContain('2026');
    expect(out).toContain('08:32');
  });

  it('treats a non-th, non-en locale (e.g. zh) as the en fallback', () => {
    expect(formatDisplayDateTime(ISO, 'zh')).toContain('Jul');
  });

  it('pins the wall-clock time to Asia/Bangkok regardless of the input offset', () => {
    // Same instant expressed in UTC — must still read 08:32 Bangkok time.
    expect(formatDisplayDateTime('2026-07-08T01:32:44Z')).toContain('08:32');
  });
});
