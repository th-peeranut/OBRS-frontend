import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OBRS-1578 — the spend-by-payee screen, end to end against a real backend and a database this
 * lane builds (`e2e/fixtures/obrs-1578-payee-spend-fixture.sql`, all figures invented).
 *
 * Every assertion reads what the BROWSER RENDERED. That matters more than usual here, because the
 * two things this card exists for are both invisible to a mount check:
 *
 *   1. the report opens on EVERY year, so the payee whose only bill is in 2025 is on screen from
 *      the first paint — narrowing to 2026 is what removes it, and the screen says which it is;
 *   2. the bills with no payee on record are a ROW with a coverage line above it, not an omission.
 *
 * The frames it saves are the card's AFTER evidence. They are written only after the assertions
 * pass: a screenshot has no failure mode, so an unasserted one photographs whatever was there.
 */

const OWNER_EMAIL = 'owner@system.local';
const OWNER_PASSWORD = process.env['E2E_PASSWORD'] ?? 'P@ssw0rd';
const PAGE_PATH = '/admin/payee-spend-report';

/** This repo is public, so the evidence run points this at the private office captures folder. */
const EVIDENCE_DIR =
  process.env['OBRS_1578_EVIDENCE_DIR'] ?? path.join('test-results', 'obrs-1578');

/** What the fixture makes true. Written out so a silent fixture edit fails here rather than
 *  quietly re-baselining what the screen is supposed to say. */
const PAYEE_GLASS = 'ร้านทดสอบ กระจก';
const PAYEE_2025 = 'อู่ทดสอบ ข';
const PAYEE_TWO_BILLS = 'อู่ทดสอบ ก';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function openReport(page: Page): Promise<void> {
  await page.goto(PAGE_PATH);
  await page.locator('.payee-spend-table tbody tr').first().waitFor({ state: 'visible', timeout: 60_000 });
}

/** The dropdowns are `app-admin-dropdown`: a trigger button that opens a list of buttons. */
async function chooseFromDropdown(page: Page, index: number, optionText: string): Promise<void> {
  const dropdown = page.locator('app-admin-dropdown').nth(index);
  await dropdown.locator('.admin-dropdown-trigger').click();
  await dropdown.locator('.admin-dropdown-option', { hasText: optionText }).first().click();
  await page.waitForTimeout(500);
}

/**
 * `.report-fab` is the app-wide "รายงานปัญหา" button: `position: fixed; bottom: 24px; right: 24px`
 * from `report-usability-fab.component.scss`, on every admin page, with nothing anywhere in `src/`
 * reserving clearance for it. It therefore paints over the last table rows in a full-page capture,
 * including the grand total. Hiding it is a decision about the EVIDENCE, not about the screen --
 * the overlap is pre-existing global chrome, not something this card introduced, and it is called
 * out on the card so it is not quietly airbrushed away.
 */
async function hideGlobalChrome(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.report-fab { display: none !important; }' });
}

function save(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test.describe('OBRS-1578 spend by payee', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('opens on every year, with the 2025 payee present and the coverage gap stated', async ({
    page,
  }) => {
    await openReport(page);

    // 1. The window is stated in words. Without this the resting state shows the field NAMES and
    //    the reader is left to infer that nothing selected means everything.
    await expect(page.locator('.payee-spend-period')).toContainText('ทุกปี');

    // 2. The payee whose only bill is in 2025 is on screen, and it is not last.
    const names = await page.locator('.payee-spend-table tbody .payee-spend-name').allInnerTexts();
    expect(names[0]).toContain(PAYEE_GLASS);
    expect(names[1]).toContain(PAYEE_2025);

    // 3. AC2 — the bills with no payee are a row, and the banner says how much is missing.
    await expect(page.locator('.payee-spend-coverage')).toBeVisible();
    await expect(page.locator('.payee-spend-unassigned')).toHaveCount(1);

    // 4. The work column says what the money bought, and the job billed twice appears once.
    const work = await page
      .locator('.payee-spend-table tbody tr', { hasText: PAYEE_TWO_BILLS })
      .locator('.payee-spend-work')
      .innerText();
    expect(work).toContain('สายพาน');
    expect(work.match(/ถ่ายน้ำมันเครื่อง/g)?.length).toBe(1);

    await hideGlobalChrome(page);
    const dir = save(EVIDENCE_DIR);
    await page.screenshot({ path: path.join(dir, 'after-01-every-year.png'), fullPage: true });
  });

  test('the month control is inert until a year is chosen, and picking one drops the 2025 payee', async ({
    page,
  }) => {
    await openReport(page);

    // Inert first: "January of every year" is not a report this screen produces.
    const monthTrigger = page.locator('app-admin-dropdown').nth(1).locator('.admin-dropdown-trigger');
    await expect(monthTrigger).toBeDisabled();

    await chooseFromDropdown(page, 0, '2026');

    await expect(page.locator('.payee-spend-period')).toContainText('2026');
    await expect(monthTrigger).toBeEnabled();

    // The point of the default, made visible: this payee was on the previous frame.
    await expect(
      page.locator('.payee-spend-table tbody tr', { hasText: PAYEE_2025 })
    ).toHaveCount(0);

    await hideGlobalChrome(page);
    const dir = save(EVIDENCE_DIR);
    await page.screenshot({ path: path.join(dir, 'after-02-year-2026.png'), fullPage: true });
  });

  test('a month narrows within its year', async ({ page }) => {
    await openReport(page);
    await chooseFromDropdown(page, 0, '2026');
    await chooseFromDropdown(page, 1, 'สิงหาคม');

    await expect(page.locator('.payee-spend-period')).toContainText('สิงหาคม');
    await expect(
      page.locator('.payee-spend-table tbody tr', { hasText: PAYEE_GLASS })
    ).toHaveCount(1);

    await hideGlobalChrome(page);
    const dir = save(EVIDENCE_DIR);
    await page.screenshot({ path: path.join(dir, 'after-03-august-2026.png'), fullPage: true });
  });
});
