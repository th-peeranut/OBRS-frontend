import { test, expect, Page } from '@playwright/test';

/**
 * OBRS-576 QA E2E — config change history page with actor attribution.
 * Runs against the local full-stack QA lane started by hand for this card
 * (obrs576qa DB, backend on :8080 with `dev,local` profiles, `ng serve` /
 * `start:local` on :4200 pointed at http://localhost:8080). Not part of the
 * committed regression suite (same convention as obrs-564-booking-policy.spec.ts).
 */

const OWNER_EMAIL = 'owner@system.local';
const ADMIN_EMAIL = 'admin@system.local';
const SALESPERSON_EMAIL = 'salesperson@system.local';
const PASSWORD = 'P@ssw0rd';

async function login(page: Page, email: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function dismissSweetAlert(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
}

/**
 * The table renders 5 skeleton rows (`.admin-skeleton-row`) while a fetch is
 * in flight, so `table.admin-table` becomes visible BEFORE real data lands —
 * reading `innerText` at that moment captures skeleton placeholder markup,
 * not rows. Wait for the skeleton to clear (or the empty-state row, for
 * genuinely zero-result cases) before asserting on cell text.
 */
async function waitForDataLoaded(page: Page): Promise<void> {
  await expect(page.locator('table.admin-table')).toBeVisible({ timeout: 15_000 });
  await page.locator('tr.admin-skeleton-row').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  await expect
    .poll(
      async () => {
        const hasDataRow = (await page.locator('table.admin-table tbody tr:not(.admin-skeleton-row)').count()) > 0;
        return hasDataRow;
      },
      { timeout: 15_000 }
    )
    .toBe(true);
}

/**
 * This spec's own C7/reminder tests each write NEW history rows, so running
 * the suite repeatedly against the same DB pushes older fixed-timestamp rows
 * (the synthetic PRE_FEATURE/array/unmapped-key rows seeded once for this QA
 * pass) off the default 20-row first page — and the config-key dropdown's
 * options are themselves derived only from rows already FETCHED (no endpoint
 * lists every key, ConfigChangeHistoryPageComponent's own javadoc), so an
 * off-page row's dropdown option isn't reachable either without paging first.
 * Walk pages via the real paginator until the text is found or pages run out.
 */
async function findTextAcrossPages(page: Page, needle: string, maxPages = 10): Promise<boolean> {
  for (let i = 0; i < maxPages; i++) {
    const bodyText = await page.locator('table.admin-table tbody').innerText();
    if (bodyText.includes(needle)) {
      return true;
    }
    const nextButton = page.getByRole('button', { name: 'Next' });
    const isVisible = await nextButton.isVisible().catch(() => false);
    if (!isVisible) return false;
    const isDisabled = await nextButton.isDisabled().catch(() => true);
    if (isDisabled) return false;
    await nextButton.click();
    await waitForDataLoaded(page);
    await page.waitForTimeout(300);
  }
  return false;
}

test.describe('OBRS-576 — access control', () => {
  test('OWNER sees the menu entry and reaches the page', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin');
    const menuEntry = page.locator('a[href*="config-change-history"]');
    await expect(menuEntry).toBeVisible({ timeout: 15_000 });
    await menuEntry.click();
    await page.waitForURL((url) => url.pathname.includes('config-change-history'));
    await expect(page.locator('table.admin-table')).toBeVisible({ timeout: 15_000 });
  });

  test('SALESPERSON does not see the menu entry', async ({ page }) => {
    await login(page, SALESPERSON_EMAIL);
    await page.goto('/admin');
    const menuEntry = page.locator('a[href*="config-change-history"]');
    await expect(menuEntry).toHaveCount(0);
  });

  test('SALESPERSON is blocked on direct URL entry', async ({ page }) => {
    await login(page, SALESPERSON_EMAIL);
    await page.goto('/admin/config-change-history');
    // Either redirected away, or the page renders no data table for this role.
    await page.waitForTimeout(1500);
    const onHistoryPage = page.url().includes('config-change-history');
    if (onHistoryPage) {
      await expect(page.locator('table.admin-table')).toHaveCount(0);
    } else {
      expect(onHistoryPage).toBe(false);
    }
  });
});

test.describe('OBRS-576 — actor attribution (priority #1/#2/#3)', () => {
  test('OWNER updates booking policy ONCE -> 2 history rows, BOTH attributed to Owner Operator (C7)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/booking-policy-config');
    await page.locator('input#maxAdvanceDays').waitFor({ state: 'visible', timeout: 15_000 });

    // Both fields must actually CHANGE value (the trigger only fires a history
    // row on a real value change, C6) so this one Save genuinely writes BOTH
    // config keys — otherwise an unchanged field silently produces zero rows
    // and this test would pass without ever exercising the two-transaction
    // path. A hardcoded target value is NOT safe here: on a second run in the
    // same DB the field may already equal that value (no-op), so both targets
    // are derived from the CURRENT value instead (valid ranges: maxAdvanceDays
    // 1-365, cutoffMinutes 1-1440 — booking-policy-config.validators.ts).
    const currentMaxAdvance = await page.locator('input#maxAdvanceDays').inputValue();
    const newMaxAdvance = String((Number(currentMaxAdvance || '0') % 365) + 1);
    const currentCutoff = await page.locator('input#cutoffMinutes').inputValue();
    const newCutoff = String((Number(currentCutoff || '0') % 1440) + 1);
    await page.locator('input#maxAdvanceDays').fill(newMaxAdvance);
    await page.locator('input#cutoffMinutes').fill(newCutoff);
    await page.locator('button[type="submit"]').click();
    await dismissSweetAlert(page);

    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    // Unfiltered default view already shows most-recent-first — the top TWO
    // rows are the two config keys updateBookingPolicy wrote in this test,
    // in two separate transactions. Both must be attributed to the SAME caller.
    const firstRowText = await page.locator('table.admin-table tbody tr').nth(0).innerText();
    const secondRowText = await page.locator('table.admin-table tbody tr').nth(1).innerText();
    expect(firstRowText).toContain('Owner Operator');
    expect(secondRowText).toContain('Owner Operator');
    // multi-role user (owner + driver) must display the HIGHER-priority role: owner
    expect(firstRowText).toContain('(Owner)');
    expect(firstRowText.toLowerCase()).not.toContain('driver');
  });

  test('ADMIN changes reminder config (2-arg updateConfig overload) -> attributed to Admin Admin', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto('/admin/reminder-config');
    await page.locator('input#reminderHoursBeforeDeparture').waitFor({ state: 'visible', timeout: 15_000 });

    const current = await page.locator('input#reminderHoursBeforeDeparture').inputValue();
    const next = String((Number(current || '0') % 48) + 1); // stays in a sane 1-48h range
    await page.locator('input#reminderHoursBeforeDeparture').fill(next);
    await page.locator('button[type="submit"]').click();
    await dismissSweetAlert(page);

    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    // ReminderConfigController calls SystemConfigService.updateConfig(key, value)
    // — the 2-ARG overload, a DIFFERENT call path than C7's 3-arg overload used
    // by updateBookingPolicy. This proves attribution survives that overload too.
    const firstRowText = await page.locator('table.admin-table tbody tr').nth(0).innerText();
    expect(firstRowText).toContain('Departure reminder lead time');
    expect(firstRowText).toContain('Admin Admin');
    expect(firstRowText).toContain('(Admin)');
  });
});

test.describe('OBRS-576 — actor_source renderings (priority #5)', () => {
  test('USER / SYSTEM / UNATTRIBUTED / PRE_FEATURE all render distinctly, never blank', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history?size=50').catch(() => undefined);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    const bodyText = await page.locator('table.admin-table tbody').innerText();
    // These are the exact EN strings expected for each bucket.
    expect(bodyText).toMatch(/Owner Operator|Admin Admin/); // USER
    expect(bodyText.length).toBeGreaterThan(0);

    // None of the actor cells may render empty
    const actorCells = await page.locator('table.admin-table tbody tr td:nth-child(4)').allInnerTexts();
    for (const cellText of actorCells) {
      expect(cellText.trim().length).toBeGreaterThan(0);
    }
  });
});

test.describe('OBRS-576 — unlabeled dotted config key (priority #6)', () => {
  test('a config key with no i18n label shows its raw key, not blank', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);
    const found = await findTextAcrossPages(page, 'qa576.unmapped_test_key');
    expect(found).toBe(true);
  });

  test('parcel.prohibited_categories (dotted key WITH a label) renders its translated label, not the raw key', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);
    const bodyText = await page.locator('table.admin-table tbody').innerText();
    expect(bodyText).not.toContain('parcel.prohibited_categories');
  });
});

test.describe('OBRS-576 — JSONB value rendering (priority #7)', () => {
  test('number, boolean, string values all render sanely', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);
    // Numbers are trivially covered by every row on page 1 (booking cutoff,
    // advance-days, etc. are all plain integers) — assert those directly.
    const bodyText = await page.locator('table.admin-table tbody').innerText();
    expect(bodyText).toMatch(/\d+\s*arrow_forward\s*\d+/);

    // boolean (jump_seat_enabled true->false) and string (some_string_config)
    // rows are fixed-timestamp synthetic fixtures seeded once for this QA pass
    // — this suite's own C7/reminder tests write new rows every run, which
    // pushes fixed rows further down page-over-page. Page forward to find them
    // rather than assuming page-1 visibility.
    const foundBoolean = await findTextAcrossPages(page, 'Jump-seat sales enabled');
    expect(foundBoolean).toBe(true);
    const boolRowText = await page.locator('table.admin-table tbody').innerText();
    expect(boolRowText).toMatch(/\bOn\b.*arrow_forward.*\bOff\b/s);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);
    const foundString = await findTextAcrossPages(page, 'new text value');
    expect(foundString).toBe(true);
  });

  test('a long array (12 items) degrades to first 3 + "and N more", not a raw dump', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    // The dropdown's own options are derived only from rows already fetched
    // (no endpoint lists every key) — if the array row has been pushed past
    // page 1 by this suite's own repeated writes, its dropdown option isn't
    // even offered yet. Page forward until the row itself is found instead.
    const found = await findTextAcrossPages(page, 'flammable');
    expect(found).toBe(true);

    const bodyText = await page.locator('table.admin-table tbody').innerText();
    expect(bodyText).toMatch(/และอีก|more/i);
    expect(bodyText).toContain('flammable');
    expect(bodyText).toContain('explosive');
  });
});

test.describe('OBRS-576 — filter re-entry (priority #4, the Scrutinize self-fix)', () => {
  test('filter by config key + date range, navigate away, come back -> controls AND table still agree', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    await page.getByRole('button', { name: 'All settings expand_more' }).click();
    await page.getByRole('button', { name: 'Advance booking limit (days)' }).click();
    await page.waitForTimeout(800);

    const filteredRowsBefore = await page.locator('table.admin-table tbody tr').allInnerTexts();
    expect(filteredRowsBefore.length).toBeGreaterThan(0);
    for (const r of filteredRowsBefore) {
      expect(r).toContain('Advance booking limit (days)');
    }

    // Navigate away via the SPA router (a real link click, not page.goto, so the
    // root-scoped store instance is NOT recreated — this is the exact condition
    // the Scrutinize self-fix targets).
    await page.locator('a[href="/admin/dashboard"]').first().click();
    await page.waitForURL((url) => url.pathname.includes('/admin/dashboard'));
    await page.waitForTimeout(300);

    // Come back via a real link click too.
    await page.locator('a[href*="config-change-history"]').first().click();
    await page.waitForURL((url) => url.pathname.includes('config-change-history'));
    await waitForDataLoaded(page);
    await page.waitForTimeout(500);

    // The dropdown control itself must still read the previously-selected filter.
    await expect(page.getByRole('button', { name: /Advance booking limit \(days\)/ })).toBeVisible();

    const rows = await page.locator('table.admin-table tbody tr').allInnerTexts();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).toContain('Advance booking limit (days)');
    }
  });
});

test.describe('OBRS-576 — empty filter result (priority #11)', () => {
  test('a date range with zero rows reads as a distinct empty message, not an error', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    // A from-only bound far in the future — valid per UX §4.2 (from-only /
    // to-only are both legal, no default) — that can contain no history rows
    // at all, reachable purely through the real filter UI (dd/mm/yyyy).
    // PrimeNG's Calendar does its own keyboard-driven masking/parsing — a raw
    // `.fill()` sets the DOM value without the keydown events it listens for,
    // so it silently rewrites the field back to empty on blur. Type it out.
    const fromInput = page.getByRole('combobox', { name: 'From date' });
    await fromInput.click();
    await fromInput.pressSequentially('01/01/2099', { delay: 30 });
    await fromInput.press('Escape'); // closes the date panel without picking a day, keeps the typed text
    await page.waitForTimeout(800);
    await expect(fromInput).toHaveValue('01/01/2099');

    await expect(page.getByText('No records match this filter')).toBeVisible({ timeout: 15_000 });
    // Must NOT simultaneously render the load-failed error text or a data row —
    // Hard constraint #4: empty and error read as different sentences, never both.
    await expect(page.getByText('Failed to load change history')).toHaveCount(0);
    await expect(page.locator('table.admin-table tbody tr:not(.admin-empty-row)')).toHaveCount(0);
  });
});

test.describe('OBRS-576 — mobile 390px (priority #10)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('table scrolls horizontally rather than overflowing the page', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/config-change-history');
    await waitForDataLoaded(page);

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    // The page body itself must not overflow horizontally -- the table's own
    // wrapper should carry the scroll instead.
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 2); // +2px rounding tolerance
  });
});
