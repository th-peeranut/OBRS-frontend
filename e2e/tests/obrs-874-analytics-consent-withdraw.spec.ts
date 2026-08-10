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

/**
 * One 2,500 ms `settle()` used to serve two jobs that need different numbers,
 * and separating them is the whole of OBRS-1199.
 *
 * Setup: long enough for the tags an accept just injected to load. It asserts
 * nothing, so it is allowed to stay tight.
 */
const TAG_LOAD_MS = 2_500;

/**
 * Assertion: how long "nothing was sent" has to hold before it means anything.
 *
 * Measured 2026-08-10: a `page_view` triggered by a router navigation reaches
 * `/g/collect` at **3,404 ms** in a standalone probe and at **4,985–5,038 ms**
 * across four lane runs, because gtag batches before it sends — and the spread
 * between those figures is itself the argument, since a fixed window has to
 * survive the slow end, not the fast one. A window that closes at 2,500 ms
 * cannot be broken by a hit that cannot arrive before 3.4 s, so silence inside
 * it was not evidence of anything.
 *
 * Worth being precise about where that actually bit, because it is one place,
 * not four: AC-6 below is the only case here whose *sole* possible evidence is
 * a batched `/g/collect` hit — the tag scripts are already in the document by
 * then, so there is nothing else left to observe. The other negative legs watch
 * a document in which a leak would have to begin by FETCHING a script, and that
 * request goes out immediately; they were never vacuous. Same reasoning leaves
 * `obrs-867-analytics-consent-gate.spec.ts` alone: every negative there is
 * guarded by a script fetch, not by a batched hit.
 */
const SILENCE_WINDOW_MS = 8_000;

/**
 * Ceiling for waiting on a hit we EXPECT. Event-driven, so a fast hit pays none
 * of it — which is why it can afford to be far above any plausible latency.
 */
const HIT_TIMEOUT_MS = 20_000;

/** A window in which a request COULD have happened, so silence means something. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(SILENCE_WINDOW_MS);
}

/** Waits for the accepted tags to load. A precondition, not a check. */
async function tagsLoad(page: Page): Promise<void> {
  await page.waitForTimeout(TAG_LOAD_MS);
}

/**
 * Counts the `page_view` events that have actually reached `/g/collect`.
 *
 * Reads the POST body as well as the query string on purpose. gtag sends one
 * event per GET normally, but under load it batches several into a single POST
 * whose body carries one `en=`-bearing line per event — so a counter that reads
 * only the URL scores a batch as **zero** and then reports "nothing was sent".
 * That false negative is documented from OBRS-1195; it costs an hour to
 * rediscover and it fails in the direction that looks like good news.
 */
function watchPageViewCount(page: Page): () => number {
  const payloads: string[] = [];
  page.on('request', (request: Request) => {
    const url = request.url();
    if (url.includes('google-analytics.com/g/collect')) {
      payloads.push(`${url}\n${request.postData() ?? ''}`);
    }
  });
  return () => payloads.join('\n').split('en=page_view').length - 1;
}

async function acceptOnHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.consent-banner__btn--accept').click();
  await expect(page.locator('.consent-banner')).toHaveCount(0);
  await tagsLoad(page);
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
    const pageViewsSent = watchPageViewCount(page);
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

    // Drain what the GRANTED session already queued, before the watcher below
    // starts — and drain it by waiting for the hits, not by hoping they have
    // gone. Two `page_view`s exist by now: `/`, replayed when consent was given
    // (OBRS-1195), and `/privacy-policy` from the router navigation just above.
    //
    // Measured 2026-08-10 (3/3 runs): gtag holds the second one and puts it on
    // the wire ~9.6 s after the document loaded — i.e. AFTER the withdrawal
    // below. It was generated while consent was granted, so counting it as
    // evidence about what happens afterwards is the same false red this file
    // already avoids for the unload beacon in the next test. Draining removes
    // the confound at its source instead of widening a filter around it, which
    // is what lets the assertion at the end of this test stay as strict as it
    // reads.
    //
    // ⚠️ That the hit crosses the withdrawal boundary at all is a real finding
    // and NOT what this drain is papering over. OBRS-1206 measured it directly
    // — 4,906 ms after the withdraw click — and it is now an ACCEPTED behaviour
    // recorded in ADR-0034 §10, not an open question: `ga-disable-<id>` stops
    // gtag collecting, never gtag sending, and no mechanism short of patching
    // `fetch` + `sendBeacon` changes that (a reload makes it 21 ms instead).
    //
    // So this drain stays, and it stays a DRAIN rather than a filter: the hit
    // is one the granted session legitimately produced, and waiting for it to
    // leave is what lets the assertion at the end of this test keep asserting
    // exactly what it says.
    await expect
      .poll(pageViewsSent, {
        timeout: HIT_TIMEOUT_MS,
        message:
          'the granted session never put both of its page_views on the wire — ' +
          'this lane can no longer tell a drained hit from an absent one',
      })
      .toBeGreaterThanOrEqual(2);

    const hitsAfterWithdrawal = watchTagRequests(page);
    await page.getByTestId('analytics-consent-withdraw').click();

    // gtag's own documented kill switch. It stops collection, not transmission
    // — OBRS-1206 measured a queued hit leaving 4,906 ms after this click — so
    // this assertion is about the switch being thrown, and the drain above is
    // what makes the silence below mean something.
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
    const navigatedAt = Date.now();
    await page.locator('app-footer a[routerLink="/how-to-book"]').first().click();

    // Wait for the EVENT, not for a duration. This hit lands at ~3.4 s — past
    // the 2,500 ms this used to allow — and that latency is gtag's batching
    // plus whatever the machine is doing, so any fixed figure here is a red
    // waiting to happen on a slower box.
    //
    // Polling the same array the assertion reads, rather than
    // `page.waitForRequest`, is deliberate: `waitForRequest` only sees requests
    // issued after it is armed, so between the grant click and here it could
    // time out on a hit the watcher had already recorded. This way the wait
    // condition and the assertion are one sentence, and cannot drift apart.
    await expect
      .poll(() => hitsAfterRegrant.length, {
        timeout: HIT_TIMEOUT_MS,
        message: `re-granting put nothing back on the wire within ${HIT_TIMEOUT_MS} ms — collection did not resume`,
      })
      .toBeGreaterThan(0);

    // Printed every run on purpose: the next time this goes red, the arrival
    // time is already in the log instead of costing another 20-second probe to
    // rediscover. That probe is how OBRS-1199 was diagnosed at all.
    console.log(
      `[OBRS-1199] re-granted hit arrived ${Date.now() - navigatedAt} ms after the navigation`
    );
  });
});
