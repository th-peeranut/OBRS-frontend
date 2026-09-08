import { MAX_RANGE_SPAN_DAYS, dateRangeErrorKey } from './date-range-guard';

/**
 * OBRS-1754. The eleven copies this replaces each had their own tests through their own page;
 * those stay green untouched, which is the card's own proof that nothing changed. These pin the
 * rule itself — the boundary in particular, which no page spec measured.
 */
describe('dateRangeErrorKey', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00`);

  it('accepts a range in order and inside the cap', () => {
    expect(dateRangeErrorKey(day('2026-01-01'), day('2026-03-01'), '2026-01-01', '2026-03-01', 'X'))
      .toBe('');
  });

  it('refuses a reversed range with the prefix the caller owns', () => {
    expect(dateRangeErrorKey(day('2026-03-01'), day('2026-01-01'), '2026-03-01', '2026-01-01',
      'ADMIN.SETTLEMENTS.ERROR')).toBe('ADMIN.SETTLEMENTS.ERROR.RANGE_INVALID');
  });

  it('accepts a span of exactly the cap and refuses one day more', () => {
    // 2026-01-01 + 366 days = 2027-01-02 (2026 is not a leap year, so this is a full year + 1).
    const from = day('2026-01-01');
    const atCap = new Date(from.getTime() + MAX_RANGE_SPAN_DAYS * 24 * 60 * 60 * 1000);
    const overCap = new Date(from.getTime() + (MAX_RANGE_SPAN_DAYS + 1) * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    expect(dateRangeErrorKey(from, atCap, '2026-01-01', iso(atCap), 'X')).toBe('');
    expect(dateRangeErrorKey(from, overCap, '2026-01-01', iso(overCap), 'X')).toBe('X.RANGE_TOO_LARGE');
  });

  it('reports the ORDER first when a range is both reversed and huge', () => {
    // Which one wins is not a preference — every copy checked order first, and a page's spec that
    // asserts RANGE_INVALID for a reversed pair must keep passing.
    expect(dateRangeErrorKey(day('2030-01-01'), day('2020-01-01'), '2030-01-01', '2020-01-01', 'X'))
      .toBe('X.RANGE_INVALID');
  });

  it('compares the ORDER on the calendar-day strings, not on the Dates', () => {
    // The same day, one held at 23:00 and one at 01:00. Comparing the Dates would call this
    // reversed; comparing the days the caller is actually going to send does not.
    const late = new Date('2026-05-05T23:00:00');
    const early = new Date('2026-05-05T01:00:00');

    expect(dateRangeErrorKey(late, early, '2026-05-05', '2026-05-05', 'X')).toBe('');
  });
});
