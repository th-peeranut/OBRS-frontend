import { Page, test } from '@playwright/test';

/**
 * OBRS-1222 -- BEFORE/AFTER evidence for the Jira card.
 *
 * Screenshots ONLY. Every assertion lives in obrs-1222-station-load-error.spec.ts,
 * which is the gate; this file has to run unchanged against BOTH trees (the
 * pre-card one, where the modal is what a customer gets, and the post-card one),
 * so it can assert nothing that is true of only one of them.
 *
 * STAGE comes from the environment, not from a branch check:
 *
 *   OBRS_CAPTURE_STAGE=BEFORE  npx playwright test --config=playwright.obrs1222.config.ts
 *   OBRS_CAPTURE_STAGE=AFTER   npx playwright test --config=playwright.obrs1222.config.ts
 *
 * The BEFORE run is taken with `git stash push -- src/` applied, i.e. against
 * the real previous runtime, and `ng serve --watch` rebuilds on the stash. No
 * image in this pair is drawn by hand or reconstructed.
 *
 * The two scenarios are the card's two populations:
 *   1-cached  localStorage roster present -> the form works, the modal is pure
 *             interruption.
 *   2-cold    roster empty -> the dropdowns are empty and the customer needs to
 *             be told something.
 *
 * ASCII-only source.
 */

const STAGE = process.env['OBRS_CAPTURE_STAGE'] ?? 'AFTER';
const ASSETS = 'e2e-evidence/OBRS-1222';

const STATION_CACHE_KEY = 'obrs.stations.v1';

const STOPS = [1, 2, 3].map((id) => ({
  id,
  slug: `e2e-stop-${id}`,
  nameTh: `Test Stop ${id}`,
  nameEn: `Test Stop ${id}`,
  status: 'operational',
  stopType: 'station',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}));

function ok(data: unknown) {
  return { code: 200, message: 'OK', data };
}

/** Catch-all first, then the /stops override -- Playwright runs the LAST match first. */
async function mockApiWithDeadStops(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith('/stops') ? ok(STOPS) : ok(null);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.route('**/api/stops**', async (route) => {
    await route.abort('connectionfailed');
  });
}

async function settleHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('app-home-booking').waitFor({ state: 'visible' });
  // Long enough for the effect to fail and for whichever surface this tree has
  // to finish rendering. On the BEFORE tree that is a SweetAlert2 popup, whose
  // open animation is 300ms.
  await page.waitForTimeout(2500);
}

test.describe(`OBRS-1222 capture (${STAGE})`, () => {
  test('1-cached: the roster is already in localStorage and GET /api/stops dies', async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, stations]) => {
        window.localStorage.setItem(
          key as string,
          JSON.stringify({ version: 'v1', fetchedAt: '2026-01-01T00:00:00Z', stations })
        );
      },
      [STATION_CACHE_KEY, STOPS] as const
    );
    await mockApiWithDeadStops(page);
    await settleHome(page);

    // Full page, not the form element: the thing being compared is whether
    // anything is drawn OVER the page, and an element screenshot would crop
    // exactly the overlay out of the picture.
    await page.screenshot({ path: `${ASSETS}/OBRS-1222-${STAGE}-1-cached-stops-fail.png` });
  });

  test('2-cold: first visit, no cache, and GET /api/stops dies', async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key as string);
    }, STATION_CACHE_KEY);
    await mockApiWithDeadStops(page);
    await settleHome(page);

    await page.screenshot({ path: `${ASSETS}/OBRS-1222-${STAGE}-2-cold-stops-fail.png` });
  });
});
