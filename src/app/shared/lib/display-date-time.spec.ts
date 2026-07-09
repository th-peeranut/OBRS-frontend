import { formatDisplayDate, formatDisplayDateTime } from './display-date-time';

describe('formatDisplayDateTime', () => {
  const ISO = '2026-07-08T08:32:44.105575+07:00'; // Bangkok 08:32, day 8

  it('returns "-" for empty / nullish input', () => {
    expect(formatDisplayDateTime('')).toBe('-');
    expect(formatDisplayDateTime(null)).toBe('-');
    expect(formatDisplayDateTime(undefined)).toBe('-');
  });

  it('echoes the raw value when it cannot be parsed', () => {
    expect(formatDisplayDateTime('not-a-date')).toBe('not-a-date');
  });

  it('formats Thai by default — the OBRS-178 standard "D MMM YYYY HH:mm"', () => {
    // Day-first, no leading zero, localized month, space separator, 24h, Gregorian.
    expect(formatDisplayDateTime(ISO)).toBe('8 ก.ค. 2026 08:32');
    expect(formatDisplayDateTime(ISO)).not.toContain('2569'); // not Buddhist era
  });

  it('formats English with the same day-first shape, localized month only', () => {
    expect(formatDisplayDateTime(ISO, 'en')).toBe('8 Jul 2026 08:32');
  });

  it('localizes Chinese months (zh is a shipped UI language)', () => {
    expect(formatDisplayDateTime(ISO, 'zh')).toBe('8 7月 2026 08:32');
  });

  it('falls back to English months for an unknown locale', () => {
    expect(formatDisplayDateTime(ISO, 'ja')).toBe('8 Jul 2026 08:32');
  });

  it('pins the wall-clock time to Asia/Bangkok regardless of the input offset', () => {
    // Same instant expressed in UTC — must still read 08:32 Bangkok time.
    expect(formatDisplayDateTime('2026-07-08T01:32:44Z')).toBe('8 ก.ค. 2026 08:32');
  });

  it('strips the leading zero from single-digit days and keeps 2-digit time', () => {
    expect(formatDisplayDateTime('2026-07-09T00:05:00+07:00')).toBe('9 ก.ค. 2026 00:05');
  });
});

describe('formatDisplayDate (date-only)', () => {
  const ISO = '2026-07-08T08:32:44.105575+07:00';

  it('returns "-" for empty and echoes an unparseable value', () => {
    expect(formatDisplayDate('')).toBe('-');
    expect(formatDisplayDate('nope')).toBe('nope');
  });

  it('formats the date without a time component (Style B, date-only)', () => {
    expect(formatDisplayDate(ISO)).toBe('8 ก.ค. 2026');
    expect(formatDisplayDate(ISO, 'en')).toBe('8 Jul 2026');
  });

  it('pins to Asia/Bangkok — a late-UTC instant rolls to the next Bangkok day', () => {
    // 2026-07-08T19:00Z = 2026-07-09 02:00 Bangkok → date is the 9th.
    expect(formatDisplayDate('2026-07-08T19:00:00Z')).toBe('9 ก.ค. 2026');
  });
});
