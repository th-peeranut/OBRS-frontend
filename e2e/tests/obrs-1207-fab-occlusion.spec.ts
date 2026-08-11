import { expect, test, Browser, Page } from '@playwright/test';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';
import provincesWithStopsFixture from '../fixtures/provinces-with-stops.json';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { findOcclusions, formatOcclusions, Occlusion } from '../support/fab-occlusion';
import { seedCustomerSession, seedStore } from '../support/customer-pages';
import {
  ADMIN_SWEEP,
  CUSTOMER_EXTRA_SWEEP,
  CUSTOMER_SWEEP,
  OWNER_SWEEP,
  PUBLIC_SWEEP,
  SweepPage,
  newSweepPage,
  seedAnonymousSession,
  seedOwnerSession,
  seedStaffSession,
  sweepBudgetMs,
  visit,
} from '../support/host-boxes';

/**
 * OBRS-1207 — the report FAB must not take the click from anything underneath
 * it, at ANY scroll offset the user can reach.
 *
 * This replaces the two cases in `report-usability-issue.spec.ts` that compared
 * a `position: fixed` box against a scrolling one without ever pinning the
 * scroll (see `e2e/support/fab-occlusion.ts` for why that could only ever be a
 * coin toss, and for the measurements that proved it).
 *
 * NON-VACUITY. This spec is only worth its runtime if it goes RED on the tree
 * that has the defect. It does: run against `8ce85269` (the `dev` tip BEFORE
 * OBRS-1185, i.e. before anything in this area moved) it reports
 * `.select-btn "Select"` occluded at scrollY=160, and against `8c43dcec` at
 * scrollY=177 — the same defect, the trigger offset moved 17px because
 * OBRS-1185 made the search form 19px taller. Both are recorded on the card.
 */

const MOBILE = { width: 375, height: 667 };

async function stubBookingBackend(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await seedAnalyticsConsent(page);
  await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
  await page.route('**/api/schedules/search', (route) => route.fulfill({ json: schedulesFixture }));
  // `/api/provinces/stops` does NOT match the `**/api/stops` glob above -- the
  // glob pins the whole path, and this one has a segment in between. Without
  // this line the call escapes to a backend this lane does not run, and the
  // origin dropdown quietly degrades to its ungrouped fallback: the spec still
  // passes, but it measures a layout that is not the one shipping. That is the
  // failure mode rule 1 of playwright.gate.config.ts exists to prevent, and
  // OBRS-1212 is the fourth time a new public call on `/home` has found it.
  await page.route('**/api/provinces/stops', (route) =>
    route.fulfill({ json: provincesWithStopsFixture })
  );
}

/**
 * The B2C funnel, not `page.goto('/schedule-booking')`: the route reads its
 * criteria from the NgRx booking store, so a direct visit renders a page with
 * no rows and the FAB has nothing to sit on top of — a green result that
 * measured nothing. Same click path as `b2c-critical-path`.
 */
async function searchToScheduleBooking(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').waitFor();
  await page.locator('#dropdownObrsPassenger').click();
  await page.getByAltText('Passenger Add Icon').first().click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').click();
  await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'Nong Sak' }).click();
  await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]').click();
  await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'Bangkok' }).click();
  await page.locator('.btn-search').click();
  await page.waitForURL('**/schedule-booking');
  // OBRS-942: the list grows behind `AlertService.showLoading()`'s overlay, so a
  // measurement taken on `visible` alone reads a layout the traveller never sees.
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.locator('.select-btn').first().waitFor({ state: 'visible', timeout: 15_000 });
}

function report(list: Occlusion[]): string {
  return `${list.length} interactive element(s) lose their click to .report-fab:\n${formatOcclusions(list)}`;
}

test.describe('OBRS-1207 — FAB click occlusion', () => {
  test.beforeEach(async ({ page }) => {
    await stubBookingBackend(page);
  });

  test('schedule-booking: no Select button loses its click to the FAB, at any scroll offset (desktop 1280×720)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await searchToScheduleBooking(page);

    const occluded = await findOcclusions(page, '/schedule-booking @1280×720');
    expect(occluded, report(occluded)).toEqual([]);
  });

  test('schedule-booking: no Select button loses its click to the FAB, at any scroll offset (mobile 375×667)', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await searchToScheduleBooking(page);

    const occluded = await findOcclusions(page, '/schedule-booking @375×667');
    expect(occluded, report(occluded)).toEqual([]);
  });

  test('home: nothing in the search form loses its click to the FAB (desktop + mobile)', async ({ page }) => {
    const found: Occlusion[] = [];
    for (const vp of [{ width: 1280, height: 720 }, MOBILE]) {
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').waitFor();
      found.push(...(await findOcclusions(page, `/ @${vp.width}×${vp.height}`)));
    }
    expect(found, report(found)).toEqual([]);
  });
});

/**
 * AC2 — the FAB is mounted in `app.component.html` as a sibling of
 * `<router-outlet>`, so it is over EVERY route. A fix proven on
 * /schedule-booking alone would be a fix for one page of a problem that belongs
 * to the whole app, and the two cases this card replaces are exactly what
 * "we only ever measured the one page somebody complained about" looks like.
 *
 * Reuses `e2e/support/host-boxes.ts` rather than growing a second page list:
 * that module already carries every route this lane can reach hermetically,
 * with the session, fixtures and post-load click each one needs, and it is
 * already gated against drifting out of date. A second list would rot the day
 * a route is added to one and not the other.
 */
const SWEEP_VIEWPORTS = [
  { key: 'desktop', width: 1280, height: 720 },
  // AC5. The FAB collapses to a 48px circle here and the content column is
  // narrower, so victim and FAB are pushed together, not apart.
  { key: 'mobile', width: 375, height: 667 },
];

async function sweepFor(
  browser: Browser,
  viewport: { key: string; width: number; height: number },
  pages: SweepPage[],
  seedSession: (p: Page) => Promise<void>,
  seedFn?: (p: Page) => Promise<void>
): Promise<Occlusion[]> {
  const page = await newSweepPage(browser, viewport.width, viewport.height);
  await seedSession(page);
  const found: Occlusion[] = [];
  try {
    for (const p of pages) {
      await visit(page, p, seedFn);
      const hits = await findOcclusions(page, `${p.key} @${viewport.key}`);
      found.push(...hits);
      // eslint-disable-next-line no-console
      console.log(`OBRS1207 ${viewport.key} ${p.key} occluded=${hits.length}`);
    }
  } finally {
    await page.context().close();
  }
  return found;
}

test.describe('OBRS-1207 — FAB click occlusion, app-wide sweep', () => {
  for (const vp of SWEEP_VIEWPORTS) {
    test(`public and auth-entry pages (${vp.key} ${vp.width}×${vp.height})`, async ({ browser }) => {
      test.setTimeout(sweepBudgetMs(PUBLIC_SWEEP) * 2);
      const found = await sweepFor(browser, vp, PUBLIC_SWEEP, seedAnonymousSession);
      expect(found, report(found)).toEqual([]);
    });

    test(`customer pages (${vp.key} ${vp.width}×${vp.height})`, async ({ browser }) => {
      test.setTimeout(sweepBudgetMs(CUSTOMER_SWEEP, CUSTOMER_EXTRA_SWEEP) * 2);
      const found = await sweepFor(
        browser,
        vp,
        [...CUSTOMER_SWEEP, ...CUSTOMER_EXTRA_SWEEP],
        (p) => seedCustomerSession(p, false),
        seedStore
      );
      expect(found, report(found)).toEqual([]);
    });

    test(`admin, staff and session-bound pages (${vp.key} ${vp.width}×${vp.height})`, async ({
      browser,
    }) => {
      test.setTimeout(sweepBudgetMs(ADMIN_SWEEP) * 2);
      const found = await sweepFor(browser, vp, ADMIN_SWEEP, seedStaffSession);
      expect(found, report(found)).toEqual([]);
    });

    test(`owner-only settings tabs (${vp.key} ${vp.width}×${vp.height})`, async ({ browser }) => {
      test.setTimeout(sweepBudgetMs(OWNER_SWEEP) * 2);
      const found = await sweepFor(browser, vp, OWNER_SWEEP, seedOwnerSession);
      expect(found, report(found)).toEqual([]);
    });
  }
});
