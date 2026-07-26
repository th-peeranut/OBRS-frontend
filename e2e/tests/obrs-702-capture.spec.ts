import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-702 evidence capture — see playwright.obrs702.config.ts for how to run
 * it (two hand-started servers, no backend).
 *
 * <p>BEFORE and AFTER differ by ONE variable: the tree being served. Same
 * viewport, same synthetic session, same stubs, same language. The role is the
 * only other thing varied, and it is varied on BOTH sides — the owner pair
 * exists to show that role's access is identical before and after, which is
 * the claim this card originally got wrong.
 *
 * <p>Every screenshot asserts what it is supposed to show BEFORE shooting. A
 * capture that silently caught a spinner, a permission-denied bounce or an
 * empty sidebar is worse than no capture: it looks like proof.
 */

const BEFORE = 'http://localhost:4702';
const AFTER = 'http://localhost:4703';
const ASSETS = 'e2e-evidence/OBRS-702';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/**
 * The four config reads the tabs make. Registered AFTER stubGateAdminShell's
 * catch-all so they win (Playwright matches routes in reverse registration
 * order) — without them the forms never leave their loading state and the
 * shots would be of skeletons.
 */
async function stubConfigReads(page: Page): Promise<void> {
  await page.route('**/private/admin/configs/booking-policy', (route) =>
    route.fulfill(ok({ maxAdvanceDays: 60, cutoffMinutes: 20 }))
  );
  await page.route('**/private/admin/configs/reminders', (route) =>
    route.fulfill(
      ok({ reminderHoursBeforeDeparture: 24, boardingReminderMinutesBeforeDeparture: 45 })
    )
  );
  await page.route('**/private/admin/configs/jump-seat', (route) =>
    route.fulfill(ok({ enabled: true }))
  );
  await page.route('**/private/admin/configs/history**', (route) =>
    route.fulfill(
      ok({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true })
    )
  );
}

async function openAdmin(page: Page, origin: string, roles: string[], path: string): Promise<void> {
  await seedGateAdminSession(page, {
    username: roles.includes('admin') ? 'admin@system.local' : 'owner@system.local',
    roles,
    language: 'th',
  });
  await stubConfigReads(page);
  await page.goto(`${origin}${path}`);
}

/**
 * The whole sidebar nav. NOT a per-section locator: the layout renders section
 * titles as flat `<p class="admin-nav-section-title">` siblings inside one
 * `<nav>` with no wrapper element per section, so there is nothing to crop to.
 * The System group is the last one, and shooting the whole nav also shows that
 * no OTHER section changed.
 */
const sidebarNav = (page: Page) => page.locator('nav.admin-nav');

/**
 * Shoot the sidebar with `anchorSelector` scrolled into view.
 *
 * <p>The scroll is not cosmetic. `nav.admin-nav` overflows its viewport and the
 * System group is the LAST one, so an element screenshot taken without
 * scrolling clips exactly the rows this card changed — the first run produced a
 * BEFORE and an AFTER that were indistinguishable because neither contained any
 * config entry at all. A screenshot that cannot show the difference is worse
 * than none; it reads as "nothing changed".
 */
async function shootSidebar(page: Page, anchorSelector: string, file: string): Promise<void> {
  await page.locator(anchorSelector).first().scrollIntoViewIfNeeded();
  await expect(page.locator(anchorSelector).first()).toBeInViewport();
  await sidebarNav(page).screenshot({ path: `${ASSETS}/${file}` });
}

test('BEFORE (origin/dev 3eff9dc1) — four config entries in the sidebar System section', async ({
  page,
}) => {
  await openAdmin(page, BEFORE, ['admin'], '/admin/dashboard');

  // Prove the session took and the sidebar rendered, or the shot is of a
  // logged-out shell that merely happens to have no config entries.
  await expect(page.locator('a[href*="/admin/dashboard"]').first()).toBeVisible({
    timeout: 30_000,
  });
  for (const path of [
    'booking-policy-config',
    'reminder-config',
    'jump-seat-config',
    'config-change-history',
  ]) {
    await expect(page.locator(`a[href*="${path}"]`), `BEFORE must still have ${path}`).toHaveCount(
      1
    );
  }
  await expect(page.locator('a[href$="/admin/settings"]')).toHaveCount(0);

  await shootSidebar(page, 'a[href*="config-change-history"]', 'before-sidebar-nav.png');
  await page.screenshot({ path: `${ASSETS}/before-admin-shell.png` });
});

test('AFTER — one "System settings" entry replaces all four', async ({ page }) => {
  await openAdmin(page, AFTER, ['admin'], '/admin/dashboard');

  await expect(page.locator('a[href*="/admin/dashboard"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('a[href$="/admin/settings"]')).toHaveCount(1);
  for (const path of [
    'booking-policy-config',
    'reminder-config',
    'jump-seat-config',
    'config-change-history',
  ]) {
    await expect(page.locator(`a[href*="${path}"]`)).toHaveCount(0);
  }

  await shootSidebar(page, 'a[href$="/admin/settings"]', 'after-sidebar-nav.png');
  await page.screenshot({ path: `${ASSETS}/after-admin-shell.png` });
});

test('AFTER — ADMIN sees all four tabs, opened on booking policy', async ({ page }) => {
  await openAdmin(page, AFTER, ['admin'], '/admin/settings');

  // The empty path redirects to the first tab, so this also proves the default.
  await page.waitForURL((url) => url.pathname.endsWith('/admin/settings/booking-policy'), {
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid^="system-settings-tab-"]')).toHaveCount(4);
  // The form, not a skeleton.
  await expect(page.locator('input#maxAdvanceDays')).toHaveValue('60', { timeout: 15_000 });
  // The sidebar must still say where you are. This entry is the only one whose
  // page lives at a CHILD route, so under the layout's default exact match it
  // would go dark the instant the tab redirect fired (hence `matchSubtree`).
  await expect(page.locator('a[href$="/admin/settings"]')).toHaveClass(/active/);

  await page.screenshot({ path: `${ASSETS}/after-settings-admin-booking-policy.png` });
});

test('AFTER — ADMIN switches to the jump-seat tab', async ({ page }) => {
  await openAdmin(page, AFTER, ['admin'], '/admin/settings/jump-seat');

  await expect(page.locator('[data-testid="system-settings-tab-jump-seat"]')).toHaveClass(/active/, {
    timeout: 30_000,
  });
  await expect(page.locator('p-inputswitch').first()).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${ASSETS}/after-settings-admin-jump-seat.png` });
});

test('AFTER — a plain OWNER gets the same four tabs, unchanged from before', async ({ page }) => {
  await openAdmin(page, AFTER, ['owner'], '/admin/settings');

  await page.waitForURL((url) => url.pathname.endsWith('/admin/settings/booking-policy'), {
    timeout: 30_000,
  });
  // This shot exists because an earlier version of this card asserted the
  // opposite. `AuthService.ROLE_GRANTS` grants `admin` to `owner` as well as
  // the reverse (auth.service.ts:60-62), so `['admin']` was never admin-only on
  // this frontend: an owner had all four sidebar entries before OBRS-702 and
  // has all four tabs after it. The corresponding BEFORE shot (same role, same
  // stubs, other port) is what makes that a comparison rather than a claim.
  await expect(page.locator('[data-testid^="system-settings-tab-"]')).toHaveCount(4);
  await expect(page.locator('input#maxAdvanceDays')).toHaveValue('60', { timeout: 15_000 });

  await page.screenshot({ path: `${ASSETS}/after-settings-owner-four-tabs.png` });
});

test('BEFORE — the same OWNER already had all four config entries', async ({ page }) => {
  await openAdmin(page, BEFORE, ['owner'], '/admin/dashboard');

  await expect(page.locator('a[href*="/admin/dashboard"]').first()).toBeVisible({
    timeout: 30_000,
  });
  for (const path of [
    'booking-policy-config',
    'reminder-config',
    'jump-seat-config',
    'config-change-history',
  ]) {
    await expect(page.locator(`a[href*="${path}"]`), `owner must already see ${path}`).toHaveCount(
      1
    );
  }

  await shootSidebar(page, 'a[href*="config-change-history"]', 'before-sidebar-nav-owner.png');
});

test('AFTER — leaving a tab with an unsaved edit asks first', async ({ page }) => {
  await openAdmin(page, AFTER, ['admin'], '/admin/settings/booking-policy');

  const maxAdvanceDays = page.locator('input#maxAdvanceDays');
  await expect(maxAdvanceDays).toHaveValue('60', { timeout: 30_000 });
  await maxAdvanceDays.fill('');
  await maxAdvanceDays.fill('45');

  await page.locator('[data-testid="system-settings-tab-reminders"]').click();

  // Assert the DIALOG, and that the tab did NOT change under it — a screenshot
  // taken a moment too early would otherwise show a plain form and read as
  // "no prompt shown".
  await expect(page.locator('.swal2-container')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/admin\/settings\/booking-policy$/);

  // Wait for the fade-in to FINISH, measured rather than slept for: the first
  // run shot the popup at partial opacity and the text was ghosted over the
  // form behind it. Opacity 1 is the property that decides whether the shot is
  // legible, so assert that, not a stopwatch.
  await expect
    .poll(() =>
      page.locator('.swal2-popup').evaluate((el) => getComputedStyle(el).opacity)
    )
    .toBe('1');

  await page.screenshot({ path: `${ASSETS}/after-unsaved-changes-prompt.png` });

  // Cancelling keeps the edit — the other half of the promise.
  await page.locator('.swal2-cancel').click();
  await expect(page.locator('.swal2-container')).toHaveCount(0, { timeout: 15_000 });
  await expect(maxAdvanceDays).toHaveValue('45');
  await expect(page).toHaveURL(/\/admin\/settings\/booking-policy$/);
});
