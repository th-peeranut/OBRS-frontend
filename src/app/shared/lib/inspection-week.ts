/**
 * OBRS-312: ISO week (Monday–Sunday) helpers in `Asia/Bangkok`, mirroring the
 * backend's `date_trunc('week', …)` grouping (Postgres ISO week, Monday
 * start). Thailand has no DST, so a fixed-offset read via `Intl` is safe and
 * deterministic under test — same approach as `display-date-time.ts`'s
 * `bangkokParts()`, just reduced to the calendar date (no time-of-day).
 *
 * Used for two distinct, both non-gating, purposes:
 * - the driver form's "already inspected this week" dismissible hint
 *   (current week only);
 * - the owner history tab's default pending-filter window (current +
 *   previous week), which stays a **switchable filter** (never a hard query
 *   bound) — see `vehicle-inspection.mappers.ts`.
 */

const bangkokDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bangkok calendar date for `value`, represented as the UTC-ms midnight of
 * that date (a stable, DST-free integer for day-difference math). */
function bangkokDateOnlyUtcMs(value: Date): number {
  const parts = bangkokDateFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return Date.UTC(get('year'), get('month') - 1, get('day'));
}

/** Monday 00:00 (UTC-ms representation) of the ISO week containing `dateOnlyUtcMs`. */
function isoWeekStartUtcMs(dateOnlyUtcMs: number): number {
  const jsDay = new Date(dateOnlyUtcMs).getUTCDay(); // 0=Sun..6=Sat
  const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
  return dateOnlyUtcMs - (isoDay - 1) * DAY_MS;
}

/** Whole ISO weeks between `isoDateTime`'s Bangkok week and `now`'s Bangkok
 * week (0 = same week, 1 = the week before, negative = a future week).
 * Returns `null` for empty/unparseable input. */
export function isoWeeksAgoBangkok(
  isoDateTime: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!isoDateTime) {
    return null;
  }
  const inspected = new Date(isoDateTime);
  if (!Number.isFinite(inspected.getTime())) {
    return null;
  }

  const currentWeekStart = isoWeekStartUtcMs(bangkokDateOnlyUtcMs(now));
  const inspectedWeekStart = isoWeekStartUtcMs(bangkokDateOnlyUtcMs(inspected));
  return Math.round((currentWeekStart - inspectedWeekStart) / (7 * DAY_MS));
}

/** True when `isoDateTime` falls inside the current Bangkok ISO week (Mon–Sun). */
export function isWithinCurrentIsoWeekBangkok(
  isoDateTime: string | null | undefined,
  now: Date = new Date()
): boolean {
  return isoWeeksAgoBangkok(isoDateTime, now) === 0;
}

/** True when `isoDateTime` falls inside the current week or up to `weeksBack`
 * whole ISO weeks before it (e.g. `weeksBack=1` → current + previous week). A
 * future-dated value (negative weeks-ago) is still included — this only ever
 * narrows the OLDER bound. */
export function isWithinRecentIsoWeeksBangkok(
  isoDateTime: string | null | undefined,
  weeksBack: number,
  now: Date = new Date()
): boolean {
  const weeksAgo = isoWeeksAgoBangkok(isoDateTime, now);
  return weeksAgo !== null && weeksAgo <= weeksBack;
}
