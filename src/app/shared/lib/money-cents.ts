/**
 * OBRS-960: money-as-decimal-STRING parsing, lifted out of
 * `SettlementDetailModalComponent`'s private `toCents()` (OBRS-671) so every
 * new cash-handling form (driver cash advance/per-head/expense forms, the
 * driver-cash-day return modal) shares ONE implementation instead of each
 * re-deriving the same regex — see design-system.md DRY gate / CORE.md
 * "seat-attribute" precedent for the "lift the common part, don't fork"
 * rule. `SettlementDetailModalComponent.toCents()` now delegates here
 * (byte-identical behavior, call sites unchanged).
 *
 * A money value is valid iff it is a non-negative decimal with at most two
 * fraction digits. Converting to integer CENTS (rather than doing arithmetic
 * on the float) avoids binary floating-point drift — e.g. `0.1 + 0.2 !==
 * 0.3` in IEEE 754 — when comparing counted-vs-expected amounts.
 */
export function toCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  return Math.round(Number(trimmed) * 100);
}

/**
 * OBRS-1144: the same parser, but a leading minus is legal.
 *
 * Kept as a SEPARATE export rather than an `allowNegative` flag on
 * {@link toCents}, because the two are not two settings of one rule — they
 * are two different facts. `toCents` guards a physical cash COUNT (settlement
 * sign-off, OBRS-671): a stack of notes in someone's hand cannot be negative,
 * and the day that validator starts accepting `-` is the day a typo becomes a
 * silent credit. This one guards a BALANCE, which OBRS-1073 made genuinely
 * two-sided on the backend — a salesperson whose per-head pay exceeds the
 * cash they took in is owed money, so the day closes at a negative amount and
 * `DriverCashReturnReqDto` dropped its `@DecimalMin("0.0")` floor to say so.
 * The frontend was still refusing to let anyone type it.
 *
 * Same integer-cents contract as {@link toCents}, same float-drift reasoning.
 */
export function toSignedCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  return Math.round(Number(trimmed) * 100);
}

/** Inverse of {@link toCents} — integer cents back to a 2-decimal string. */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}
