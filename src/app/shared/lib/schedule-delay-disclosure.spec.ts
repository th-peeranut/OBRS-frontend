import dayjs from 'dayjs';
import { delayDisclosureOf } from './schedule-delay-disclosure';

describe('delayDisclosureOf (OBRS-1141)', () => {
  it('returns null when the backend sent no planned time — the round is not delayed (AC2)', () => {
    expect(delayDisclosureOf('2026-08-08T07:00:00', null)).toBeNull();
    expect(delayDisclosureOf('2026-08-08T07:00:00', undefined)).toBeNull();
    expect(delayDisclosureOf('2026-08-08T07:00:00', '')).toBeNull();
  });

  it('discloses both times when a delay is announced (AC1)', () => {
    const disclosure = delayDisclosureOf(
      '2026-08-08T09:00:00',
      '2026-08-08T07:00:00'
    );

    expect(disclosure).toEqual({
      plannedTime: '07:00',
      effectiveTime: '09:00',
      delayMinutes: 120,
      effectiveDate: null,
    });
  });

  it('carries the effective DATE only when the delay crosses midnight (AC5)', () => {
    // The exact case ScheduleDelayReachesEveryReadPathIT locks on the backend:
    // a 23:30 round delayed to 00:30 stays in the searched day's results.
    const disclosure = delayDisclosureOf(
      '2026-08-09T00:30:00',
      '2026-08-08T23:30:00'
    );

    expect(disclosure?.plannedTime).toBe('23:30');
    expect(disclosure?.effectiveTime).toBe('00:30');
    expect(disclosure?.delayMinutes).toBe(60);
    expect(disclosure?.effectiveDate).toBe('09/08/2026');
  });

  it('returns null for a zero-length delay rather than rendering "07:00 -> 07:00 (delayed)"', () => {
    // Reachable: the backend floors its shift at zero (OBRS-1099 AC8), so a
    // planned time equal to the effective one is a representable state.
    expect(
      delayDisclosureOf('2026-08-08T07:00:00', '2026-08-08T07:00:00')
    ).toBeNull();
  });

  it('returns null when the planned time is AFTER the effective one', () => {
    expect(
      delayDisclosureOf('2026-08-08T07:00:00', '2026-08-08T09:00:00')
    ).toBeNull();
  });

  it('returns null for an unparseable timestamp instead of printing "Invalid Date"', () => {
    expect(delayDisclosureOf('2026-08-08T09:00:00', 'not-a-date')).toBeNull();
    expect(delayDisclosureOf('not-a-date', '2026-08-08T07:00:00')).toBeNull();
  });

  it('reports whole minutes for a sub-hour delay', () => {
    const disclosure = delayDisclosureOf(
      '2026-08-08T07:45:00',
      '2026-08-08T07:00:00'
    );

    expect(disclosure?.delayMinutes).toBe(45);
    expect(disclosure?.effectiveDate).toBeNull();
  });

  // WHY NO TIMEZONE OFFSET ON THE FIXTURES ABOVE. The backend sends
  // OffsetDateTime, so the wire values DO carry one -- but dayjs parses an
  // offsetless datetime as LOCAL, which makes the rendered HH:mm identical in
  // every zone. Written with '+07:00' these specs passed on a machine in
  // Asia/Bangkok and failed in CI's UTC, where 08:00+07:00 renders as 01:00
  // (measured, OBRS-1141: 10 of the 24 new tests). Do not add the offset back.
  //
  // This one keeps the wire shape on purpose and asserts RELATIONALLY, so the
  // offset path stays covered without anything here becoming zone-dependent.
  it('accepts the wire shape (an explicit offset) and measures the gap between the two instants', () => {
    const disclosure = delayDisclosureOf(
      '2026-08-08T09:00:00+07:00',
      '2026-08-08T07:00:00+07:00'
    );

    expect(disclosure?.delayMinutes).toBe(120);
    expect(disclosure?.plannedTime).toBe(dayjs('2026-08-08T07:00:00+07:00').format('HH:mm'));
    expect(disclosure?.effectiveTime).toBe(dayjs('2026-08-08T09:00:00+07:00').format('HH:mm'));
  });
});
