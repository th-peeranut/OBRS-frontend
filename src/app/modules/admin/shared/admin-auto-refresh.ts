import { interval, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * Default cadence for the operational admin pages (bookings, dashboard) that
 * poll for externally-produced updates while open. Tune here in one place.
 */
export const ADMIN_POLL_INTERVAL_MS = 20000;

/**
 * Poll `refresh` on an interval while the page is open. Skips ticks while the
 * tab is hidden so a backgrounded admin page doesn't keep hitting the backend.
 * The returned Subscription must be added to the component's teardown bag so
 * polling stops on navigate-away (the whole point — only poll the visible page).
 *
 * Overlap is harmless: the SWR stores dedupe concurrent refreshes, so a tick
 * that lands mid-refresh is collapsed rather than fanning out a second fetch.
 */
export function pollWhileVisible(
  refresh: () => void,
  intervalMs: number = ADMIN_POLL_INTERVAL_MS
): Subscription {
  return interval(intervalMs)
    .pipe(filter(() => !document.hidden))
    .subscribe(() => refresh());
}
