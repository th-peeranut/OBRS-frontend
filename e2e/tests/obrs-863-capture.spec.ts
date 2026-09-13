import { Page, expect, test } from '@playwright/test';

import { seedCustomerSession, seedStore } from '../support/customer-pages';

/**
 * OBRS-863 evidence capture — see playwright.obrs863capture.config.ts for how to
 * run it (two hand-started servers, no backend).
 *
 * <p>AC#5 asks for a MEASUREMENT, not an opinion: at the project's phone
 * viewport the first trip card must be visible without scrolling. So each shot
 * is preceded by reading `getBoundingClientRect().top` of the first
 * `.select-btn`'s own card against `window.innerHeight`, and the pair of numbers
 * is printed and asserted rather than left for a human to judge from the image.
 *
 * <p>BEFORE and AFTER differ by ONE variable: the tree being served. Same
 * viewport, same seeded store, same stubs, same language — `seedCustomerSession`
 * fulfils every `/api/**` call in the browser, so neither side reaches SIT and
 * neither side can be moved by another session's data.
 *
 * <p>The BEFORE tree has no summary bar at all, so the shot is simply the page
 * as it renders. The AFTER tree renders collapsed, and this file also shoots the
 * expanded state, because AC#2 is a claim about what the toggle opens.
 */

const BEFORE = process.env['OBRS863_BEFORE'] ?? 'http://localhost:4863';
const AFTER = process.env['OBRS863_AFTER'] ?? 'http://localhost:4864';
const ASSETS = 'e2e-evidence/OBRS-863';

/** The repo's phone viewport — the one obrs-391-capture.spec.ts and
 *  obrs-1372-consent-banner-reachability.spec.ts both measure at, and the one
 *  schedule-booking-filter.component.scss cites for this very screen. */
const MOBILE = { width: 390, height: 664 };

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Numeric station ids and today's date, for the same reason the
 * `schedule-booking-day-strip` entry in customer-pages.ts carries them: the
 * shared `STORE_SEED` filter holds station SLUGS, which resolve to no station,
 * and a page whose day strip does not render is not the page this card changes.
 */
const FILTER = {
  roundTrip: { id: 'one_way', name: 'One way' },
  passengerInfo: [{ type: 'adult', count: 2 }],
  startStationId: 1,
  stopStationId: 4,
  departureDate: todayLocal(),
  returnDate: null,
  adultCount: 2,
  kidsCount: 0,
};

async function openResults(
  page: Page,
  origin: string,
  options: { dark?: boolean; lang?: string } = {}
): Promise<void> {
  await page.setViewportSize(MOBILE);
  await seedCustomerSession(page, options.dark ?? false);
  if (options.lang) {
    // After `seedCustomerSession`, which pins 'en' — init scripts run in order.
    await page.addInitScript((lang) => localStorage.setItem('app_language', lang), options.lang);
  }
  await page.goto(`${origin}/schedule-booking`);
  await seedStore(page, { filter: FILTER });
  await expect(page.locator('.select-btn').first()).toBeAttached();
  // The day strip is the other thing above the list; a measurement taken before
  // it lands would flatter whichever side rendered first.
  await expect(page.locator('[data-testid="day-strip"]')).toBeVisible();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
}

/**
 * How far the first trip card's TOP sits below the top of the viewport, and how
 * much of the card is on screen. Measured off the card, not the Select button:
 * a customer "sees the first trip" when its row begins, not when its button does.
 */
async function firstCardGeometry(
  page: Page
): Promise<{ top: number; viewport: number; visible: boolean }> {
  return page.evaluate(() => {
    const button = document.querySelector('.select-btn');
    const card = button?.closest('.schedule-item') ?? button?.parentElement ?? null;
    if (!card) throw new Error('no trip card on the page');
    const rect = card.getBoundingClientRect();
    return {
      top: Math.round(rect.top + window.scrollY),
      viewport: window.innerHeight,
      visible: rect.top + window.scrollY < window.innerHeight,
    };
  });
}

test('BEFORE: the full form pushes the first trip card below the fold', async ({ page }) => {
  await openResults(page, BEFORE);

  const before = await firstCardGeometry(page);
  console.log(`OBRS-863 BEFORE first card top=${before.top}px viewport=${before.viewport}px visible=${before.visible}`);

  await page.screenshot({ path: `${ASSETS}/OBRS-863-BEFORE-mobile-results.png` });

  // Asserted, not just printed: a BEFORE that already fitted would mean the
  // card's premise is gone and this evidence pair proves nothing.
  expect(before.top).toBeGreaterThan(before.viewport);
});

test('AFTER: the collapsed summary puts the first trip card above the fold', async ({ page }) => {
  await openResults(page, AFTER);

  const summary = page.locator('[data-testid="search-summary-toggle"]');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  // AC#2: exactly one form on the page, and while collapsed it is not rendered.
  await expect(page.locator('app-trip-type-toggle')).toHaveCount(0);

  const after = await firstCardGeometry(page);
  console.log(`OBRS-863 AFTER first card top=${after.top}px viewport=${after.viewport}px visible=${after.visible}`);

  await page.screenshot({ path: `${ASSETS}/OBRS-863-AFTER-mobile-results.png` });

  expect(after.top).toBeLessThan(after.viewport);
});

test('AFTER: pressing the summary opens the one existing form', async ({ page }) => {
  await openResults(page, AFTER);

  await page.locator('[data-testid="search-summary-toggle"]').click();

  await expect(page.locator('[data-testid="search-summary-toggle"]')).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.locator('app-trip-type-toggle')).toHaveCount(1);
  await expect(page.locator('.station-group')).toHaveCount(1);

  // The pointer is left resting on the bar by the click, so its border is
  // 150ms into the hover transition. Shot without this wait the frame catches a
  // half-blue border and reads as a rendering bug.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${ASSETS}/OBRS-863-AFTER-mobile-expanded.png` });
});

/** AC#6. One frame per surface the summary bar introduces: Thai, which is what
 *  the owner reads, and dark, where the bar's border carries the 3:1 non-text
 *  floor on its own. */
test('AFTER: the summary reads in Thai and in dark', async ({ page }) => {
  await openResults(page, AFTER, { lang: 'th' });
  const summary = page.locator('[data-testid="search-summary-toggle"]');
  await expect(summary).toBeVisible();
  // Asserted so a frame taken over an untranslated key fails instead of shipping.
  await expect(summary).not.toContainText('SCHEDULE_BOOKING.');
  await expect(summary).toContainText('ที่นั่ง');
  await page.screenshot({ path: `${ASSETS}/OBRS-863-AFTER-mobile-thai.png` });

  await openResults(page, AFTER, { lang: 'th', dark: true });
  await expect(page.locator('body.is-dark')).toHaveCount(1);
  await expect(page.locator('[data-testid="search-summary-toggle"]')).toBeVisible();
  await page.screenshot({ path: `${ASSETS}/OBRS-863-AFTER-mobile-thai-dark.png` });
});
