import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OBRS-884 — the per-vehicle P&L screen, end to end against a real backend and a database
 * this lane builds (`e2e/fixtures/obrs-884-pl-fixture.sql`, all figures invented).
 *
 * Every assertion below reads what the BROWSER RENDERED, never a component's state: the
 * card's own "ตรวจยังไง" says to assert the value on screen rather than that something was
 * mounted, and a screen whose whole purpose is distinguishing three ฿0s from each other is
 * exactly the kind that passes a mount check while showing the wrong thing.
 *
 * The three states are in ONE period, two of them off data.sql's real fleet and one built by
 * the fixture (OBRS-1526 — the census filled every real plate's window in):
 *   16-8829  in_service 2026-01-30..2026-06-17  -> IN_SERVICE, no caveat
 *   16-0884  fixture-owned, in_service_from NULL -> SERVICE_WINDOW_UNKNOWN
 *   16-9535  in_service_from 2026-07-10         -> OUTSIDE_SERVICE_WINDOW, with June money
 *
 * The last test is the one AC 4 actually asks for: it DOWNLOADS the export from the same
 * backend the screen just read and compares the file's figures to the DOM's, cell by cell.
 * `VehiclePlExportParityIT` proves the file matches the SERVICE; only this proves it
 * matches the SCREEN.
 */

const OWNER_EMAIL = 'owner@system.local';
const OWNER_PASSWORD = process.env['E2E_PASSWORD'] ?? 'P@ssw0rd';
const PAGE_PATH = '/admin/vehicle-pl-report';
const FROM = '01/06/2026';
const TO = '30/06/2026';
// Inside the repo's own (gitignored) results folder by default; the evidence run points
// OBRS_884_EVIDENCE_DIR at the private office captures folder instead. This repo is
// public, so no local path of the owner's belongs in it.
const EVIDENCE_DIR = process.env['OBRS_884_EVIDENCE_DIR'] ?? path.join('test-results', 'obrs-884');

/** What the fixture makes true for June 2026. Written out so a silent fixture edit
 *  fails here rather than quietly re-baselining what the screen is supposed to say. */
const EXPECTED = {
  totals: { revenue: '32,900.00', expenses: '26,800.00', vat: '770.00', margin: '6,100.00', pending: '750.00' },
  central: '2,400.00',
};

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

/** `fill()` sets the input value without the keystrokes PrimeNG's date parser listens for,
 *  so the model never changes and the page silently keeps its default month. */
async function openJune2026(page: Page): Promise<void> {
  await page.goto(PAGE_PATH);
  const inputs = page.locator('.admin-page-filters input');
  await inputs.first().waitFor({ state: 'visible', timeout: 30_000 });
  for (const [index, value] of [[0, FROM], [1, TO]] as const) {
    const input = inputs.nth(index);
    await input.click();
    await input.press('Control+A');
    await input.pressSequentially(value, { delay: 20 });
    await input.press('Enter');
    await page.keyboard.press('Escape');
  }
  await expect(inputs.nth(0)).toHaveValue(FROM);
  await expect(inputs.nth(1)).toHaveValue(TO);
  // The table has re-fetched when the row this fixture guarantees is on screen.
  await expect(rowFor(page, '8829')).toBeVisible({ timeout: 30_000 });
}

function rowFor(page: Page, plateFragment: string) {
  return page
    .locator('table.admin-table tbody tr:not(.vehicle-pl-detail-row)')
    .filter({ hasText: plateFragment })
    .first();
}

/** The rendered cells of one vehicle row: [vehicle, revenue, expenses, vat, margin]. */
async function cellsOf(page: Page, plateFragment: string): Promise<string[]> {
  return (await rowFor(page, plateFragment).locator('td').allInnerTexts()).map((cell) =>
    cell.replace(/ /g, ' ').trim()
  );
}

test.describe('OBRS-884 per-vehicle P&L', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openJune2026(page);
  });

  test('a ฿0 always says WHICH ฿0 it is, and a real figure says nothing extra', async ({ page }) => {
    // Earned and spent: no caveat anywhere on the row.
    const earner = await cellsOf(page, '8829');
    expect(earner[1]).toContain('28,000.00');
    expect(earner[2]).toContain('9,700.00');
    expect(await rowFor(page, '8829').locator('.vehicle-pl-zero-reason').count()).toBe(0);
    expect(await rowFor(page, '8829').locator('.vehicle-pl-badge').count()).toBe(0);

    // Spent, no round recorded: revenue ฿0 says only that, cost is real.
    const parked = await cellsOf(page, '8747');
    expect(parked[1]).toContain('0.00');
    expect(parked[1]).toContain('ไม่มีรอบที่บันทึกไว้ในช่วงนี้');
    expect(parked[2]).toContain('600.00');

    // Neither ran nor spent: BOTH zeros carry their own, different reason.
    const idle = await cellsOf(page, '2733');
    expect(idle[1]).toContain('ไม่มีรอบที่บันทึกไว้ในช่วงนี้');
    expect(idle[2]).toContain('ยังไม่มีใครบันทึกรายจ่าย');

    // The service window is the third source of ambiguity and gets its own badge. OBRS-1526:
    // this row is 16-0884, a vehicle the fixture owns, because OBRS-886's census gave all seven
    // real plates a date and the fixture cannot take one back (see the note in the fixture).
    await expect(rowFor(page, '0884').locator('.vehicle-pl-badge')).toHaveText(
      /ไม่ทราบช่วงให้บริการ/
    );
    await expect(rowFor(page, '9535').locator('.vehicle-pl-badge')).toHaveText(
      /อยู่นอกช่วงให้บริการ/
    );
    // ...and 16-8829's window is KNOWN and covers June, so it gets none - which is what
    // makes the two badges above mean something.
    await expect(rowFor(page, '8829').locator('.vehicle-pl-badge')).toHaveCount(0);

    // A loss is coloured, not left for the reader to spot the minus sign.
    await expect(rowFor(page, '9310').locator('.vehicle-pl-negative')).toHaveCount(1);
    await expect(rowFor(page, '8829').locator('.vehicle-pl-negative')).toHaveCount(0);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'OBRS-884-AFTER-6-ownDb-three-zeros.png'),
      fullPage: true,
    });
  });

  test('the central line is its own line, and the margin excludes the unruled costs', async ({ page }) => {
    const asides = page.locator('.vehicle-pl-aside');
    await expect(asides).toHaveCount(2);
    // An attribution gap with nothing in it says so, rather than showing ฿0 as if it were
    // an amount somebody recorded.
    await expect(asides.nth(0)).toContainText('ไม่มีในช่วงนี้');
    await expect(asides.nth(1)).toContainText(EXPECTED.central);

    // The central cost is NOT on any vehicle row: the fleet's own costs sum to the company
    // total minus exactly that line. This goes red both if the line vanishes and if it is
    // averaged down onto the buses.
    const vehicleExpenses = await page
      .locator('table.admin-table tbody tr:not(.vehicle-pl-detail-row) td:nth-child(3)')
      .allInnerTexts();
    const fleetTotal = vehicleExpenses.reduce((sum, cell) => sum + money(cell), 0);
    expect(fleetTotal).toBeCloseTo(money(EXPECTED.totals.expenses) - money(EXPECTED.central), 2);

    const kpis = (await page.locator('.admin-kpi').allInnerTexts()).map((t) =>
      t.replace(/ /g, ' ')
    );
    expect(kpis[0]).toContain(EXPECTED.totals.revenue);
    expect(kpis[1]).toContain(EXPECTED.totals.expenses);
    expect(kpis[1]).toContain(EXPECTED.totals.vat);
    expect(kpis[2]).toContain(EXPECTED.totals.margin);
    // OBRS-1356: shown, and deliberately OUTSIDE the margin - margin is exactly
    // revenue - expenses, with the ฿750 pending cost nowhere in it.
    expect(kpis[3]).toContain(EXPECTED.totals.pending);
    expect(money(EXPECTED.totals.margin)).toBeCloseTo(
      money(EXPECTED.totals.revenue) - money(EXPECTED.totals.expenses),
      2
    );

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'OBRS-884-AFTER-7-ownDb-central-and-pending.png'),
      fullPage: true,
    });
  });

  test('the exported CSV carries the same numbers the screen is showing', async ({ page }) => {
    const onScreen = new Map<string, string[]>();
    for (const plate of ['8829', '9310', '9535', '8747']) {
      onScreen.set(plate, await cellsOf(page, plate));
    }

    await page.locator('app-export-button .export-button-trigger').first().click();
    const csvItem = page.locator('.p-menu-item-label', { hasText: 'CSV' }).first();
    await expect(csvItem).toBeVisible();
    // Viewport-only, NOT fullPage: a fullPage screenshot scrolls the document and a
    // PrimeNG popup menu closes on scroll, so the click below would land on a menu that is
    // no longer there and no export request would ever be made.
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'OBRS-884-AFTER-8-ownDb-export-menu.png'),
    });

    const [download] = await Promise.all([page.waitForEvent('download'), csvItem.click()]);
    const saved = path.join(EVIDENCE_DIR, 'OBRS-884-export-sample.csv');
    await download.saveAs(saved);
    const rows = parseCsv(fs.readFileSync(saved, 'utf8'));

    // Thai, like every other assertion in this file: the export's labels come from
    // messages_th.properties via the browser's own Accept-Language, and this app runs in
    // Thai for its owner. Asserting English here would only pass on a machine whose
    // browser asks for it.
    // The preamble carries the report-level scalars; the header row is found, not assumed.
    const headerIndex = rows.findIndex((r) => r[0] === 'ชนิดแถว');
    expect(headerIndex).toBeGreaterThan(0);
    const preamble = new Map(rows.slice(0, headerIndex).filter((r) => r.length >= 2).map((r) => [r[0], r[1]]));
    expect(money(preamble.get('รายได้รวม')!)).toBeCloseTo(money(EXPECTED.totals.revenue), 2);
    expect(money(preamble.get('รายจ่ายรวม')!)).toBeCloseTo(money(EXPECTED.totals.expenses), 2);
    expect(money(preamble.get('กำไรขั้นต้น')!)).toBeCloseTo(money(EXPECTED.totals.margin), 2);
    expect(money(preamble.get('รายจ่ายรออนุมัติ (ยังไม่หักในกำไร)')!)).toBeCloseTo(
      money(EXPECTED.totals.pending),
      2
    );
    expect(preamble.get('ยอดรวม VAT แล้ว')).toBe('true');

    const header = rows[headerIndex];
    const col = (name: string) => {
      const index = header.indexOf(name);
      expect(index, `column "${name}" is missing from the export`).toBeGreaterThanOrEqual(0);
      return index;
    };
    const dataRows = rows.slice(headerIndex + 1).filter((r) => r.length === header.length);

    for (const [plate, cells] of onScreen) {
      const fileRow = dataRows.find((r) => (r[col('ทะเบียนรถ')] ?? '').includes(plate));
      expect(fileRow, `plate ${plate} is on screen but not in the file`).toBeTruthy();
      expect(money(fileRow![col('รายได้')])).toBeCloseTo(money(cells[1]), 2);
      expect(money(fileRow![col('รายจ่ายรวม')])).toBeCloseTo(money(cells[2]), 2);
      expect(money(fileRow![col('VAT ที่อยู่ในรายจ่าย')])).toBeCloseTo(money(cells[3]), 2);
      expect(money(fileRow![col('กำไรขั้นต้น')])).toBeCloseTo(money(cells[4]), 2);
    }

    // The central line is a ROW in the file, which is what lets a plain column sum over it
    // reconcile to the preamble's company total.
    expect(dataRows.some((r) => r[col('ชนิดแถว')] === 'CENTRAL_EXPENSE')).toBe(true);
    const summedExpenses = dataRows.reduce((sum, r) => sum + money(r[col('รายจ่ายรวม')]), 0);
    expect(summedExpenses).toBeCloseTo(money(EXPECTED.totals.expenses), 2);

    // A category nobody spent on in June gets no column at all - an empty column would read
    // as a real ฿0 for every bus in the fleet.
    expect(header).toContain('น้ำมัน');
    expect(header).toContain('ค่างวดรถ');
    expect(header).not.toContain('ยาง');
  });
});

/** The leading currency code and the thousands separators are presentation; the number is
 *  what is being compared. `-` and `.` survive. */
function money(text: string): number {
  const normalised = text.replace(/ /g, ' ').replace(/THB\s*/g, '');
  const match = normalised.match(/-?[\d,]+\.\d{2}/);
  if (!match) {
    // NOT NaN: a silent NaN propagates through a sum and reports as "expected X, received
    // NaN", which says nothing about WHICH cell was wrong (measured -- it cost a whole run).
    throw new Error('no money value in ' + JSON.stringify(text));
  }
  return Number(match[0].replace(/,/g, ''));
}

/** Minimal RFC-4180 reader — the export quotes any cell containing a comma (several
 *  category labels do), so splitting on ',' would be testing my splitter, not the file. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
