/**
 * OBRS-1984 — how many seconds are left on the seat hold the customer is paying for.
 *
 * The /payment countdown used to be seeded from a hardcoded `15 * 60` in each of the two
 * payment panels, so switching tabs (the panels are `@if` branches - destroyed and rebuilt,
 * not hidden) or refreshing handed the customer a fresh 15 minutes over a hold that was
 * already half gone. 15 was also a guess: the real deadline is `bookings.expires_at`, which
 * the backend derives from `SEAT_RESERVATION_MINUTES` and an operator may configure away
 * from 15.
 *
 * Pure function with `now` injected, for the same reason `fleetRelativeTime` does it: the
 * boundaries are testable, and both panels re-derive from the deadline on every tick rather
 * than decrementing a counter - a backgrounded tab throttles `setInterval`, and a decremented
 * counter would drift behind the real hold while looking perfectly healthy.
 *
 * `null` means "no deadline is known" and is NOT the same as `0`: the panels show no
 * countdown at all rather than inventing one. See the components' `startCountdown`.
 */
export function remainingHoldSeconds(
  expiresAt: string | null | undefined,
  now: number
): number | null {
  if (!expiresAt) {
    return null;
  }

  const deadline = Date.parse(expiresAt);
  if (Number.isNaN(deadline)) {
    return null;
  }

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
