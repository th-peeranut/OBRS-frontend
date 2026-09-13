import { expect, Page, test } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';
import {
  seedSignedInCustomer,
  searchAndConfirmASchedule,
} from '../support/b2c-booking-walk';

/**
 * OBRS-908 AC1 + AC2 -- the blocking loading overlay must not appear while a customer is
 * merely moving through the app.
 *
 * WHY THIS LANE AND NOT A KARMA SPEC. The claim is "no .swal2-container reaches the
 * page", and SweetAlert2 is raised by the HTTP interceptor into document.body, outside
 * every component fixture -- the same argument obrs-1222-station-load-error.spec.ts
 * makes, and the seam OBRS-642 shipped a defect through. The unit suite owns the RULE
 * (error.interceptor.spec.ts: opt-in, delayed, still blocking for a payment); this owns
 * the OUTCOME on a real page with a real interceptor and a real router.
 *
 * ⚠️ THE DELAY BELOW IS WHAT MAKES THIS A TEST RATHER THAN A COINCIDENCE. Every /api/
 * call this lane answers is fulfilled instantly, and OBRS-908 also added a 300ms grace
 * period before the overlay opens -- so a spec that simply walked the app would pass on
 * a tree with the OLD default too, proving nothing. Every response here is therefore
 * held for SLOW_RESPONSE_MS, comfortably past that grace period. Both tests were run
 * against a tree with the interceptor deliberately reverted to the old default, and they
 * went red counting 1 overlay on the home page and 3 across the customer walk -- fewer
 * than the call count because AlertService coalesces concurrent requests behind one
 * popup, which is exactly why the number to assert is 0 rather than a specific N.
 * Removing the delay silently turns both tests into tautologies.
 *
 * COUNTED, NOT SAMPLED. `expect(locator).toHaveCount(0)` asks what is on screen at the
 * instant it runs, and the thing under test is transient by construction: the old
 * overlay lived 231-272ms per request (measured on OBRS-1436). So a MutationObserver
 * installed before any app code counts every .swal2-container ever ADDED to the
 * document, and the tally survives navigation in sessionStorage. A spec that sampled
 * would go green on a page that flashed the overlay ten times.
 *
 * HERMETIC on this lane's terms (playwright.gate.config.ts): every /api/ call is
 * answered from here or from the shared public-page fixture set. No backend, no seeded
 * data, no external service.
 *
 * ASCII-only source.
 */

/**
 * Long enough that the old default could not have hidden behind the new grace period,
 * short enough that a walk of ~10 calls stays well inside this lane's 90s timeout.
 * BLOCKING_LOADING_DELAY_MS is 300 (src/app/shared/interceptors/error.interceptor.ts).
 */
const SLOW_RESPONSE_MS = 800;

const SWAL_COUNTER_KEY = 'obrs908.swalSeen';

/**
 * Counts every `.swal2-container` ever attached to the document, from before the app
 * boots, and keeps the tally across navigations.
 *
 * `addInitScript` runs on every document, so the counter is re-installed after each
 * navigation and reads its running total back out of sessionStorage rather than starting
 * from zero -- the customer walk crosses at least one real document load.
 *
 * ⚠️ IT OBSERVES `document`, NOT `document.documentElement`, AND THAT IS LOAD-BEARING.
 * At `addInitScript` time the document is still empty: `documentElement` is `null`, so
 * `observe()` throws `TypeError: parameter 1 is not of type 'Node'`, the init script dies
 * there, and no observer is ever installed. The tally then reads 0 on a page that raised
 * an overlay -- measured: the first draft of this spec passed against a deliberately
 * reverted interceptor while `document.querySelectorAll('.swal2-container').length` was
 * 1 on the same page. `document` is a Node from the first instant, and `subtree: true`
 * reaches `body` whenever it appears.
 */
async function countOverlays(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const bump = () => {
      const current = Number(sessionStorage.getItem(key as string) ?? '0');
      sessionStorage.setItem(key as string, String(current + 1));
    };
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (
            node instanceof Element &&
            (node.classList.contains('swal2-container') ||
              node.querySelector?.('.swal2-container'))
          ) {
            bump();
          }
        });
      }
    }).observe(document, { childList: true, subtree: true });
  }, SWAL_COUNTER_KEY);
}

async function overlaysSeen(page: Page): Promise<number> {
  return page.evaluate(
    (key) => Number(sessionStorage.getItem(key as string) ?? '0'),
    SWAL_COUNTER_KEY
  );
}

/**
 * Holds every /api/ response for SLOW_RESPONSE_MS, then hands it to whichever stub would
 * have answered it.
 *
 * `route.fallback()` rather than a fulfil of its own: this handler has no idea what any
 * of these endpoints return, and duplicating the fixture set here is how the two copies
 * drift. Registered AFTER mockPublicPageApis because Playwright runs the LAST-registered
 * matching handler first -- the same ordering trap obrs-1222-station-load-error.spec.ts
 * documents, used here in the other direction.
 */
async function slowDownEveryApiCall(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_RESPONSE_MS));
    await route.fallback();
  });
}

test.describe('OBRS-908 blocking overlay', () => {
  test.beforeEach(async ({ page }) => {
    await countOverlays(page);
    await mockPublicPageApis(page);
    await slowDownEveryApiCall(page);
  });

  test('AC1 -- the home page loads with every call held 800ms and raises no overlay at all', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('app-home-booking').waitFor({ state: 'visible' });

    // The home page's own calls (stops, provinces/stops, routes, booking-policy) are all
    // in flight or just answered. Wait past the slowest of them plus the grace period, so
    // this measures "never showed" and not "has not shown yet".
    await page.waitForTimeout(SLOW_RESPONSE_MS + 1500);

    // Both halves matter. The count is the claim; the live locator catches an overlay
    // that opened and is still up, which a counter of ADDITIONS would also catch but
    // which is worth naming separately when it fails.
    expect(await overlaysSeen(page)).toBe(0);
    await expect(page.locator('.swal2-container')).toHaveCount(0);

    // Positive control: the page under measurement is the real one, with real data in it.
    // A blank shell would satisfy every assertion above for the wrong reason -- which is
    // exactly how OBRS-930's repro reported "no spinner at all" three times.
    await expect(
      page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]')
    ).toBeVisible();
  });

  test('AC2 -- search to trip to passenger form: not one blocking modal in the whole walk', async ({
    page,
  }) => {
    await seedSignedInCustomer(page);
    await searchAndConfirmASchedule(page);

    await page.waitForURL('**/passenger-info');
    // The seat-map call (GET /api/schedules/{id}/seats) fires on this screen and is held
    // like the rest; let it land before reading the tally.
    await expect(page.locator('#booker-firstName')).toBeVisible();
    await page.waitForTimeout(SLOW_RESPONSE_MS + 1500);

    expect(await overlaysSeen(page)).toBe(0);
    await expect(page.locator('.swal2-container')).toHaveCount(0);
  });
});
