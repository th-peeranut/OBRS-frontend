import { expect, test, BrowserContext, Page, Request } from '@playwright/test';

/**
 * OBRS-1195 — the landing page of a first visit, counted on the wire.
 *
 * WHY THIS CANNOT BE A KARMA SPEC. The unit suite asserts that
 * `AnalyticsTagsService.sendEvent` was called, and the bug this card fixes was
 * measured one layer further out: `page_view = 0` on prod for a first visit,
 * counted as requests to `/g/collect`. Between `sendEvent` and that request sit
 * `suspended`, `ga-disable-<id>`, gtag's own queue and `send_page_view: false` —
 * every one of them a place where a green spy and a silent network agree.
 * So this lane counts the hit, not the call (AC-5).
 *
 * Runs on playwright.obrs867.config.ts (the `analytics-e2e` build, the only one
 * carrying a measurement ID) for the reason that config's header gives: against
 * a blank-ID build nothing is ever requested and every expectation below would
 * pass without a tag existing.
 *
 * THE CONTROL IS THE FIRST TEST, NOT A COURTESY. "I counted exactly one
 * page_view" is a claim about the second one being absent, and an absence is
 * what a broken parser and a healthy app report identically. `MUST-CATCH:
 * a returning visitor` is the case that proves this file can see a page_view at
 * all; if it fails, nothing else here means anything and the fix is to repair
 * the lane, never to delete the control.
 *
 * WHICH ARMS LIVE WHERE. AC-3 (accepting while on a staff page sends nothing)
 * is pinned in analytics.service.spec.ts instead, and deliberately: the consent
 * banner is HIDDEN on a restricted route, so there is no button to click in a
 * browser — the arm is only reachable where the route table can be faked. What
 * a browser can prove, and does below, is the negative arm that a careless
 * replay would break: a visitor who DECLINES must produce nothing at all.
 */

const CONSENT_KEY = 'obrs_analytics_consent_v1';

/** A collect endpoint, on either of the hosts gtag uses. */
const isCollect = (url: string): boolean =>
  /\/(g|mp)\/collect/.test(url) &&
  /google-analytics\.com|analytics\.google\.com/.test(url);

interface CollectEvent {
  readonly name: string;
  /** `dl`/`dp` — which page the hit was about. */
  readonly page: string;
}

/**
 * Every event that actually crossed the wire.
 *
 * gtag sends one event per GET (`?…&en=page_view`) but batches under load into
 * a POST whose body is one `en=…`-bearing line per event. A reader that only
 * parsed the query string would score a batch as zero and turn a double into a
 * clean single — the exact direction this card must not be wrong in.
 */
function watchCollect(page: Page): CollectEvent[] {
  const events: CollectEvent[] = [];

  const read = (params: URLSearchParams, into: CollectEvent[]): void => {
    const name = params.get('en');
    if (name) {
      into.push({ name, page: params.get('dl') ?? params.get('dp') ?? '' });
    }
  };

  page.on('request', (request: Request) => {
    if (!isCollect(request.url())) {
      return;
    }
    read(new URL(request.url()).searchParams, events);
    const body = request.postData();
    if (body) {
      for (const line of body.split('\n')) {
        read(new URLSearchParams(line), events);
      }
    }
  });

  return events;
}

const pageViewsOf = (events: CollectEvent[]): CollectEvent[] =>
  events.filter((event) => event.name === 'page_view');

/** Seeds the stored consent answer before any app code runs. */
async function withStoredConsent(
  context: BrowserContext,
  decision: 'granted' | 'denied'
): Promise<void> {
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [CONSENT_KEY, decision] as const
  );
}

/**
 * A window in which a hit COULD have arrived, so both "one" and "none" mean
 * something. gtag.js is `async` and batches, so this is longer than the DOM
 * assertions elsewhere in this suite need.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(8000);
}

test.describe('OBRS-1195 — one page_view for the page consent was given on', () => {
  test('MUST-CATCH: a returning visitor sends exactly one page_view for "/"', async ({
    page,
    context,
  }) => {
    // Two jobs in one case. (1) The control: this lane can see a page_view on
    // the wire, so a zero elsewhere is a statement about the app. (2) AC-2:
    // this is the case that already measured 1 on prod BEFORE the fix, and a
    // replay that fired on every consent emission would make it 2.
    await withStoredConsent(context, 'granted');
    const events = watchCollect(page);

    await page.goto('/');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await settle(page);

    expect(
      pageViewsOf(events).length,
      'no page_view reached the wire at all — this lane proves nothing, repair it rather than deleting this case'
    ).toBe(1);
  });

  test('AC-1: accepting AFTER the page loaded still counts that page', async ({ page }) => {
    // The bug, measured. `NavigationEnd` for "/" has already passed when the
    // banner is answered — it has to have, or there would be no banner on
    // screen to answer — and before this fix that page_view was dropped with
    // nothing replaying it. Prod first visits scored zero.
    const events = watchCollect(page);

    await page.goto('/');
    await expect(page.locator('.consent-banner')).toBeVisible();
    await page.locator('.consent-banner__btn--accept').click();
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await settle(page);

    const pageViews = pageViewsOf(events);
    expect(pageViews.length).toBe(1);
    expect(pageViews[0].page).toMatch(/\/$/);
  });

  test('AC-2: the replayed page is not counted again on the next route change', async ({
    page,
  }) => {
    // A real click, not page.goto: goto is a fresh document and would reset the
    // very state the replay leaves behind. The risk this pins is a flag that
    // stays set after the flush and fires again on the next navigation.
    const events = watchCollect(page);

    await page.goto('/');
    await page.locator('.consent-banner__btn--accept').click();
    await settle(page);
    events.length = 0;

    await page
      .locator('a[routerLink="/how-to-book"], a[href="/how-to-book"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/how-to-book$/);
    await settle(page);

    const pageViews = pageViewsOf(events);
    expect(pageViews.length).toBe(1);
    expect(pageViews[0].page).toMatch(/\/how-to-book$/);
  });

  test('MUST NOT CATCH: declining sends nothing, replay or no replay', async ({ page }) => {
    // The arm a careless fix breaks. A replay keyed on "the consent value
    // changed" rather than on "consent was GRANTED" would fire here, and it
    // would fire for a visitor who just said no.
    const events = watchCollect(page);

    await page.goto('/');
    await page
      .locator('.consent-banner__btn:not(.consent-banner__btn--accept)')
      .click();
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await settle(page);

    expect(events).toEqual([]);
  });
});
