import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { CUSTOMER_PAGES, seedCustomerSession } from '../support/customer-pages';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1832 AFTER evidence. One frame per mount point the card claims, at the width
 * where that mount point is the one a user meets.
 *
 * Not a gate -- the gates are the per-shell unit specs (which assert POSITION, not
 * presence) and the OBRS-640 audit. This exists so the card carries a picture of the
 * same claim those make in text.
 */

const ASSETS = 'e2e-evidence/obrs-1832';

test.describe('OBRS-1832 capture', () => {
  test.beforeAll(() => {
    mkdirSync(ASSETS, { recursive: true });
  });

  test.describe('customer', () => {
    test.use({ viewport: { width: 390, height: 800 } });

    test('mobile bar, menu closed and open', async ({ page }) => {
      await seedAnalyticsConsent(page);
      await seedCustomerSession(page, false);
      const home = CUSTOMER_PAGES.find((p) => p.key === 'home');
      if (!home) throw new Error('customer-pages.ts: "home" entry not found');
      await page.goto(home.url, { waitUntil: 'domcontentloaded' });
      await page.locator('.navbar-tools .report-trigger').waitFor({ state: 'visible' });
      await page.waitForTimeout(1200);

      await page.screenshot({ path: `${ASSETS}/OBRS-1832-AFTER-390px-1-bar-menu-closed.png` });

      await page.locator('.navbar-hamburger').click();
      await page.locator('.navbar-mobile-panel .report-trigger').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${ASSETS}/OBRS-1832-AFTER-390px-2-menu-open-both-entries.png` });
    });

    test('my-bookings: the corner the FAB used to hold', async ({ page }) => {
      await seedAnalyticsConsent(page);
      await seedCustomerSession(page, false);
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'my-bookings');
      if (!entry) throw new Error('customer-pages.ts: "my-bookings" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      // Put the Actions button on the line the FAB used to occupy -- the exact frame
      // OBRS-1828's capture photographed with both boxes overlapping.
      await page.evaluate(() => {
        const btn = document.querySelector('button.actions-menu-btn');
        if (btn) {
          const r = btn.getBoundingClientRect();
          window.scrollBy(0, r.top + r.height / 2 - (window.innerHeight - 48));
        }
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${ASSETS}/OBRS-1832-AFTER-390px-3-my-bookings-corner-is-empty.png` });
    });
  });

  test.describe('customer desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('navbar cluster, and the login page which has no navbar', async ({ page }) => {
      await seedAnalyticsConsent(page);
      await seedCustomerSession(page, false);
      const home = CUSTOMER_PAGES.find((p) => p.key === 'home');
      if (!home) throw new Error('customer-pages.ts: "home" entry not found');
      await page.goto(home.url, { waitUntil: 'domcontentloaded' });
      await page.locator('.navbar-tools .report-trigger').waitFor({ state: 'visible' });
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: `${ASSETS}/OBRS-1832-AFTER-1280px-4-navbar-cluster.png`,
        clip: { x: 640, y: 0, width: 640, height: 120 },
      });

      // The modal still opens for an anonymous visitor -- ADR-006's requirement,
      // kept by 0044.
      await page.locator('.navbar-tools .report-trigger').click();
      await page.locator('.report-modal').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${ASSETS}/OBRS-1832-AFTER-1280px-5-modal-open.png` });

      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.locator('.change-language .report-trigger').waitFor({ state: 'visible' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${ASSETS}/OBRS-1832-AFTER-1280px-6-login-no-navbar.png` });
    });
  });

  test.describe('staff', () => {
    test('topbar cluster at 1280px, and the drawer at 1000px', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await seedGateAdminSession(page, {
        username: 'salesperson@system.local',
        roles: ['salesperson'],
      });
      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('.admin-topbar-actions .report-trigger').waitFor({ state: 'visible' });
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: `${ASSETS}/OBRS-1832-AFTER-1280px-7-staff-topbar.png`,
        clip: { x: 640, y: 0, width: 640, height: 120 },
      });

      // <=1100px: the sidebar becomes an off-canvas drawer, which is where the
      // labelled row earns its place.
      await page.setViewportSize({ width: 1000, height: 800 });
      await page.waitForTimeout(400);
      await page.locator('.admin-menu-toggle').click();
      await page.locator('.admin-sidebar-footer .report-trigger').waitFor({ state: 'visible' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${ASSETS}/OBRS-1832-AFTER-1000px-8-staff-drawer.png` });
    });
  });
});
