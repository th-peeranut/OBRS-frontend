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
  // The shell shots are taken on /admin/dashboard, so its one call has to be
  // stubbed too. Without it the catch-all aborts it and the page renders
  // ADMIN.DASHBOARD.LOAD_FAILED — a red "cannot load" banner sitting in the
  // middle of every shell shot, which reads as "the feature is broken" to
  // someone reviewing the card. The numbers below are decoration; the sidebar
  // is the subject.
  await page.route('**/private/admin/dashboard/today', (route) =>
    route.fulfill(
      ok({
        date: '2026-07-26',
        timezone: 'Asia/Bangkok',
        basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
        tiles: {
          departuresCount: 6,
          occupancyRatePct: 78.5,
          bookingCount: 42,
          revenue: { net: '18425.00', paid: '19100.00', refunded: '675.00', currency: 'THB' },
        },
        departures: [],
      })
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

/** Breathing room under the nav so the fitted viewport is never off-by-one. */
const VIEWPORT_PAD = 60;

/**
 * Where the nav sits in the window, and whether anything it lives in is
 * scrolled. Measured, because every part of this was guessed wrong once:
 *
 * - the nav is 1287px tall but STARTS at y=199 (logo + profile block sit above
 *   it inside the panel), so "nav height fits the viewport" is not the same
 *   question as "the nav is on screen" — a check on the height alone passed
 *   while the last entry was still 85px below the fold;
 * - the element that actually scrolls is `div.admin-sidebar-panel`
 *   (`overflow-y: auto`), NOT `nav.admin-nav` (`overflow-y: visible`), so
 *   reading `nav.scrollTop` proves nothing.
 */
async function measureNav(page: Page): Promise<{
  top: number;
  bottom: number;
  scrolled: string[];
}> {
  return sidebarNav(page).evaluate((nav) => {
    const box = nav.getBoundingClientRect();
    const scrolled: string[] = [];
    if (window.scrollY !== 0) scrolled.push(`window=${window.scrollY}`);
    for (let el: Element | null = nav; el && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollTop !== 0) scrolled.push(`${el.tagName.toLowerCase()}.${el.className}=${el.scrollTop}`);
    }
    return { top: Math.floor(box.top), bottom: Math.ceil(box.bottom), scrolled };
  });
}

/**
 * Grow the viewport until the ENTIRE sidebar is on screen at once.
 *
 * <p>`nav.admin-nav` is ~1290px tall with the System group LAST, so at the
 * config's 1280x720 it does not fit. The first version of this file dealt with
 * that by scrolling the System group into view before shooting the nav element,
 * and that is what produced the evidence the user rejected: Playwright does not
 * stitch an element taller than the viewport, it returns the element's full box
 * with the off-screen part UNPAINTED. The uploaded `before-sidebar-nav.png` was
 * 247x1287 with the top 570px — 44% of the image — blank white.
 *
 * <p>So scrolling is the bug, not the fix. Make the window tall enough instead
 * and nothing has to move. Sized from the live measurement rather than a
 * constant, so adding a nav item cannot silently reintroduce the clipping.
 */
async function fitViewportToNav(page: Page): Promise<void> {
  await expect(sidebarNav(page)).toBeVisible({ timeout: 30_000 });

  const width = page.viewportSize()!.width;
  const { bottom } = await measureNav(page);
  await page.setViewportSize({ width, height: bottom + VIEWPORT_PAD });

  // Re-measure: a taller window can re-flow the layout it was measured from.
  await expect
    .poll(async () => (await measureNav(page)).bottom, { timeout: 5_000 })
    .toBeLessThanOrEqual(page.viewportSize()!.height);
}

/**
 * Shoot the sidebar, refusing to shoot anything that would come back clipped.
 *
 * <p>Three conditions, all measured, because the failure this guards against is
 * invisible to the test that produced it — the run went green and only a human
 * looking at the PNG noticed the white band.
 */
async function shootSidebar(page: Page, anchorSelector: string, file: string): Promise<void> {
  const viewport = page.viewportSize()!;
  const { top, bottom, scrolled } = await measureNav(page);

  expect(top, `sidebar nav starts ${top}px above the window — it would shoot clipped`).toBeGreaterThanOrEqual(0);
  expect(
    bottom,
    `sidebar nav ends at ${bottom}px but the window is only ${viewport.height}px tall. Do NOT ` +
      `scroll to compensate — the off-screen part comes back blank white. Call ` +
      `fitViewportToNav(page) before shooting.`
  ).toBeLessThanOrEqual(viewport.height);

  // A shot taken at a non-zero offset starts wherever the scroll left off,
  // which is the other half of the same defect.
  expect(scrolled, 'nothing may be scrolled when the sidebar shot is taken').toEqual([]);

  // Belt and braces: the row this card actually changed must be on screen.
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

  await fitViewportToNav(page);
  await shootSidebar(page, 'a[href*="config-change-history"]', 'before-sidebar-nav.png');
  // Same fitted viewport, so the shell shot carries the whole sidebar too
  // rather than the arbitrary top slice a 720px window would cut.
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

  await fitViewportToNav(page);
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

  await fitViewportToNav(page);
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
