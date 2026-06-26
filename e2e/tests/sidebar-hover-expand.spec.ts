/**
 * Playwright acceptance tests — sidebar hover-expand feature
 *
 * Runs under the standard playwright.config.ts (testDir: ./e2e, port 4200).
 * Uses the shared admin-auth.json fixture produced by e2e/global-setup.ts:
 * admin@system.local outranks salesperson in the role hierarchy, so the
 * /staff/* routes and their nav links render (needed by AC6).
 *
 * Acceptance criteria covered:
 *   AC1  — 76px rail at rest; hover expands; mouse-leave collapses after ~120ms
 *   AC2  — Overlay no-reflow: main content X position unchanged during expand/collapse
 *   AC3  — PIN: locks open on mouse-leave; content reflows to 280px; unpin reverts
 *   AC4  — Pin state persists in localStorage (key: obrs-sidebar-collapsed)
 *   AC5a — Same hover-expand behavior on /staff/schedules
 *   AC5b — Same hover-expand behavior on /admin/dashboard
 *   AC6  — Keyboard a11y: focus-in expands; focus-out collapses; pin has aria-pressed
 *   AC7  — Mobile ≤1100px: hamburger works; no hover expand; pin NOT visible in drawer
 *   AC8  — Pin icon FILL 1 when pinned, FILL 0 when unpinned (staff AND admin)
 *   AC9  — Logo is Home link in both rail and expanded states (staff AND admin)
 *   AC10 — ESC collapses expanded (unpinned) sidebar immediately
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SIDEBAR_AUTH = path.resolve(__dirname, '../fixtures/admin-auth.json');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Clear the pin preference so each test starts in default icon-rail mode. */
async function clearPinPref(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('obrs-sidebar-collapsed'));
}

/** Hover inside the sidebar (centre of it). */
async function hoverSidebar(page: Page): Promise<void> {
  const sidebar = page.locator('.admin-sidebar');
  await sidebar.hover();
}

/** Move mouse to the centre of .admin-main (off the sidebar). */
async function mouseOffSidebar(page: Page): Promise<void> {
  const mainBox = await page.locator('.admin-main').boundingBox();
  if (!mainBox) throw new Error('admin-main not found');
  await page.mouse.move(mainBox.x + mainBox.width / 2, mainBox.y + 50);
}

// ── Staff layout tests (desktop 1400×900) ─────────────────────────────────────

test.describe('Sidebar hover-expand — staff layout', () => {
  test.use({ storageState: SIDEBAR_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/staff/sell');
    await page.waitForLoadState('domcontentloaded');
    await clearPinPref(page);
    // Ensure sidebar starts collapsed (clear pin, then reload to pick up default)
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  // ── AC1: 76px rail at rest; hover expands; mouse-leave collapses ─────────────

  test('AC1: sidebar rests as 76px rail; hover expands; mouse-leave collapses after ~120ms', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');

    // Rail state — not expanded
    await expect(sidebar).not.toHaveClass(/is-expanded/);

    const railWidth = await sidebar.evaluate((el: Element) => el.getBoundingClientRect().width);
    expect(railWidth).toBe(76);

    // Hover → expand
    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    // Mouse off → wait for 120ms delay
    await mouseOffSidebar(page);
    await page.waitForTimeout(200);
    await expect(sidebar).not.toHaveClass(/is-expanded/);
  });

  // ── AC2: Overlay no-reflow — content X position stable ───────────────────────

  test('AC2: hover-expand is overlay — main content X position does not change', async ({ page }) => {
    const main = page.locator('.admin-main');

    const beforeBox = await main.boundingBox();
    expect(beforeBox).not.toBeNull();

    // Hover to expand
    await hoverSidebar(page);
    await page.locator('.admin-sidebar').waitFor({ state: 'visible' });
    await expect(page.locator('.admin-sidebar')).toHaveClass(/is-expanded/);

    const duringBox = await main.boundingBox();
    expect(duringBox).not.toBeNull();
    expect(duringBox!.x).toBe(beforeBox!.x);

    // Collapse
    await mouseOffSidebar(page);
    await page.waitForTimeout(200);
    const afterBox = await main.boundingBox();
    expect(afterBox).not.toBeNull();
    expect(afterBox!.x).toBe(beforeBox!.x);
  });

  // ── AC3: PIN locks sidebar open; content reflows; unpin reverts ──────────────

  test('AC3: pin locks sidebar open on mouse-leave; pinned sidebar reserves 280px column; unpin reverts', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');
    const shell = page.locator('.admin-shell');
    const pinBtn = page.locator('.admin-sidebar-pin');

    // Expand, then pin
    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);
    await pinBtn.click();

    // Move mouse off — sidebar must remain open
    await mouseOffSidebar(page);
    await page.waitForTimeout(200);
    await expect(sidebar).toHaveClass(/is-expanded/);
    await expect(shell).toHaveClass(/is-sidebar-pinned/);

    // Reserved 280px layout column: sidebar width in flow must be 280px
    const pinnedWidth = await sidebar.evaluate((el: Element) => el.getBoundingClientRect().width);
    expect(pinnedWidth).toBe(280);

    // Content (admin-main) starts to the right of the 280px column
    const mainBox = await page.locator('.admin-main').boundingBox();
    expect(mainBox).not.toBeNull();
    expect(mainBox!.x).toBeCloseTo(280, -1); // within ~10px

    // Unpin → returns to hover mode
    await pinBtn.click();
    await mouseOffSidebar(page);
    await page.waitForTimeout(200);
    await expect(sidebar).not.toHaveClass(/is-expanded/);
    await expect(shell).not.toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC4: Pin preference persists in localStorage ──────────────────────────────

  test('AC4: pin writes "0" to localStorage; reload stays pinned; unpin writes "1"; reload back to rail', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');
    const pinBtn = page.locator('.admin-sidebar-pin');

    // Pin
    await hoverSidebar(page);
    await pinBtn.click();
    const stored = await page.evaluate(() => localStorage.getItem('obrs-sidebar-collapsed'));
    expect(stored).toBe('0');

    // Reload — sidebar should be pinned open
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(sidebar).toHaveClass(/is-expanded/);
    await expect(page.locator('.admin-shell')).toHaveClass(/is-sidebar-pinned/);

    // Unpin
    await page.locator('.admin-sidebar-pin').click();
    const storedAfterUnpin = await page.evaluate(() => localStorage.getItem('obrs-sidebar-collapsed'));
    expect(storedAfterUnpin).toBe('1');

    // Reload — sidebar should be in rail mode
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(sidebar).not.toHaveClass(/is-expanded/);
    await expect(page.locator('.admin-shell')).not.toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC5a: Same behavior on /staff/schedules ───────────────────────────────────

  test('AC5a: same hover-expand behavior on /staff/schedules', async ({ page }) => {
    await page.goto('/staff/schedules');
    await page.waitForLoadState('domcontentloaded');

    const sidebar = page.locator('.admin-sidebar');
    await expect(sidebar).not.toHaveClass(/is-expanded/);

    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    await mouseOffSidebar(page);
    await page.waitForTimeout(200);
    await expect(sidebar).not.toHaveClass(/is-expanded/);
  });

  // ── AC8: Pin icon FILL variation — staff ─────────────────────────────────────

  test('AC8: pin icon is FILL 0 when unpinned and FILL 1 when pinned (staff)', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');
    const pinBtn = page.locator('.admin-sidebar-pin');
    const pinIcon = pinBtn.locator('.material-symbols-outlined');

    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    // Unpinned: FILL 0
    const unpinnedVar = await pinIcon.evaluate(
      (el: HTMLElement) => el.style.fontVariationSettings
    );
    expect(unpinnedVar).toContain('"FILL" 0');

    // Pin — FILL 1
    await pinBtn.click();
    const pinnedVar = await pinIcon.evaluate(
      (el: HTMLElement) => el.style.fontVariationSettings
    );
    expect(pinnedVar).toContain('"FILL" 1');
  });

  // ── AC9: Logo is Home link in rail and expanded states (staff) ────────────────

  test('AC9: brand logo links to /home in both rail and expanded states (staff)', async ({ page }) => {
    const brandLink = page.locator('.admin-brand-link');
    const sidebar = page.locator('.admin-sidebar');

    // Rail state
    await expect(sidebar).not.toHaveClass(/is-expanded/);
    await expect(brandLink).toHaveAttribute('href', '/home');

    // Expanded state
    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);
    await expect(brandLink).toHaveAttribute('href', '/home');
  });

  // ── AC10: ESC collapses expanded (unpinned) sidebar immediately ───────────────

  test('AC10: ESC collapses expanded unpinned sidebar immediately (no delay)', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');

    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    await page.keyboard.press('Escape');
    // No waitForTimeout — ESC should collapse immediately
    await expect(sidebar).not.toHaveClass(/is-expanded/);
  });

  // ── Keyboard accessibility (AC6) ─────────────────────────────────────────────

  test('AC6: focusing a nav link expands the sidebar; focusing outside collapses it (unpinned)', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');
    const firstNavLink = page.locator('.admin-nav-link').first();

    // Sidebar starts collapsed
    await expect(sidebar).not.toHaveClass(/is-expanded/);

    // Focus a nav link inside the sidebar — focusin fires on aside → expands
    await firstNavLink.focus();
    await expect(sidebar).toHaveClass(/is-expanded/);

    // Move focus to a FOCUSABLE element outside the sidebar (the theme toggle button
    // in the topbar is a real <button> that accepts focus via Tab or focus()).
    await page.locator('.admin-topbar-actions button[aria-pressed]').focus();
    // focusout on the sidebar: relatedTarget is outside sidebar → collapses immediately
    await expect(sidebar).not.toHaveClass(/is-expanded/);
  });

  test('AC6b: pin button carries aria-pressed reflecting pin state and is keyboard-reachable', async ({ page }) => {
    const pinBtn = page.locator('.admin-sidebar-pin');
    const sidebar = page.locator('.admin-sidebar');

    // Expand sidebar so pin button is visible
    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    // aria-pressed should be "false" when unpinned
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'false');

    // Click pin via keyboard (Enter key after focus)
    await pinBtn.focus();
    await page.keyboard.press('Enter');
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── Admin layout tests ────────────────────────────────────────────────────────

test.describe('Sidebar hover-expand — admin layout', () => {
  test.use({ storageState: SIDEBAR_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await clearPinPref(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  // ── AC5b: Same behavior on /admin/dashboard ───────────────────────────────────

  test('AC5b: hover-expand behavior on /admin/dashboard', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');

    await expect(sidebar).not.toHaveClass(/is-expanded/);

    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    await mouseOffSidebar(page);
    await page.waitForTimeout(200);
    await expect(sidebar).not.toHaveClass(/is-expanded/);
  });

  // ── AC8b: Pin icon variation — admin ─────────────────────────────────────────

  test('AC8b: pin icon is FILL 0 unpinned and FILL 1 pinned (admin)', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');
    const pinBtn = page.locator('.admin-sidebar-pin');
    const pinIcon = pinBtn.locator('.material-symbols-outlined');

    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);

    const unpinnedVar = await pinIcon.evaluate(
      (el: HTMLElement) => el.style.fontVariationSettings
    );
    expect(unpinnedVar).toContain('"FILL" 0');

    await pinBtn.click();
    const pinnedVar = await pinIcon.evaluate(
      (el: HTMLElement) => el.style.fontVariationSettings
    );
    expect(pinnedVar).toContain('"FILL" 1');
  });

  // ── AC9b: Logo links to /home (admin) ────────────────────────────────────────

  test('AC9b: brand logo links to /home in both rail and expanded states (admin)', async ({ page }) => {
    const brandLink = page.locator('.admin-brand-link');
    const sidebar = page.locator('.admin-sidebar');

    await expect(brandLink).toHaveAttribute('href', '/home');

    await hoverSidebar(page);
    await expect(sidebar).toHaveClass(/is-expanded/);
    await expect(brandLink).toHaveAttribute('href', '/home');
  });
});

// ── Mobile viewport tests ─────────────────────────────────────────────────────

test.describe('Sidebar — mobile viewport ≤1100px', () => {
  test.use({ storageState: SIDEBAR_AUTH, viewport: { width: 800, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/staff/sell');
    await page.waitForLoadState('domcontentloaded');
    await clearPinPref(page);
  });

  // ── AC7: Mobile hamburger works; no rail/hover expand; pin NOT visible ─────────

  test('AC7: pin button is hidden on mobile; hamburger opens/closes drawer; sidebar not rail at rest', async ({ page }) => {
    const pinBtn = page.locator('.admin-sidebar-pin');
    const hamburger = page.locator('.admin-menu-toggle');
    const sidebar = page.locator('.admin-sidebar');

    // Pin button must NOT be visible (display:none base rule covers mobile)
    await expect(pinBtn).toBeHidden();

    // Hamburger toggle must be visible
    await expect(hamburger).toBeVisible();

    // At rest, mobile sidebar is off-canvas (transform: translateX(-100%)).
    // It should NOT carry is-open or is-expanded on load.
    await expect(sidebar).not.toHaveClass(/is-open/);

    // Rail width should NOT be 76px — mobile sidebar has fixed 280px width when
    // off-canvas; the 76px rail is desktop-only (min-width: 1101px block).
    // We verify no rail by checking there is no visible 76px element in the page flow.
    const sidebarBox = await sidebar.boundingBox();
    // Mobile sidebar is off-screen: x would be negative or element hidden
    // Either way it must NOT be 76px wide as a rail
    if (sidebarBox) {
      expect(sidebarBox.width).not.toBe(76);
    }

    // Hamburger opens the drawer
    await hamburger.click();
    await expect(sidebar).toHaveClass(/is-open/);

    // On mobile the drawer (z-index 40) overlaps the topbar hamburger button
    // (topbar z-index 20). The intended close path is the backdrop click.
    const backdrop = page.locator('.admin-sidebar-backdrop');
    await expect(backdrop).toBeVisible();
    await backdrop.click();
    await expect(sidebar).not.toHaveClass(/is-open/);
  });

  test('AC7b: mobile drawer footer (logout) is pinned to bottom and visible', async ({ page }) => {
    const hamburger = page.locator('.admin-menu-toggle');
    const sidebar = page.locator('.admin-sidebar');

    await hamburger.click();
    await expect(sidebar).toHaveClass(/is-open/);

    // Footer with logout must be present inside the drawer
    const footer = page.locator('.admin-sidebar-footer');
    await expect(footer).toBeVisible();

    // The logout button must be in the footer
    const logoutBtn = page.locator('.admin-sidebar-footer .admin-nav-btn');
    await expect(logoutBtn).toBeVisible();
  });
});
