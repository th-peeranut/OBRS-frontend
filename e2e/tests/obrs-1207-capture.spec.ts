import { test, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { ADMIN_SWEEP, newSweepPage, seedStaffSession, visit } from '../support/host-boxes';

/**
 * OBRS-1207 — card evidence. Not a test: it asserts almost nothing and exists to
 * photograph the three sites the occlusion gate names, at the exact scroll
 * offsets it names them at.
 *
 * Run it in a worktree WITHOUT the fix for the BEFORE set and WITH it for the
 * AFTER set; `OBRS1207_TAG` names the half. The offsets are passed in rather
 * than solved for, so the two halves are photographed at the same place and the
 * pair is comparable.
 */

const TAG = process.env['OBRS1207_TAG'] ?? 'AFTER';
const OUT = path.join(process.cwd(), 'e2e-evidence', 'obrs-1207');

/** Where the gate found each collision. BEFORE = `8ce85269`, AFTER = `bef31b4f`. */
const OFFSETS = {
  home: TAG === 'BEFORE' ? 22 : 39,
  schedule: TAG === 'BEFORE' ? 154 : 173,
  promotions: 131,
};

async function shoot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `OBRS-1207-${TAG}-${name}.png`) });
}

/** Instant, and settled — the page ships `scroll-behavior: smooth` (see fab-occlusion.ts). */
async function pin(page: Page, y: number): Promise<void> {
  await page.addStyleTag({ content: `*, :root { scroll-behavior: auto !important; }` });
  await page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior }), y);
  await page.waitForFunction((top) => Math.abs(window.scrollY - top) <= 1, y, { polling: 'raf', timeout: 5_000 });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

test.describe('OBRS-1207 capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
    await seedAnalyticsConsent(page);
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.route('**/api/schedules/search', (route) => route.fulfill({ json: schedulesFixture }));
  });

  test('home + schedule-booking', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').waitFor();
    await pin(page, OFFSETS.home);
    await shoot(page, '0-home-search-button');

    await page.locator('#dropdownObrsPassenger').click();
    await page.getByAltText('Passenger Add Icon').first().click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').click();
    await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'หนองสัก' }).click();
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]').click();
    await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'กรุงเทพ' }).click();
    await page.locator('.btn-search').click();
    await page.waitForURL('**/schedule-booking');
    await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15_000 });
    await page.locator('.select-btn').first().waitFor({ state: 'visible', timeout: 15_000 });

    await pin(page, OFFSETS.schedule);
    await shoot(page, '1-schedule-booking-select-button');

    // The control arm: scrolled clear of every button, the FAB must be at full
    // strength. Without this the AFTER set could not tell "yields when it must"
    // from "permanently faded", which would be a different bug in the same pixels.
    await pin(page, 0);
    await shoot(page, '2-schedule-booking-top-fab-at-rest');
  });

  test('admin promotions', async ({ browser }) => {
    const page = await newSweepPage(browser, 1280, 720);
    await seedStaffSession(page);
    const entry = ADMIN_SWEEP.find((p) => p.key === 'admin-promotions');
    if (!entry) throw new Error('ADMIN_SWEEP no longer has an `admin-promotions` entry');
    await visit(page, entry);
    await pin(page, OFFSETS.promotions);
    await shoot(page, '3-admin-promotions-add-button');
    await page.context().close();
  });
});
