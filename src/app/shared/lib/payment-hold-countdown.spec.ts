import { remainingHoldSeconds } from './payment-hold-countdown';

/**
 * OBRS-1984. Every literal here carries an explicit offset on purpose: a spec fixture
 * without one is read in the RUNNER's timezone and can be green here and red on CI.
 */
describe('remainingHoldSeconds (OBRS-1984)', () => {
  const now = Date.parse('2026-09-19T10:00:00+07:00');

  it('returns the seconds left on the hold, whatever length the operator configured it', () => {
    // 4 minutes, not 15 - `SEAT_RESERVATION_MINUTES` is per-operator config.
    expect(remainingHoldSeconds('2026-09-19T10:04:00+07:00', now)).toBe(240);
    expect(remainingHoldSeconds('2026-09-19T10:15:00+07:00', now)).toBe(900);
  });

  it('reads the same instant through any offset - the deadline is a point in time, not a wall clock', () => {
    expect(remainingHoldSeconds('2026-09-19T03:04:00Z', now)).toBe(240);
  });

  it('floors at 0 once the deadline has passed, rather than going negative', () => {
    expect(remainingHoldSeconds('2026-09-19T09:59:00+07:00', now)).toBe(0);
  });

  it('answers null - NOT 0 - when no deadline is known, so callers can tell "unknown" from "expired"', () => {
    expect(remainingHoldSeconds(null, now)).toBeNull();
    expect(remainingHoldSeconds(undefined, now)).toBeNull();
    expect(remainingHoldSeconds('', now)).toBeNull();
    expect(remainingHoldSeconds('not-a-date', now)).toBeNull();
  });
});
