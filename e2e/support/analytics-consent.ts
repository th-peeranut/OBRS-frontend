/**
 * OBRS-882 — a settled PDPA analytics answer, seeded before Angular boots.
 *
 * WHY THIS EXISTS
 * OBRS-867 added `<app-analytics-consent-banner>` to the app shell. It renders whenever
 * `obrs_analytics_consent_v1` is absent from localStorage, which is the state of **every
 * fresh Playwright context**, and it is `position: fixed; bottom: 0; left: 0; right: 0;
 * z-index: 1000`. Anything anchored to the bottom of the viewport is therefore behind it
 * until the question is answered.
 *
 * That took out **23 of 132 cases in the gate lane** on the merge commit, across three
 * specs, and the lane stayed red for four more commits. The failures were not obviously
 * about consent: Playwright reports them as `locator.click: Test timeout of 60000ms
 * exceeded`, and the element it names is the one the spec wanted — `.report-fab`,
 * `button.btn-success` (the walk-in POS Sell button), `app-trip-details-edit-form
 * button.btn-primary`. Only the "intercepts pointer events" line deeper in the trace
 * names the banner.
 *
 * WHY `denied` IS THE DEFAULT AND NOT `granted`
 * Both dismiss the banner. `denied` also keeps `AnalyticsTagsService.load()` from ever
 * running, so no spec in a lane whose entire premise is "needs nothing but a browser"
 * can reach googletagmanager.com or clarity.ms. Today that is belt-and-braces — the gate
 * lane serves the DEFAULT configuration, where `environment.analytics` IDs are blank and
 * the loader no-ops — but the belt is one `fileReplacements` edit from being the only
 * thing there, and a hermetic lane should not depend on a build config to stay hermetic.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not hide the banner with CSS and it does not remove the component. Seeding a
 * real decision is the same state a returning customer is in, so the specs still run
 * against the layout everybody sees on their second visit. The FIRST visit — banner up —
 * is a real state with real consequences, and it has its own spec
 * (`analytics-consent-banner.spec.ts`) rather than being a thing every other spec has to
 * think about. Suppressing it here without that spec would have muted the alarm instead
 * of fixing anything.
 */

import { Page } from '@playwright/test';

/** Must stay in step with `ANALYTICS_CONSENT_STORAGE_KEY` in analytics-consent.service.ts. */
export const ANALYTICS_CONSENT_KEY = 'obrs_analytics_consent_v1';

export type SeededConsent = 'granted' | 'denied';

/**
 * Writes a settled consent decision so the banner never renders. Call it from
 * `test.beforeEach` BEFORE the first `page.goto` — `addInitScript` runs before Angular
 * boots, which is what `AnalyticsConsentService`'s constructor reads.
 *
 * `addInitScript` rather than a committed `storageState` file, for the reason
 * `playwright.gate.config.ts` gives at length: a `storageState` keys its localStorage to
 * an absolute origin, so it would silently apply to nothing the day `E2E_GATE_PORT`
 * changed.
 */
export async function seedAnalyticsConsent(
  page: Page,
  decision: SeededConsent = 'denied'
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: ANALYTICS_CONSENT_KEY, value: decision }
  );
}
