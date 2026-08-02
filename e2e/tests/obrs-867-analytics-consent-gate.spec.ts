import { expect, test, BrowserContext, Page, Request } from '@playwright/test';

/**
 * OBRS-867 AC-1, measured on the wire.
 *
 * Run with playwright.obrs867.config.ts, which serves the `analytics-e2e`
 * build — the only one carrying a measurement ID. Read that config's header
 * before changing anything here: the "after accepting" case is what keeps the
 * "before accepting" case from being a vacuous pass.
 */

const TAG_HOSTS = ['googletagmanager.com', 'clarity.ms', 'google-analytics.com'];

const CONSENT_KEY = 'obrs_analytics_consent_v1';

/** Records every request the page makes to a measurement provider. */
function watchTagRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (request: Request) => {
    const url = request.url();
    if (TAG_HOSTS.some((host) => url.includes(host))) {
      hits.push(url);
    }
  });
  return hits;
}

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
 * The tags are `async` and Clarity's is injected without awaiting anything, so
 * "no request happened" needs a window in which one COULD have happened.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(2500);
}

test.describe('OBRS-867 AC-1 — no measurement tag fires before consent', () => {
  test('a first-time visitor: banner is up, and nothing was requested', async ({ page }) => {
    const hits = watchTagRequests(page);

    await page.goto('/');
    await expect(page.locator('.consent-banner')).toBeVisible();
    await settle(page);

    expect(hits).toEqual([]);

    // Not just "no request" — no global was installed either, so there is
    // nothing sitting in a queue waiting to be flushed later.
    const globals = await page.evaluate(() => ({
      gtag: typeof (window as never as { gtag?: unknown }).gtag,
      clarity: typeof (window as never as { clarity?: unknown }).clarity,
      dataLayer: typeof (window as never as { dataLayer?: unknown }).dataLayer,
    }));
    expect(globals).toEqual({
      gtag: 'undefined',
      clarity: 'undefined',
      dataLayer: 'undefined',
    });
  });

  test('navigating around while undecided still requests nothing', async ({ page }) => {
    const hits = watchTagRequests(page);

    await page.goto('/');
    await expect(page.locator('.consent-banner')).toBeVisible();
    await page.goto('/how-to-book');
    await page.goto('/privacy-policy');
    await settle(page);

    expect(hits).toEqual([]);
  });

  test('a visitor who declined: banner gone, still nothing requested', async ({
    page,
    context,
  }) => {
    await withStoredConsent(context, 'denied');
    const hits = watchTagRequests(page);

    await page.goto('/');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await settle(page);

    expect(hits).toEqual([]);
  });

  test('declining in-session stops it for the rest of the session', async ({ page }) => {
    const hits = watchTagRequests(page);

    await page.goto('/');
    await page
      .locator('.consent-banner__btn:not(.consent-banner__btn--accept)')
      .click();
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await page.goto('/how-to-book');
    await settle(page);

    expect(hits).toEqual([]);
  });

  /**
   * The other half of the gate. Without this, every expectation above would
   * also pass on a build with no measurement ID at all — i.e. it would pass
   * while proving nothing. If this test fails, the lane is misconfigured;
   * do not "fix" it by deleting it.
   */
  test('MUST-CATCH: accepting really does request both tags', async ({ page }) => {
    const hits = watchTagRequests(page);

    await page.goto('/');
    await page.locator('.consent-banner__btn--accept').click();
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await settle(page);

    expect(
      hits.some((url) => url.includes('googletagmanager.com')),
      'GA4 tag was never requested — this lane proves nothing'
    ).toBe(true);
    expect(
      hits.some((url) => url.includes('clarity.ms')),
      'Clarity tag was never requested — this lane proves nothing'
    ).toBe(true);
  });

  test('a returning visitor who accepted earlier is measured without being asked again', async ({
    page,
    context,
  }) => {
    await withStoredConsent(context, 'granted');
    const hits = watchTagRequests(page);

    await page.goto('/');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await settle(page);

    expect(hits.length).toBeGreaterThan(0);
  });
});
