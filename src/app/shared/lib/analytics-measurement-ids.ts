import { environment } from '../../../environments/environment';

/**
 * OBRS-1179 — is there a measurement tag for a visitor to consent TO?
 *
 * The consent surfaces and the tag loader used to answer two different
 * questions. `AnalyticsTagsService.loadGa4()`/`loadClarity()` return without
 * touching the DOM when their ID is blank, so a build with no IDs measures
 * nothing — but nothing told the banner, and it asked anyway. On prod that was
 * a PDPA ask for an activity that did not exist, and the answer was recorded:
 * a consent record with nothing behind it. It also hid the config mistake it
 * should have exposed — the day someone mistypes `PROD_GA4_MEASUREMENT_ID`,
 * the page looks exactly the same as the day it is right.
 *
 * So this reads the SAME two values the loader reads, in the same shape
 * (`?.trim()`, because a whitespace-only ID builds no URL either). Not a new
 * flag: a flag would be a third opinion, free to drift away from both.
 *
 * EITHER ID is enough. GA4 and Clarity load independently, so a build with one
 * of them still measures, and an ask is owed for it.
 *
 * Read on each call rather than captured at module load: `environment.analytics`
 * is a mutable object shared by reference, which is how the specs put a build
 * with IDs and a build without one in the same run.
 */
export function hasAnyMeasurementId(): boolean {
  const analytics = environment.analytics;
  return Boolean(analytics?.ga4MeasurementId?.trim() || analytics?.clarityProjectId?.trim());
}
