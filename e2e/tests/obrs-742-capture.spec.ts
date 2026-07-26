import { Page, expect, test } from '@playwright/test';

/**
 * OBRS-742 evidence capture — see playwright.obrs742.config.ts for how to run it.
 *
 * Unlike OBRS-722's capture, which had to stub its rows because nothing in the
 * product could WRITE an owner override yet, this one uses REAL data: OBRS-730
 * shipped `PUT/DELETE /api/private/owner/configs/booking-policy`, so a live
 * backend can now produce the very rows this card is about. The six rows below
 * are written by calling that endpoint as the seeded owner before the capture
 * runs (see the config header), and read back through the real admin history
 * endpoint — nothing here is a fixture asserting what we believe the backend
 * emits.
 *
 * BEFORE and AFTER differ by ONE variable: the tree being served on :4200. Same
 * backend, same database, same six rows, same login, same viewport, same
 * language.
 *
 * The row that matters is the oldest: `booking_max_advance_days` INSERT, the
 * owner's FIRST override, `oldValue = null`. BEFORE it reads "ถูกลบ -> 45",
 * telling the owner a value they had just created was deleted. AFTER it reads
 * "ยังไม่ได้ตั้งค่า -> 45". The two DELETE rows are in the same shot on purpose:
 * they must STILL say "ถูกลบ", or the fix would have traded one false statement
 * for another.
 */

const BASE = 'http://localhost:4200';
const ASSETS = 'e2e-evidence/OBRS-742';

const HISTORY_PATH = '/admin/settings/history';
const ADMIN_EMAIL = 'admin@system.local';

// Local-QA seed credential (OBRS-backend scripts/new-local-db.ps1 +
// seed-password.local.sql). Deliberately not a deployed environment's password:
// data.sql ships no hash, so this pairing cannot exist outside a local database.
const ADMIN_PASSWORD = process.env['OBRS742_ADMIN_PASSWORD'] ?? 'P@ssw0rd';

/** BEFORE (origin/dev) or AFTER (this branch) — set by the runner, never guessed. */
const PHASE = (process.env['OBRS742_PHASE'] ?? 'after').toLowerCase();

const ROW_COUNT = 6;
/** Newest first: DELETE, DELETE, UPDATE, UPDATE, INSERT, INSERT (see the config header). */
const FIRST_OVERRIDE_ROW = ROW_COUNT - 1;
const DELETE_ROW = 0;

async function login(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

/** The "จาก -> เป็น" cell of a row, as two trimmed strings. */
async function changeCell(page: Page, rowIndex: number): Promise<string[]> {
  const cell = page.locator('table.admin-table tbody tr').nth(rowIndex).locator('td.cch-change-cell');
  const texts = await cell.locator('span:not(.material-symbols-outlined)').allInnerTexts();
  return texts.map((t) => t.trim()).filter((t) => t.length > 0);
}

async function openHistory(page: Page): Promise<void> {
  await login(page);
  await page.goto(`${BASE}${HISTORY_PATH}`);

  // Assert the table is REAL before anything reads from it: a skeleton and an
  // empty table both photograph as "a table", and either would turn this
  // evidence into a picture of nothing.
  const rows = page.locator('table.admin-table tbody tr:not(.admin-skeleton-row):not(.admin-empty-row)');
  await expect(rows).toHaveCount(ROW_COUNT, { timeout: 30_000 });
  await expect(page.locator('.admin-error')).toHaveCount(0);
}

async function shoot(page: Page, file: string): Promise<void> {
  const card = page.locator('section.admin-card').first();
  const box = (await card.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(
    Math.ceil(box.y + box.height),
    `the card ends ${Math.ceil(box.y + box.height)}px down but the window is ${viewport.height}px tall. ` +
      'Grow the viewport — do NOT scroll: Playwright returns an over-tall element screenshot with the ' +
      'off-screen part unpainted white (OBRS-702).'
  ).toBeLessThanOrEqual(viewport.height);

  await card.screenshot({ path: `${ASSETS}/${file}` });
}

test('config history — the owner first override row', async ({ page }) => {
  test.skip(PHASE !== 'before' && PHASE !== 'after', `OBRS742_PHASE must be before|after, got "${PHASE}"`);
  await openHistory(page);

  const firstOverride = await changeCell(page, FIRST_OVERRIDE_ROW);
  const deleted = await changeCell(page, DELETE_ROW);

  if (PHASE === 'before') {
    // Photograph the defect, and assert it is really there — a BEFORE shot that
    // silently caught the FIXED tree would "prove" the fix changed nothing.
    expect(firstOverride, 'BEFORE must show the bug: the first override reads as a deletion').toEqual([
      'ถูกลบ',
      '45',
    ]);
    await shoot(page, 'before-insert-row-reads-as-deleted.png');
    return;
  }

  // AC2 — the owner's first override says it was never set, not that it was deleted.
  expect(firstOverride).toEqual(['ยังไม่ได้ตั้งค่า', '45']);
  expect(firstOverride).not.toContain('ถูกลบ');

  // AC3 — the DELETE row is untouched. Fixing one null must not relabel the
  // other. Newest row = `booking_offset_minutes` DELETE, 45 -> gone.
  expect(deleted).toEqual(['45', 'ถูกลบ']);

  // "ถูกลบ" survives on the page exactly where a value really was removed: the
  // two DELETE rows, and nowhere else.
  const allCells = await page
    .locator('table.admin-table tbody tr td.cch-change-cell')
    .allInnerTexts();
  expect(allCells.filter((text) => text.includes('ถูกลบ'))).toHaveLength(2);

  await shoot(page, 'after-insert-row-reads-as-unset.png');
});
