import {
  combineBangkokDateTime,
  controlValueToDateString,
  controlValueToTimeString,
  dateStringToControlValue,
  splitApiOffsetDateTime,
  timeStringToControlValue,
  toApiOffsetDateTime,
} from './api-date-time';

describe('API date-time helpers', () => {
  it('preserves an existing offset from a backend response', () => {
    expect(toApiOffsetDateTime('2026-06-20T08:00:00+07:00')).toBe(
      '2026-06-20T08:00:00+07:00'
    );
  });

  it('adds the Bangkok offset to an offset-less date-time', () => {
    expect(toApiOffsetDateTime('2026-06-20T08:00:00')).toBe(
      '2026-06-20T08:00:00+07:00'
    );
  });

  it('combines admin schedule date and time with the Bangkok offset', () => {
    expect(combineBangkokDateTime('2026-06-20', '08:30')).toBe(
      '2026-06-20T08:30:00+07:00'
    );
  });
});

// OBRS-272: the split/control-value round-trip used to pre-fill the delay
// dialog's date+time p-calendar pair from a stored offset ISO string.
describe('splitApiOffsetDateTime()', () => {
  it('splits an offset date-time into date + HH:mm time', () => {
    expect(splitApiOffsetDateTime('2026-06-20T08:30:00+07:00')).toEqual({
      date: '2026-06-20',
      time: '08:30',
    });
  });

  it('returns empty strings for empty/null input', () => {
    expect(splitApiOffsetDateTime(null)).toEqual({ date: '', time: '' });
    expect(splitApiOffsetDateTime('')).toEqual({ date: '', time: '' });
  });
});

describe('dateStringToControlValue() / controlValueToDateString()', () => {
  it('round-trips YYYY-MM-DD through a Date control value', () => {
    const control = dateStringToControlValue('2026-06-20');
    expect(control).not.toBeNull();
    expect(controlValueToDateString(control)).toBe('2026-06-20');
  });

  it('returns null / "" for empty input', () => {
    expect(dateStringToControlValue('')).toBeNull();
    expect(dateStringToControlValue(null)).toBeNull();
    expect(controlValueToDateString(null)).toBe('');
  });
});

describe('timeStringToControlValue() / controlValueToTimeString()', () => {
  it('round-trips HH:mm through a Date control value', () => {
    const control = timeStringToControlValue('08:30');
    expect(control).not.toBeNull();
    expect(controlValueToTimeString(control)).toBe('08:30');
  });

  it('rejects an out-of-range time', () => {
    expect(timeStringToControlValue('25:00')).toBeNull();
    expect(timeStringToControlValue('08:70')).toBeNull();
  });

  it('returns null / "" for empty input', () => {
    expect(timeStringToControlValue('')).toBeNull();
    expect(controlValueToTimeString(null)).toBe('');
  });
});
