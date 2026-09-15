import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OBRS-1619 — the second screen (the bills behind one payee) and the CSV button, end to end
 * against a real backend and the database this lane builds.
 *
 * It reuses OBRS-1578's fixture unchanged (`e2e/fixtures/obrs-1578-payee-spend-fixture.sql`, all
 * figures invented) on purpose: this card adds two ways of reading the SAME numbers, and the only
 * claim worth photographing is that the drill-down and the file still agree with the report. A
 * fixture of its own would have made that agreement untestable.
 *
 * Every assertion reads what the BROWSER RENDERED, and the frames are written only after the
 * assertions pass — a screenshot has no failure mode, so an unasserted one photographs whatever
 * happened to be there.
 */

const OWNER_EMAIL = 'owner@system.local';
const OWNER_PASSWORD = process.env['E2E_PASSWORD'] ?? 'P@ssw0rd';
const PAGE_PATH = '/admin/payee-spend-report';

/** This repo is public, so the evidence run points this at the private office captures folder. */
const EVIDENCE_DIR =
  process.env['OBRS_1619_EVIDENCE_DIR'] ?? path.join('test-results', 'obrs-1619');

/** What OBRS-1578's fixture makes true. Spelled out so a silent fixture edit fails here rather
 *  than quietly re-baselining what these screens are supposed to say. */
const PAYEE_GLASS = 'ร้านทดสอบ กระจก';
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
  await page
    .locator('.payee-spend-table tbody tr')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
}

async function chooseFromDropdown(page: Page, index: number, optionText: string): Promise<void> {
  const dropdown = page.locator('app-admin-dropdown').nth(index);
  await dropdown.locator('.admin-dropdown-trigger').click();
  await dropdown.locator('.admin-dropdown-option', { hasText: optionText }).first().click();
  await page.waitForTimeout(500);
}

/** See the same helper on OBRS-1578's spec: kept so the frames on the two cards stay comparable. */
async function hideGlobalChrome(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.report-trigger { display: none !important; }' });
}

function save(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test.describe('OBRS-1619 payee drill-down and CSV', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('AC1: a payee row opens its own bills, and they add up to the line that opened them', async ({
    page,
  }) => {
    await openReport(page);

    const line = page.locator('.payee-spend-table tbody tr', { hasText: PAYEE_TWO_BILLS });
    const lineTotal = (await line.locator('td').last().innerText()).trim();
    const lineBills = (await line.locator('td').nth(2).innerText()).trim();

    await line.locator('.payee-spend-drill').click();

    const panel = page.locator('.payee-spend-bills');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.payee-spend-bills-table tbody tr')).toHaveCount(Number(lineBills));
    // The claim the whole card rests on: two screens, two queries, one number.
    await expect(panel.locator('tfoot td').last()).toHaveText(lineTotal);

    await hideGlobalChrome(page);
    const dir = save(EVIDENCE_DIR);
    await page.screenshot({ path: path.join(dir, 'after-01-bills-for-one-payee.png'), fullPage: true });
  });

  test('AC1: the unassigned row drills down too, and the filter travels with it', async ({
    page,
  }) => {
    await openReport(page);

    // The last bullet of AC1: the row with no payee on record is not a dead end.
    await page.locator('.payee-spend-unassigned .payee-spend-drill').click();
    await expect(page.locator('.payee-spend-bills')).toBeVisible();

    await hideGlobalChrome(page);
    const dir = save(EVIDENCE_DIR);
    await page.screenshot({ path: path.join(dir, 'after-02-unassigned-bills.png'), fullPage: true });

    // Changing the window closes the panel rather than leaving last window's bills under it.
    await chooseFromDropdown(page, 0, '2026');
    await expect(page.locator('.payee-spend-bills')).toHaveCount(0);

    // And re-opening under the narrowed window shows that window's bills.
    await page.locator('.payee-spend-table tbody tr', { hasText: PAYEE_GLASS })
      .locator('.payee-spend-drill')
      .click();
    await expect(page.locator('.payee-spend-bills')).toBeVisible();

    await hideGlobalChrome(page);
    await page.screenshot({ path: path.join(dir, 'after-03-bills-under-2026.png'), fullPage: true });
  });

  test('AC2: the CSV button downloads the filtered report, readable as UTF-8 with a BOM', async ({
    page,
  }) => {
    await openReport(page);
    await chooseFromDropdown(page, 0, '2026');

    await hideGlobalChrome(page);
    const dir = save(EVIDENCE_DIR);
    await page.screenshot({ path: path.join(dir, 'after-04-export-button.png'), fullPage: true });

    // The selectors and the ordering below are OBRS-884's, verbatim, because this is the same
    // control. A first draft of this test guessed `.p-menuitem-link` — the PrimeNG 17 class — and
    // waited 60 s for a download that was never requested, because the menu item it was going to
    // click does not exist under that name in PrimeNG 21.
    await page.locator('app-export-button .export-button-trigger').first().click();
    const csvItem = page.locator('.p-menu-item-label', { hasText: 'CSV' }).first();
    await expect(csvItem).toBeVisible();

    // Viewport-only, NOT fullPage: a fullPage screenshot scrolls the document and a PrimeNG popup
    // menu closes on scroll, so the click below would land on a menu that is no longer there.
    await page.screenshot({ path: path.join(dir, 'after-05-export-menu.png') });

    const [download] = await Promise.all([page.waitForEvent('download'), csvItem.click()]);

    const saved = path.join(dir, 'obrs-1619-payee-spend.csv');
    await download.saveAs(saved);
    const bytes = fs.readFileSync(saved);

    // AC2's third bullet, asserted on the BYTES: without this prefix Excel on a Thai Windows reads
    // the file as windows-874 and every payee name in it becomes mojibake.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const text = bytes.toString('utf8');
    // AC2's first bullet: the file is the screen, under the filter it was pressed with.
    expect(text).toContain('2026');
    // AC2's second bullet: the row with no payee on record is IN the file.
    expect(text).toContain('ยังไม่ระบุผู้รับเงิน');
  });
});
