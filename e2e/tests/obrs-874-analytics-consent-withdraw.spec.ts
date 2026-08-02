import { expect, test, Page, Request } from '@playwright/test';

/**
 * OBRS-874 AC-2 — withdrawal, measured on the wire.
 *
 * Runs on playwright.obrs867.config.ts (the `analytics-e2e` build, the only one
 * carrying measurement IDs). The shape of the suite is deliberate and mirrors
 * the OBRS-867 gate: the ACCEPT leg is a must-catch, not a courtesy. Delete it
 * and every "nothing was requested" expectation below still passes — on a build
 * with blank IDs they would pass without a single tag existing, which is a green
 * that proves nothing.
 *
 * The two halves of a withdrawal are asserted separately because they are
 * guaranteed by different mechanisms:
 *   - WITHOUT a reload, collection stops at the VENDOR — `ga-disable-<id>` and
 *     `clarity('stop')`, driven by `AnalyticsService`'s `isGranted$`
 *     subscription. Best-effort by nature (a renamed vendor global is caught and
 *     warned about), so it is asserted on the switch itself plus silence.
 *   - AFTER a reload, the scripts are never injected at all, because `load()` is
 *     only reached while granted. That is the hard guarantee, and it is the one
 *     the customer-facing copy leans on.
 */

const TAG_HOSTS = ['googletagmanager.com', 'clarity.ms', 'google-analytics.com'];

const CONSENT_KEY = 'obrs_analytics_consent_v1';

/** Must match environment.analytics-e2e.ts — gtag reads this exact global. */
const GA4_ID = 'G-OBRS867FAKE';

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

/** A window in which a request COULD have happened, so silence means something. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(2500);
}

async function acceptOnHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.consent-banner__btn--accept').click();
  await expect(page.locator('.consent-banner')).toHaveCount(0);
  await settle(page);
}

/**
 * Walks to the policy page through the footer link instead of `page.goto`.
 *
 * The difference is load-bearing for the AC-6 test: `goto` is a fresh document,
 * which throws away the very tags whose in-place shutdown is under test. Only a
 * router navigation keeps the accepted session (and its injected scripts) alive
 * on the page where the withdraw button lives.
 */
async function walkToPolicyPage(page: Page): Promise<void> {
  await page.locator('app-footer a[routerLink="/privacy-policy"]').first().click();
  await expect(page).toHaveURL(/\/privacy-policy$/);
  await expect(page.getByTestId('analytics-consent-control')).toBeVisible();
}

test.describe('OBRS-874 AC-1/2 — a granted consent can be withdrawn', () => {
  test('MUST-CATCH: accepting really does request both tags', async ({ page }) => {
    // Identical in intent to the OBRS-867 must-catch: it is what stops every
    // assertion below from being vacuous. If this fails, the lane is
    // misconfigured — do not "fix" it by deleting it.
    const hits = watchTagRequests(page);

    await acceptOnHome(page);

    expect(
      hits.some((url) => url.includes('googletagmanager.com')),
      'GA4 tag was never requested — this lane proves nothing'
    ).toBe(true);
    expect(
      hits.some((url) => url.includes('clarity.ms')),
      'Clarity tag was never requested — this lane proves nothing'
    ).toBe(true);
  });

  test('the withdraw button is on the policy page, and the bar does not re-ask there', async ({
    page,
  }) => {
    await acceptOnHome(page);

    await page.goto('/privacy-policy');
    await expect(page.getByTestId('analytics-consent-withdraw')).toBeVisible();

    await page.getByTestId('analytics-consent-withdraw').click();

    // The stored answer is gone — not replaced with a refusal.
    expect(await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)).toBeNull();
    await expect(page.getByTestId('analytics-consent-status')).toHaveAttribute(
      'data-decision',
      'unset'
    );
    await expect(page.getByTestId('analytics-consent-grant')).toBeVisible();

    // …and the bottom bar does NOT pop up on the page the visitor just withdrew
    // from. Withdrawing and being asked again in the same breath is the defect
    // this placement exists to avoid.
    await settle(page);
    await expect(page.locator('.consent-banner')).toHaveCount(0);
  });

  test('AC-6: collection stops at the vendor immediately, with no reload', async ({
    page,
  }) => {
    await acceptOnHome(page);
    await walkToPolicyPage(page);

    // Both tags are in THIS document right now — the state a withdrawal has to
    // cope with, and the one a `page.goto` would have quietly discarded.
    expect(
      await page.evaluate(() => ({
        gtag: typeof (window as never as { gtag?: unknown }).gtag,
        clarity: typeof (window as never as { clarity?: unknown }).clarity,
      }))
    ).toEqual({ gtag: 'function', clarity: 'function' });

    const hitsAfterWithdrawal = watchTagRequests(page);
    await page.getByTestId('analytics-consent-withdraw').click();

    // gtag's own documented kill switch, read at send time.
    expect(
      await page.evaluate(
        (id) => (window as never as Record<string, unknown>)[`ga-disable-${id}`],
        GA4_ID
      )
    ).toBe(true);

    // A router navigation in the same document emits `page_view` if anything
    // still can. Nothing may reach the wire.
    await page.locator('app-footer a[routerLink="/how-to-book"]').first().click();
    await settle(page);

    expect(hitsAfterWithdrawal).toEqual([]);
  });

  test('a page opened after the withdrawal fetches no script at all', async ({
    page,
    context,
  }) => {
    await acceptOnHome(page);
    await page.goto('/privacy-policy');
    await page.getByTestId('analytics-consent-withdraw').click();

    // A SECOND page in the same context rather than page.reload(), and the
    // difference is not cosmetic. Measured 2026-08-01: reloading makes gtag
    // flush its already-queued `page_view` through the unload beacon, and the
    // Page's request event reports that as traffic from the reload. The beacon
    // belongs to the document that existed BEFORE the withdrawal, and treating
    // it as evidence about the one after would have been a false red — worse,
    // "fix" it by widening the filter and the test stops seeing real hits.
    // A new page shares localStorage (so consent is still withdrawn) and starts
    // with a request log nothing can leak into.
    const fresh = await context.newPage();
    const hitsOnFreshPage = watchTagRequests(fresh);
    await fresh.goto('/privacy-policy');
    await settle(fresh);

    expect(hitsOnFreshPage).toEqual([]);

    // Nothing was installed either, so there is no queue to flush later.
    const globals = await fresh.evaluate(() => ({
      gtag: typeof (window as never as { gtag?: unknown }).gtag,
      clarity: typeof (window as never as { clarity?: unknown }).clarity,
    }));
    expect(globals).toEqual({ gtag: 'undefined', clarity: 'undefined' });

    await fresh.close();
  });

  test('consent can be given again after a withdrawal', async ({ page }) => {
    await acceptOnHome(page);
    await walkToPolicyPage(page);
    await page.getByTestId('analytics-consent-withdraw').click();

    const hitsAfterRegrant = watchTagRequests(page);
    await page.getByTestId('analytics-consent-grant').click();

    expect(
      await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY)
    ).toBe('granted');
    // The vendor switch is released again — the direct inverse of AC-6's check.
    expect(
      await page.evaluate(
        (id) => (window as never as Record<string, unknown>)[`ga-disable-${id}`],
        GA4_ID
      )
    ).toBe(false);

    // NOT asserted: that re-granting re-fetches the script. It does not, and
    // should not — `load()` is idempotent and both tags are still in this
    // document. Collection resumes at the next event, so a navigation is what
    // puts traffic back on the wire.
    await page.locator('app-footer a[routerLink="/how-to-book"]').first().click();
    await settle(page);

    expect(hitsAfterRegrant.length).toBeGreaterThan(0);
  });
});
