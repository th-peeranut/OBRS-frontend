import {
  combineBangkokDateTime,
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
