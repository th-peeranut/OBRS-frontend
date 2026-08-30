import {
  bangkokDayKey,
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayTime,
} from './display-date-time';

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

// SPEC-OBRS-426 BR-12a: time-only formatter, deliberately separate from
// formatDisplayDateTime — see that spec's table for why the split is
// mandatory (recordedAt vs windowOpensAt).
describe('formatDisplayTime (time-only, language-independent)', () => {
  const ISO = '2026-07-08T08:32:44.105575+07:00'; // Bangkok 08:32

  it('returns "-" for empty / nullish input', () => {
    expect(formatDisplayTime('')).toBe('-');
    expect(formatDisplayTime(null)).toBe('-');
    expect(formatDisplayTime(undefined)).toBe('-');
  });

  it('echoes the raw value when it cannot be parsed', () => {
    expect(formatDisplayTime('not-a-date')).toBe('not-a-date');
  });

  it('formats 24h time only, no date/month at all', () => {
    expect(formatDisplayTime(ISO)).toBe('08:32');
  });

  it('pins the wall-clock time to Asia/Bangkok regardless of the input offset', () => {
    expect(formatDisplayTime('2026-07-08T01:32:44Z')).toBe('08:32');
  });

  it('normalizes midnight (ICU "24") to "00"', () => {
    expect(formatDisplayTime('2026-07-09T00:05:00+07:00')).toBe('00:05');
  });
});

// OBRS-1585: the day a staff row belongs to is decided here, on the same clock
// that prints the row's date column. The four shapes below are the ones the API
// has actually emitted for `departureDateTime` (see bangkokInstantMs's
// OBRS-574 note) and they all describe the same instant: 06:30 on 21 Dec 2026,
// Bangkok. The `Z` one is the case that used to break — as a raw string it
// starts with the 20th.
describe('bangkokDayKey — the filter clock is the display clock', () => {
  const SAME_MOMENT_FOUR_WAYS = [
    '2026-12-21T06:30:00+07:00',
    '2026-12-21T06:30:00',
    '2026-12-20T23:30:00Z',
    '2026-12-21 06:30:00',
  ];

  it('answers the same Bangkok day for all four shapes', () => {
    for (const value of SAME_MOMENT_FOUR_WAYS) {
      expect(bangkokDayKey(value)).toBe('2026-12-21');
    }
  });

  it('agrees with the date column rendered from the same value', () => {
    for (const value of SAME_MOMENT_FOUR_WAYS) {
      expect(formatDisplayDateTime(value)).toBe('21 ธ.ค. 2026 06:30');
    }
  });

  it('zero-pads month and day so it compares to controlValueToDateString()', () => {
    expect(bangkokDayKey('2026-01-05T08:00:00+07:00')).toBe('2026-01-05');
  });

  it('returns "" for empty and unparseable input — a key that matches no day', () => {
    expect(bangkokDayKey('')).toBe('');
    expect(bangkokDayKey(null)).toBe('');
    expect(bangkokDayKey(undefined)).toBe('');
    expect(bangkokDayKey('-')).toBe('');
    expect(bangkokDayKey('not-a-date')).toBe('');
  });
});

// OBRS-1585: pinning an offset-less date-TIME to Bangkok must not reach a
// date-only string — `new Date('2026-07-08+07:00')` is Invalid Date, and
// expenseDate / nextDueDate / a split departure date are passed in exactly
// that shape.
describe('formatDisplayDate on a plain YYYY-MM-DD', () => {
  it('still renders the day it names', () => {
    expect(formatDisplayDate('2026-07-08')).toBe('8 ก.ค. 2026');
    expect(formatDisplayDate('2026-07-08', 'en')).toBe('8 Jul 2026');
  });
});
