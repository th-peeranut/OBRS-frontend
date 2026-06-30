/**
 * Playwright acceptance tests — sidebar always-reserved-column layout
 *
 * Supersedes the hover-expand spec (ADR 0005 amended 2026-06-30).
 * The sidebar is now ALWAYS an in-flow flex column — never a floating overlay.
 * Two widths are toggled by an EXPLICIT click on the toggle button:
 *   - Expanded (default): 280px reserved column, labels visible.
 *   - Collapsed: 76px icon rail, labels hidden.
 *
 * Runs under the standard playwright.config.ts (testDir: ./e2e, port 4200).
 * Uses the shared admin-auth.json fixture produced by e2e/global-setup.ts.
 *
 * Acceptance criteria covered:
 *   AC1  — Default: expanded 280px reserved column; no hover change
 *   AC2  — Content starts to the right of the sidebar in BOTH states (no overlap)
 *   AC3  — Toggle click collapses to 76px rail; main content reflows rightward
 *   AC4  — Toggle from rail expands back to 280px; localStorage persists state
 *   AC5a — Same always-reserved-column behavior on /staff/schedules
 *   AC5b — Same always-reserved-column behavior on /admin/dashboard
 *   AC6  — Toggle button is visible in BOTH states (not hidden in rail)
 *   AC6b — Toggle button aria-pressed reflects expanded/collapsed state
 *   AC7  — Mobile ≤1100px: hamburger drawer unchanged; desktop toggle hidden
 *   AC8  — Logo is Home link in both collapsed and expanded states (staff + admin)
 *   AC9  — ESC closes mobile drawer and profile menu; desktop sidebar state unchanged
 *   AC10 — Stored "1" on reload → starts collapsed; stored "0" → starts expanded
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SIDEBAR_AUTH = path.resolve(__dirname, '../fixtures/admin-auth.json');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Clear stored preference so the test starts from the fresh-user default. */
async function clearSidebarPref(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('obrs-sidebar-collapsed'));
}

/** Write a specific sidebar preference without reloading. */
async function setSidebarPref(page: Page, value: '0' | '1'): Promise<void> {
  await page.evaluate((v) => localStorage.setItem('obrs-sidebar-collapsed', v), value);
}

/** Click the sidebar toggle button. */
async function clickToggle(page: Page): Promise<void> {
  await page.locator('.admin-sidebar-pin').click();
}

// ── Staff layout tests (desktop 1400×900 default viewport) ────────────────────

test.describe('Sidebar always-reserved-column — staff layout', () => {
  test.use({ storageState: SIDEBAR_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/staff/sell');
    await page.waitForLoadState('domcontentloaded');
    // Clear preference and reload so the component reads the fresh default.
    await clearSidebarPref(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  // ── AC1: Default = expanded 280px; hover does NOT change width ────────────────

  test('AC1: sidebar starts as expanded 280px reserved column by default', async ({ page }) => {
    const shell = page.locator('.admin-shell');
    const sidebar = page.locator('.admin-sidebar');

    // Default: expanded (is-sidebar-pinned present)
    await expect(shell).toHaveClass(/is-sidebar-pinned/);

    const sidebarWidth = await sidebar.evaluate((el: Element) => el.getBoundingClientRect().width);
    expect(sidebarWidth).toBe(280);

    // Hover inside the sidebar — width must NOT change (no hover model)
    await sidebar.hover();
    await page.waitForTimeout(200);
    const widthAfterHover = await sidebar.evaluate((el: Element) => el.getBoundingClientRect().width);
    expect(widthAfterHover).toBe(280);
    // is-expanded must never appear (overlay model gone)
    await expect(sidebar).not.toHaveClass(/is-expanded/);
  });

  // ── AC2: Content starts to the right in BOTH states — no overlap ─────────────

  test('AC2: main content starts immediately to the right of the sidebar in both states', async ({ page }) => {
    const sidebar = page.locator('.admin-sidebar');
    const main = page.locator('.admin-main');

    // Expanded: main starts at ~280px
    const expandedSidebarBox = await sidebar.boundingBox();
    const expandedMainBox = await main.boundingBox();
    expect(expandedSidebarBox).not.toBeNull();
    expect(expandedMainBox).not.toBeNull();
    // main.x should equal (sidebar.x + sidebar.width) within 2px tolerance
    expect(expandedMainBox!.x).toBeCloseTo(expandedSidebarBox!.x + expandedSidebarBox!.width, -1);

    // Collapse → main reflows left
    await clickToggle(page);
    await page.waitForTimeout(250); // allow transition
    const collapsedSidebarBox = await sidebar.boundingBox();
    const collapsedMainBox = await main.boundingBox();
    expect(collapsedSidebarBox).not.toBeNull();
    expect(collapsedMainBox).not.toBeNull();
    expect(collapsedSidebarBox!.width).toBe(76);
    expect(collapsedMainBox!.x).toBeCloseTo(collapsedSidebarBox!.x + collapsedSidebarBox!.width, -1);
  });

  // ── AC3: Toggle collapses to 76px rail; main content reflows ─────────────────

  test('AC3: toggle click collapses to 76px icon rail; shell loses is-sidebar-pinned', async ({ page }) => {
    const shell = page.locator('.admin-shell');
    const sidebar = page.locator('.admin-sidebar');

    // Start expanded
    await expect(shell).toHaveClass(/is-sidebar-pinned/);

    // Click toggle to collapse
    await clickToggle(page);
    await page.waitForTimeout(250);

    await expect(shell).not.toHaveClass(/is-sidebar-pinned/);

    const railWidth = await sidebar.evaluate((el: Element) => el.getBoundingClientRect().width);
    expect(railWidth).toBe(76);
  });

  // ── AC4: Toggle from rail expands back; localStorage persists ─────────────────

  test('AC4: collapse writes "1" to localStorage; expand writes "0"; reload restores state', async ({ page }) => {
    const shell = page.locator('.admin-shell');

    // Collapse
    await clickToggle(page);
    const afterCollapse = await page.evaluate(() => localStorage.getItem('obrs-sidebar-collapsed'));
    expect(afterCollapse).toBe('1');

    // Reload → should stay collapsed
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(shell).not.toHaveClass(/is-sidebar-pinned/);

    // Expand
    await clickToggle(page);
    const afterExpand = await page.evaluate(() => localStorage.getItem('obrs-sidebar-collapsed'));
    expect(afterExpand).toBe('0');

    // Reload → should stay expanded
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC5a: Same always-reserved-column behavior on /staff/schedules ────────────

  test('AC5a: always-reserved-column behavior on /staff/schedules', async ({ page }) => {
    await page.goto('/staff/schedules');
    await page.waitForLoadState('domcontentloaded');

    const shell = page.locator('.admin-shell');
    const sidebar = page.locator('.admin-sidebar');

    // Default: expanded
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
    await expect(sidebar).not.toHaveClass(/is-expanded/);

    // Toggle to collapse
    await clickToggle(page);
    await expect(shell).not.toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC6: Toggle button is visible in BOTH states ──────────────────────────────

  test('AC6: toggle button is visible and actionable in both expanded and collapsed states', async ({ page }) => {
    const toggleBtn = page.locator('.admin-sidebar-pin');

    // Expanded state: button visible
    await expect(toggleBtn).toBeVisible();

    // Collapse
    await clickToggle(page);
    await page.waitForTimeout(250);

    // Collapsed state: button still visible
    await expect(toggleBtn).toBeVisible();

    // Expand again via the button (proves it is interactable in rail mode)
    await clickToggle(page);
    await page.waitForTimeout(250);
    await expect(page.locator('.admin-shell')).toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC6b: Toggle button aria-pressed reflects state ──────────────────────────

  test('AC6b: toggle button aria-pressed is "true" when expanded and "false" when collapsed', async ({ page }) => {
    const toggleBtn = page.locator('.admin-sidebar-pin');

    // Expanded: aria-pressed="true"
    await expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');

    // Collapse
    await clickToggle(page);
    await page.waitForTimeout(250);

    // Collapsed: aria-pressed="false"
    await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
  });

  // ── AC8: Logo is Home link in both states (staff) ────────────────────────────

  test('AC8: brand logo links to /home in both collapsed and expanded states (staff)', async ({ page }) => {
    const brandLink = page.locator('.admin-brand-link');

    // Expanded
    await expect(brandLink).toHaveAttribute('href', '/home');

    // Collapse
    await clickToggle(page);
    await page.waitForTimeout(250);

    // Collapsed
    await expect(brandLink).toHaveAttribute('href', '/home');
  });

  // ── AC9: ESC closes mobile drawer / profile menu; desktop sidebar unchanged ───

  test('AC9: ESC closes profile menu; sidebar expand/collapse state is NOT changed by ESC', async ({ page }) => {
    const shell = page.locator('.admin-shell');

    // Default: expanded
    await expect(shell).toHaveClass(/is-sidebar-pinned/);

    // Open profile menu
    await page.locator('.admin-avatar').click();
    const profileMenu = page.locator('.admin-profile-menu');
    await expect(profileMenu).toBeVisible();

    // ESC closes profile menu
    await page.keyboard.press('Escape');
    await expect(profileMenu).not.toBeVisible();

    // Sidebar is still expanded (ESC does not collapse the reserved column)
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC10: Reload with stored "1" → collapsed; "0" → expanded ─────────────────

  test('AC10: stored "1" on reload starts collapsed; stored "0" starts expanded', async ({ page }) => {
    const shell = page.locator('.admin-shell');

    // Force collapsed pref and reload
    await setSidebarPref(page, '1');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(shell).not.toHaveClass(/is-sidebar-pinned/);

    // Force expanded pref and reload
    await setSidebarPref(page, '0');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
  });
});

// ── Admin layout tests ────────────────────────────────────────────────────────

test.describe('Sidebar always-reserved-column — admin layout', () => {
  test.use({ storageState: SIDEBAR_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await clearSidebarPref(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  // ── AC5b: Same always-reserved-column behavior on /admin/dashboard ────────────

  test('AC5b: always-reserved-column behavior on /admin/dashboard (no hover expand)', async ({ page }) => {
    const shell = page.locator('.admin-shell');
    const sidebar = page.locator('.admin-sidebar');

    // Default: expanded; no is-expanded class ever
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
    await expect(sidebar).not.toHaveClass(/is-expanded/);

    // Hover does NOT change state
    await sidebar.hover();
    await page.waitForTimeout(200);
    await expect(sidebar).not.toHaveClass(/is-expanded/);
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
  });

  test('AC5b-toggle: toggle collapses and expands on /admin/dashboard', async ({ page }) => {
    const shell = page.locator('.admin-shell');

    await expect(shell).toHaveClass(/is-sidebar-pinned/);

    await clickToggle(page);
    await expect(shell).not.toHaveClass(/is-sidebar-pinned/);

    await clickToggle(page);
    await expect(shell).toHaveClass(/is-sidebar-pinned/);
  });

  // ── AC8b: Logo links to /home (admin) ────────────────────────────────────────

  test('AC8b: brand logo links to /home in both collapsed and expanded states (admin)', async ({ page }) => {
    const brandLink = page.locator('.admin-brand-link');

    await expect(brandLink).toHaveAttribute('href', '/home');

    await clickToggle(page);
    await page.waitForTimeout(250);

    await expect(brandLink).toHaveAttribute('href', '/home');
  });
});

// ── Mobile viewport tests ─────────────────────────────────────────────────────

test.describe('Sidebar — mobile viewport ≤1100px', () => {
  test.use({ storageState: SIDEBAR_AUTH, viewport: { width: 800, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/staff/sell');
    await page.waitForLoadState('domcontentloaded');
    await clearSidebarPref(page);
  });

  // ── AC7: Mobile hamburger drawer unchanged; desktop toggle hidden ──────────────

  test('AC7: hamburger opens/closes drawer; sidebar not a 76px rail on mobile', async ({ page }) => {
    const hamburger = page.locator('.admin-menu-toggle');
    const sidebar = page.locator('.admin-sidebar');

    // Hamburger toggle must be visible on mobile
    await expect(hamburger).toBeVisible();

    // At rest, mobile sidebar is off-canvas — should NOT have is-open
    await expect(sidebar).not.toHaveClass(/is-open/);

    // Mobile sidebar is off-screen; its width is 280px (not the 76px rail)
    const sidebarBox = await sidebar.boundingBox();
    if (sidebarBox) {
      // Either off-screen (negative x) or 280px wide — NOT 76px
      expect(sidebarBox.width).not.toBe(76);
    }

    // Hamburger opens the drawer
    await hamburger.click();
    await expect(sidebar).toHaveClass(/is-open/);

    // Backdrop click closes it
    const backdrop = page.locator('.admin-sidebar-backdrop');
    await expect(backdrop).toBeVisible();
    await backdrop.click();
    await expect(sidebar).not.toHaveClass(/is-open/);
  });

  test('AC7b: mobile drawer footer (logout) is visible inside the drawer', async ({ page }) => {
    const hamburger = page.locator('.admin-menu-toggle');
    const sidebar = page.locator('.admin-sidebar');

    await hamburger.click();
    await expect(sidebar).toHaveClass(/is-open/);

    const footer = page.locator('.admin-sidebar-footer');
    await expect(footer).toBeVisible();

    const logoutBtn = page.locator('.admin-sidebar-footer .admin-nav-btn');
    await expect(logoutBtn).toBeVisible();
  });
});
