/**
 * OBRS-907 QA regression — before/after parity evidence, run by hand against
 * TWO checkouts (ee6f026d for BEFORE, this branch for AFTER), same port,
 * sequentially. NOT a lane member (see e2e/lanes.json's own $comment on
 * scope) and NOT deleted after running per PIPELINE.md's standing QA rule.
 *
 * Measures three things a global CSS move / component consolidation could
 * silently break, with computed style (not eyeballing) plus a screenshot:
 *   1. The two migrated call sites (my-booking-ticket-modal ring spinner,
 *      notification-inbox-panel icon spinner) — selectors chosen to match
 *      BOTH the pre-migration markup (`.ticket-modal__spinner`,
 *      `.admin-loading-spinner`) and the post-migration one
 *      (`.loading-state-ring`, `.admin-loading-spinner` — unchanged), so the
 *      same script runs unmodified against both checkouts.
 *   2. `.admin-skeleton` on four admin list pages — class name and compiled
 *      declarations are byte-identical before/after per the diff, this
 *      proves it rather than trusting the diff.
 *   3. Both in light and dark (`app_admin_theme` localStorage key, the same
 *      mechanism e2e/support/customer-pages.ts uses).
 *
 * Hermetic (see playwright.obrs907qa.config.ts header) — reuses the SAME
 * synthetic-session helpers the shipped GATE spec for this card uses, and
 * the same "register a hanging route AFTER the session seed so it wins by
 * Playwright's reverse-registration-order matching" trick to hold each
 * surface in its loading state long enough to measure.
 */

import { test, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { seedGateAdminSession } from '../support/gate-admin-session';
import { seedCustomerSession } from '../support/customer-pages';

const PHASE = (process.env['OBRS907QA_PHASE'] ?? 'after') as 'before' | 'after';
const OUT_DIR = path.resolve(__dirname, '../../docs/manual-tests/obrs-907-evidence');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function setTheme(page: Page, dark: boolean): Promise<void> {
  await page.addInitScript((isDark) => {
    if (isDark) localStorage.setItem('app_admin_theme', 'dark');
    else localStorage.removeItem('app_admin_theme');
  }, dark);
}

async function hang(page: Page, matches: (pathname: string) => boolean): Promise<void> {
  await page.route(
    (url) => matches(url.pathname),
    () => new Promise<void>(() => undefined)
  );
}

interface RingMetrics {
  width: string;
  height: string;
  borderTopWidth: string;
  borderTopColor: string;
  borderColor: string;
  borderRadius: string;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
  animationIterationCount: string;
  display: string;
  opacity: string;
}

async function measure(locator: Locator): Promise<RingMetrics> {
  return locator.evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      width: c.width,
      height: c.height,
      borderTopWidth: c.borderTopWidth,
      borderTopColor: c.borderTopColor,
      borderColor: c.borderColor,
      borderRadius: c.borderRadius,
      animationName: c.animationName,
      animationDuration: c.animationDuration,
      animationTimingFunction: c.animationTimingFunction,
      animationIterationCount: c.animationIterationCount,
      display: c.display,
      opacity: c.opacity,
    };
  });
}

async function measureSkeleton(locator: Locator) {
  return locator.evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      height: c.height,
      width: c.width,
      borderRadius: c.borderRadius,
      backgroundImage: c.backgroundImage,
      backgroundSize: c.backgroundSize,
      animationName: c.animationName,
      animationDuration: c.animationDuration,
      animationTimingFunction: c.animationTimingFunction,
      animationIterationCount: c.animationIterationCount,
    };
  });
}

function write(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT_DIR, `${PHASE}-${name}.json`), JSON.stringify(data, null, 2));
}

test.describe('OBRS-907 QA parity capture', () => {
  for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';

    test(`ticket modal spinner — ${theme}`, async ({ page }) => {
      await seedCustomerSession(page, dark);
      // Override customer-pages.ts's own fast TICKETS fixture so the modal
      // stays on `loading` long enough to measure. Registered AFTER
      // seedCustomerSession -> wins (reverse registration order).
      await hang(page, (p) => /\/bookings\/\d+\/tickets/.test(p));

      await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' });
      await page.locator('.actions-menu-btn').first().waitFor({ state: 'visible', timeout: 15_000 });
      await page.locator('.actions-menu-btn').first().click();
      await page.locator('.action-menu-item', { hasText: /e-?ticket/i }).first().click();

      const ring = page.locator('.ticket-modal__spinner, .loading-state-ring');
      await ring.waitFor({ state: 'visible', timeout: 10_000 });
      const metrics = await measure(ring);
      write(`ticket-modal-${theme}`, metrics);
      await page.locator('.ticket-modal, .my-booking-ticket-modal, [class*="ticket-modal"]').first()
        .screenshot({ path: path.join(OUT_DIR, `${PHASE}-ticket-modal-${theme}.png`) })
        .catch(async () => {
          // Fallback: full viewport if the outer wrapper class differs before/after.
          await page.screenshot({ path: path.join(OUT_DIR, `${PHASE}-ticket-modal-${theme}.png`) });
        });
    });

    test(`notification panel spinner — ${theme}`, async ({ page }) => {
      await setTheme(page, dark);
      await seedGateAdminSession(page);
      await hang(page, (p) => p.endsWith('/private/notifications'));

      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      const bellTrigger = page.locator('.notification-bell-trigger');
      await bellTrigger.waitFor({ state: 'visible', timeout: 20_000 });
      await bellTrigger.click();

      const spinner = page.locator('.admin-loading-spinner');
      await spinner.waitFor({ state: 'visible', timeout: 10_000 });
      const metrics = await measure(spinner);
      write(`notification-panel-${theme}`, metrics);
      await page.screenshot({ path: path.join(OUT_DIR, `${PHASE}-notification-panel-${theme}.png`) });
    });

    // Every one of these pages' stores fires MULTIPLE calls in a
    // Promise.all (e.g. users.store.ts: getUsers + getRoles + getLookups).
    // Hanging only the primary call still lets the others hit
    // stubGateAdminShell's backstop abort() -- Promise.all rejects on the
    // FIRST settled rejection, not waiting for the hung one, so
    // AdminCollectionStore.run() flips `refreshing` false almost
    // immediately and the skeleton (isLoading = refreshing && !hasValue)
    // disappears before it can be measured. Hang EVERY admin call for the
    // page instead, so nothing can race it out.
    const hangEveryAdminCall = (p: string) => p.startsWith('/api/private/') || p === '/api/routes';

    const skeletonPages: { key: string; url: string; hangs: (p: string) => boolean }[] = [
      { key: 'users', url: '/admin/users', hangs: hangEveryAdminCall },
      { key: 'vehicles', url: '/admin/vehicles', hangs: hangEveryAdminCall },
      { key: 'routes', url: '/admin/routes', hangs: hangEveryAdminCall },
      { key: 'bookings', url: '/admin/bookings', hangs: hangEveryAdminCall },
    ];

    for (const sp of skeletonPages) {
      test(`admin-skeleton — ${sp.key} — ${theme}`, async ({ page }) => {
        await setTheme(page, dark);
        await seedGateAdminSession(page);
        await hang(page, sp.hangs);

        await page.goto(sp.url, { waitUntil: 'domcontentloaded' });
        const skeleton = page.locator('.admin-skeleton').first();
        await skeleton.waitFor({ state: 'visible', timeout: 15_000 });
        const metrics = await measureSkeleton(skeleton);
        write(`admin-skeleton-${sp.key}-${theme}`, metrics);
        await page.screenshot({ path: path.join(OUT_DIR, `${PHASE}-admin-skeleton-${sp.key}-${theme}.png`) });
      });
    }
  }
});
