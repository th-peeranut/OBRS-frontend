import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-722 evidence capture — see playwright.obrs722.config.ts for how to run it
 * (two hand-started servers, no backend).
 *
 * BEFORE and AFTER differ by ONE variable: the tree being served. Same viewport,
 * same synthetic session, same four rows, same language.
 *
 * The four rows are chosen to make the defect visible rather than to look
 * plausible. They are all changes to the SAME config key, and BEFORE they render
 * as four indistinguishable lines — which is the bug: one of them moved the
 * default every non-overriding owner inherits, and three changed one owner's
 * private copy. AFTER, the ขอบเขต column says which, including the row whose
 * owner has been deleted (the AC's "never leave it blank" case).
 *
 * Every shot asserts what it is supposed to show BEFORE shooting. A capture that
 * silently caught a spinner, an empty table or a LOAD_FAILED banner is worse than
 * no capture: it looks like proof.
 */

const BEFORE = 'http://localhost:4722';
const AFTER = 'http://localhost:4723';
const ASSETS = 'e2e-evidence/OBRS-722';

const HISTORY_PATH = '/admin/settings/history';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/**
 * `scope`/`ownerName` are present in BOTH runs' fixture on purpose. The BEFORE
 * tree simply has no interface field, no column and no mapper for them, so it
 * ignores them — which makes the comparison strictly "what this branch renders",
 * never "the BEFORE run was fed less data".
 */
const HISTORY_ROWS = [
  {
    id: 4,
    configKey: 'cancel_window_hours',
    operation: 'DELETE',
    changedAt: '2026-07-26T16:02:38.401+07:00',
    oldValue: 12,
    newValue: null,
    actorSource: 'UNATTRIBUTED',
    actorName: null,
    actorRole: null,
    // The AC's "never leave it blank" case: an owner-scoped row whose owner row
    // is gone (owner_id has no FK, V50). It must NOT read as the platform
    // default — that would claim a one-owner change hit everybody.
    scope: 'OWNER',
    ownerName: null,
  },
  {
    id: 3,
    configKey: 'cancel_window_hours',
    operation: 'UPDATE',
    changedAt: '2026-07-26T14:20:03.114+07:00',
    oldValue: 24,
    newValue: 12,
    actorSource: 'USER',
    actorName: 'มาลี ศรีสุข',
    actorRole: 'owner',
    scope: 'OWNER',
    ownerName: 'มาลี ศรีสุข',
  },
  {
    id: 2,
    configKey: 'cancel_window_hours',
    operation: 'UPDATE',
    changedAt: '2026-07-26T11:05:47.902+07:00',
    oldValue: 24,
    newValue: 6,
    actorSource: 'USER',
    actorName: 'สมชาย ใจดี',
    actorRole: 'admin',
    // An admin editing SOMEONE ELSE's override — the combination that proves
    // ผู้แก้ไข and ขอบเขต cannot be collapsed into one column.
    scope: 'OWNER',
    ownerName: 'ประเสริฐ ทองดี',
  },
  {
    id: 1,
    configKey: 'cancel_window_hours',
    operation: 'UPDATE',
    changedAt: '2026-07-26T09:41:12.556+07:00',
    oldValue: 48,
    newValue: 24,
    actorSource: 'USER',
    actorName: 'สมชาย ใจดี',
    actorRole: 'admin',
    scope: 'PLATFORM',
    ownerName: null,
  },
];

async function stubHistory(page: Page): Promise<void> {
  await page.route('**/private/admin/configs/history**', (route) =>
    route.fulfill(
      ok({
        content: HISTORY_ROWS,
        totalElements: HISTORY_ROWS.length,
        totalPages: 1,
        number: 0,
        size: 20,
        numberOfElements: HISTORY_ROWS.length,
        first: true,
        last: true,
      })
    )
  );
}

async function openHistory(page: Page, origin: string): Promise<void> {
  await seedGateAdminSession(page, {
    username: 'admin@system.local',
    roles: ['admin'],
    language: 'th',
  });
  await stubHistory(page);
  await page.goto(`${origin}${HISTORY_PATH}`);
}

const historyCard = (page: Page) => page.locator('section.admin-card').first();

/**
 * Shoots the history card once the table is real. The row count is asserted, not
 * hoped for: an empty table and a loading skeleton both photograph as "a table",
 * and an empty one would silently turn this evidence into a picture of nothing.
 */
async function shootHistory(page: Page, file: string): Promise<void> {
  const rows = page.locator('table.admin-table tbody tr:not(.admin-skeleton-row):not(.admin-empty-row)');
  await expect(rows).toHaveCount(HISTORY_ROWS.length, { timeout: 30_000 });
  await expect(page.locator('.admin-error, .admin-muted:not(td .admin-muted):not(span)')).toHaveCount(0);

  const card = historyCard(page);
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

test('BEFORE - four rows, no way to tell a platform change from one owner-s override', async ({ page }) => {
  await openHistory(page, BEFORE);

  const headers = await page.locator('table.admin-table thead th').allInnerTexts();
  expect(headers, 'the BEFORE tree must not already have the scope column').toHaveLength(4);

  await shootHistory(page, 'before-config-history-no-scope.png');
});

test('AFTER - the same four rows, now separated by ขอบเขต', async ({ page }) => {
  await openHistory(page, AFTER);

  const headers = await page.locator('table.admin-table thead th').allInnerTexts();
  expect(headers, 'the scope column must be present').toHaveLength(5);
  expect(headers[2]).toBe('ขอบเขต');

  // Assert the EFFECT, not that a column exists: rows that were indistinguishable
  // must now read as three DIFFERENT scopes, which is the entire claim of this card.
  const scopeCells = await page.locator('table.admin-table tbody tr td:nth-child(3)').allInnerTexts();
  const scopes = scopeCells.map((text) => text.trim());
  expect(scopes).toEqual([
    'เจ้าของที่ถูกลบแล้ว',
    'เจ้าของ: มาลี ศรีสุข',
    'เจ้าของ: ประเสริฐ ทองดี',
    'ค่ากลาง (ทั้งระบบ)',
  ]);
  expect(scopes.every((text) => text.length > 0), 'no scope cell may be blank').toBe(true);

  await shootHistory(page, 'after-config-history-scope-column.png');
});
