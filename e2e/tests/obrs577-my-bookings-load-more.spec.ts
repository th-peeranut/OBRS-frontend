import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OBRS-577 — /my-bookings incremental "Load more", replacing the hardcoded
 * page=0&size=100 that silently truncated the list at 100 rows.
 *
 * Runs against a LOCAL full-stack lane (see playwright.local.config.ts's own header
 * for the pattern this follows):
 *
 *   npx playwright test --config=playwright.obrs577.config.ts
 *
 * WHY LOCAL, NOT SIT
 * Every AC here (button appears, appends, count line, last-page hide, filter reset,
 * the 6-site mutation-reload window) only exercises with an account holding MORE
 * than 20 bookings, split across two independently-sized status buckets so a filter
 * switch can be proven to show a genuinely different total. No SIT seed account
 * clears 20 (customer@system.local's own real total was measured at 37 during this
 * QA run — read-only, used only as the live baseline, never mutated) and creating
 * dozens of real bookings on shared SIT data is not reasonable. See
 * e2e/fixtures/obrs577-load-more-fixture.sql for the exact fixture shape:
 *   - 44 CONFIRMED bookings (E2E-577-C-*), CASH-paid, + data.sql's own 1
 *     pre-existing confirmed booking for this user = 45 under the Confirmed filter.
 *   - 7 CANCELLED bookings (E2E-577-X-*) = 7 under the Cancelled filter.
 *   - 52 total under "All".
 * This file does NOT hardcode those totals — it reads the count line's own numbers
 * off the app's first response and asserts every subsequent number relative to that,
 * except the Cancelled bucket's 7 (100% fixture-controlled, data.sql seeds none).
 */

const CUSTOMER_EMAIL = 'customer@system.local';
const CUSTOMER_PASSWORD = 'P@ssw0rd';

type Locale = 'en' | 'th' | 'zh';

async function loginAsCustomer(page: Page, locale: Locale = 'en'): Promise<void> {
  await page.addInitScript((lang) => {
    localStorage.setItem('app_language', lang);
  }, locale);
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
  await page.locator('input[type="password"]').fill(CUSTOMER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function gotoMyBookings(page: Page): Promise<void> {
  await page.goto('/my-bookings');
  await page.locator('.booking-card:not(.booking-card--skeleton)').first().waitFor({ timeout: 30_000 });
}

function countLine(page: Page): Locator {
  return page.locator('.my-bookings__count');
}

function loadMoreButton(page: Page): Locator {
  return page.locator('.my-bookings__load-more button');
}

function bookingCards(page: Page): Locator {
  return page.locator('.booking-card:not(.booking-card--skeleton)');
}

function bookingNumbers(page: Page): Promise<string[]> {
  return bookingCards(page).locator('.booking-card__ref strong').allTextContents();
}

/** Parses either count-line wording ("Showing N of M bookings" / "Showing all M
 * bookings") without assuming which one is current — the two states use visibly
 * different English phrasing ("of" vs "all"), which is enough to disambiguate. */
async function readCounts(page: Page): Promise<{ shown: number; total: number; isAll: boolean }> {
  const text = (await countLine(page).textContent())?.trim() ?? '';
  const allMatch = text.match(/all\s+(\d+)/i);
  if (allMatch) {
    return { shown: Number(allMatch[1]), total: Number(allMatch[1]), isAll: true };
  }
  const partialMatch = text.match(/(\d+)\D+(\d+)/);
  if (!partialMatch) {
    throw new Error(`count line text matched neither "all N" nor "N ... M": "${text}"`);
  }
  return { shown: Number(partialMatch[1]), total: Number(partialMatch[2]), isAll: false };
}

async function switchLanguageLive(page: Page, code: Locale): Promise<void> {
  const endonym = { en: 'English', th: 'ไทย', zh: '中文' }[code];
  await page.locator('.navbar-lang-trigger').click();
  await page.locator('.navbar-lang-item', { hasText: endonym }).click();
  await expect(page.locator('.navbar-lang-menu')).toHaveCount(0);
}

test.describe('OBRS-577: /my-bookings incremental Load more', () => {
  test('AC1/AC4: count line + button on first load, append (not replace) across pages, last page hides the button and switches to "showing all"', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    await expect(countLine(page)).toBeVisible();
    await expect(loadMoreButton(page)).toBeVisible();

    let counts = await readCounts(page);
    expect(counts.isAll).toBe(false);
    expect(counts.shown).toBe(20);
    // The whole point of this fixture: strictly more than one page exists.
    expect(counts.total).toBeGreaterThan(20);
    const total = counts.total;
    await expect(bookingCards(page)).toHaveCount(20);

    await page.screenshot({ path: 'e2e-evidence/obrs577-AFTER-first-load-count-and-button.png', fullPage: true });

    let previousNumbers = await bookingNumbers(page);
    let shown = 20;
    let iterations = 0;
    while (shown < total) {
      await loadMoreButton(page).click();
      // AC/item 5: a Load-more click must never throw the app's full-page loading
      // overlay over the list being read (only the button's own in-place state).
      await expect(page.locator('.swal2-container')).toHaveCount(0);

      const expectedShown = Math.min(shown + 20, total);
      await expect(bookingCards(page)).toHaveCount(expectedShown, { timeout: 15_000 });

      const currentNumbers = await bookingNumbers(page);
      // APPEND proof: every previously-visible row is still there, in the same
      // positions — not a replace, not a re-shuffle, not a jump back to page 1.
      expect(currentNumbers.slice(0, previousNumbers.length)).toEqual(previousNumbers);

      counts = await readCounts(page);
      expect(counts.shown).toBe(expectedShown);
      expect(counts.total).toBe(total);

      previousNumbers = currentNumbers;
      shown = expectedShown;
      iterations++;
      expect(iterations).toBeLessThan(20); // safety valve, not a real expectation
    }

    await page.screenshot({ path: 'e2e-evidence/obrs577-AFTER-load-more-appended.png', fullPage: true });

    // Last page reached: button gone, count line switches wording, not just a
    // silently-disappearing affordance (AC4 — "must not end silently").
    await expect(loadMoreButton(page)).toHaveCount(0);
    counts = await readCounts(page);
    expect(counts.isAll).toBe(true);
    expect(counts.total).toBe(total);
    await expect(bookingCards(page)).toHaveCount(total);

    // Accessibility: the click that removed the button moved focus to the count
    // region, not silently to <body>.
    await expect(countLine(page)).toBeFocused();

    await page.screenshot({ path: 'e2e-evidence/obrs577-AFTER-last-page-showing-all.png', fullPage: true });
  });

  test('AC3: switching status filter resets to a genuinely different total, with no carryover of the previous filter\'s rows (OBRS-403 shape)', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // Load 2 pages under "All" first, so the reset is proven from a real
    // multi-page state, not a first-load coincidence.
    await loadMoreButton(page).click();
    await expect(bookingCards(page)).toHaveCount(40, { timeout: 15_000 });
    const beforeSwitch = await bookingNumbers(page);
    expect(beforeSwitch.some((n) => n.startsWith('E2E-577-C-'))).toBe(true);

    // Cancelled is the one bucket this file fully controls (7 rows, data.sql seeds
    // none) — the only total here that is safe to assert as a literal.
    await page.locator('.filter-pill', { hasText: /^Cancelled$/ }).click();
    await expect(bookingCards(page)).toHaveCount(7, { timeout: 15_000 });

    const afterSwitch = await bookingNumbers(page);
    expect(afterSwitch.every((n) => n.startsWith('E2E-577-X-'))).toBe(true);
    expect(afterSwitch.some((n) => beforeSwitch.includes(n))).toBe(false);

    const counts = await readCounts(page);
    expect(counts.isAll).toBe(true); // 7 rows fit on one page: no button, "showing all"
    expect(counts.total).toBe(7);
    await expect(loadMoreButton(page)).toHaveCount(0);

    await page.screenshot({ path: 'e2e-evidence/obrs577-AFTER-filter-switch-cancelled.png', fullPage: true });
  });

  test('empty filter bucket ("Pending"): no count line, no Load more button, EMPTY state shown instead', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    await page.locator('.filter-pill', { hasText: /^Pending$/ }).click();
    await expect(page.locator('.state-card--empty')).toBeVisible({ timeout: 15_000 });
    await expect(countLine(page)).toHaveCount(0);
    await expect(loadMoreButton(page)).toHaveCount(0);
    await expect(bookingCards(page)).toHaveCount(0);
  });

  test('first-load state: no count line and no Load more while the initial page is still loading (skeletons only)', async ({
    page,
  }) => {
    await page.route('**/bookings/me**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await loginAsCustomer(page);
    await page.goto('/my-bookings');

    await expect(page.locator('.booking-card--skeleton').first()).toBeVisible({ timeout: 10_000 });
    await expect(countLine(page)).toHaveCount(0);
    await expect(loadMoreButton(page)).toHaveCount(0);

    await expect(bookingCards(page)).toHaveCount(20, { timeout: 15_000 });
    await expect(countLine(page)).toBeVisible();
  });

  // Highest-value manual/live check on this card per the QA brief: two separate
  // code fixes were needed to keep an appended, multi-page list from silently
  // collapsing back to 20 rows the moment a mutation (cancel/reschedule/
  // change-seat/change-stop) reloads it. Filtered to "Confirmed" specifically so
  // the cancelled booking actually LEAVES the visible set (unlike the unfiltered
  // "All" view, where a status flip is invisible to the row count) — this is the
  // scenario the spec's own flow #4 describes.
  test('mutation-reload window (cancel): cancelling one of 40 loaded Confirmed rows shrinks by exactly one, never collapses to 20', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    await page.locator('.filter-pill', { hasText: /^Confirmed$/ }).click();
    await expect(bookingCards(page)).toHaveCount(20, { timeout: 15_000 });

    let counts = await readCounts(page);
    expect(counts.shown).toBe(20);
    const confirmedTotal = counts.total; // derived (fixture guarantees 45), not hardcoded
    expect(confirmedTotal).toBeGreaterThan(20);

    await loadMoreButton(page).click();
    const expectedAfterLoadMore = Math.min(40, confirmedTotal);
    await expect(bookingCards(page)).toHaveCount(expectedAfterLoadMore, { timeout: 15_000 });
    // The fixture is sized so this is really a full second page (40), not a
    // truncated one — otherwise the test below would be a weaker check than it
    // reads as.
    expect(expectedAfterLoadMore).toBe(40);

    const target = bookingCards(page).first();
    const targetNumber = (await target.locator('.booking-card__ref strong').textContent())?.trim();
    await target.locator('.actions-menu-btn').scrollIntoViewIfNeeded();
    await target.locator('.actions-menu-btn').click();
    const menu = page.locator('.p-menu');
    await menu.waitFor({ state: 'visible', timeout: 10_000 });
    await menu.locator('.action-menu-item__label', { hasText: 'Cancel booking' }).click();

    // CancellationService.resolveRefundMethod resolves CASH (the fixture pays every
    // confirmed booking by cash) — the non-manual lane, so no destination form to
    // fill; Confirm is a single click.
    const modal = page.locator('.crdm-modal');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.locator('app-refund-destination-fields')).toHaveCount(0);
    await page.screenshot({ path: 'e2e-evidence/obrs577-BEFORE-cancel-confirm-modal.png', fullPage: true });
    await modal.locator('.crdm-actions .btn-primary').click();
    await expect(modal).toHaveCount(0, { timeout: 20_000 });

    // THE assertion: 39 rows (40 minus the one that left the Confirmed filter),
    // never a snap back to 20.
    await expect(bookingCards(page)).toHaveCount(39, { timeout: 20_000 });
    counts = await readCounts(page);
    expect(counts.shown).toBe(39);
    expect(counts.total).toBe(confirmedTotal - 1);
    if (targetNumber) {
      await expect(bookingCards(page)).not.toContainText(targetNumber);
    }

    await page.screenshot({ path: 'e2e-evidence/obrs577-AFTER-cancel-preserve-window.png', fullPage: true });
  });

  for (const locale of ['en', 'th', 'zh'] as const) {
    test(`AC5 (cold load, ${locale}): count line + button render localized text, no raw keys, no {{ }} leaking`, async ({
      page,
    }) => {
      await loginAsCustomer(page, locale);
      await gotoMyBookings(page);

      await expect(countLine(page)).toBeVisible();
      await expect(loadMoreButton(page)).toBeVisible();

      const countText = (await countLine(page).textContent()) ?? '';
      const buttonText = (await loadMoreButton(page).textContent()) ?? '';
      expect(countText).not.toContain('MY_BOOKINGS.');
      expect(countText).not.toContain('{{');
      expect(buttonText).not.toContain('MY_BOOKINGS.');
      expect(buttonText).not.toContain('{{');

      await page.screenshot({ path: `e2e-evidence/obrs577-AFTER-i18n-${locale}-cold-load.png`, fullPage: false });
    });
  }

  test('AC5 (live switch): the navbar language switcher updates the count line/button with no reload, no value cached at mount', async ({
    page,
  }) => {
    await loginAsCustomer(page, 'en');
    await gotoMyBookings(page);
    await expect(countLine(page)).toContainText('Showing');
    await expect(loadMoreButton(page)).toContainText('Load more');

    await switchLanguageLive(page, 'th');
    await expect(countLine(page)).toContainText('แสดง', { timeout: 10_000 });
    await expect(loadMoreButton(page)).toContainText('โหลดเพิ่มเติม');
    await expect(countLine(page)).not.toContainText('MY_BOOKINGS.');

    await switchLanguageLive(page, 'zh');
    await expect(countLine(page)).toContainText('显示', { timeout: 10_000 });
    await expect(loadMoreButton(page)).toContainText('加载更多');
    await expect(countLine(page)).not.toContainText('MY_BOOKINGS.');

    await page.screenshot({ path: 'e2e-evidence/obrs577-AFTER-i18n-live-switch-zh.png', fullPage: false });
  });
});
