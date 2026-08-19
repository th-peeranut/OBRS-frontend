import { Browser, Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1432 evidence capture — see playwright.obrs1432.config.ts for how to run it (two
 * hand-started servers, no backend).
 *
 * <p>The card's claim is a NUMBER, so every shot measures it before taking it: how many
 * rows the strip wrapped into, at the two widths the defect was measured at on live SIT
 * (a 1,366px laptop and a 390px phone). A screenshot of a strip that happened to fit
 * would look like proof of a fix that was never exercised, and a screenshot of the
 * grouped strip proves nothing on its own without the flat one beside it at the same
 * width.
 *
 * <p>Screenshots land in e2e-evidence/ (gitignored) — the only prefix the e2e lane gate
 * allows — are uploaded to the card from there, then deleted. Not part of the committed
 * regression suite; the regression is pinned by
 * src/app/modules/admin/pages/system-settings/system-settings-page.component.spec.ts,
 * which runs in CI.
 */

const BEFORE = 'http://localhost:4340';
const AFTER = 'http://localhost:4341';
const ASSETS = 'e2e-evidence/obrs-1432';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

const tabStrip = (page: Page) => page.locator('[data-testid="system-settings-tabs"]');

/**
 * The Booking Policy tab is the one the strip opens on (it is first, and the parent route
 * redirects to it). Without this its form never leaves the loading state and every shot
 * would be of a skeleton under the strip. Registered after stubGateAdminShell's catch-all
 * so it wins.
 */
async function stubBookingPolicy(page: Page): Promise<void> {
  await page.route('**/private/admin/configs/booking-policy', (route) =>
    route.fulfill(ok({ maxAdvanceDays: 60, cutoffMinutes: 20 }))
  );
}

async function openSettings(
  page: Page,
  origin: string,
  language: string,
  dark: boolean
): Promise<void> {
  await seedGateAdminSession(page, {
    username: 'owner@system.local',
    roles: ['owner'],
    language,
  });
  if (dark) {
    // `app_admin_theme`, not `theme`: ThemeService kept the original admin-only key when
    // it grew to drive the whole app (theme.service.ts:9). OBRS-1331 shipped four
    // byte-identical "dark" shots by using the wrong key.
    await page.addInitScript(() => localStorage.setItem('app_admin_theme', 'dark'));
  }
  await stubBookingPolicy(page);
  await page.goto(`${origin}/admin/settings`);
  await expect(tabStrip(page)).toBeVisible({ timeout: 20_000 });
  // All eight tabs must be in the DOM on BOTH trees — the card must not have lost one
  // behind a group, and a shot of a strip that is short because a tab vanished would
  // read as the fix.
  await expect(page.locator('[data-testid^="system-settings-tab-"]')).toHaveCount(8);
  await expect
    .poll(() => page.evaluate(() => document.body.classList.contains('is-dark')))
    .toBe(dark);
}

/** Rows the strip wrapped into, and how many entries it renders to get them. */
async function measureStrip(page: Page): Promise<{ rows: number; entries: number }> {
  return tabStrip(page).evaluate((ul) => {
    const entries = [...ul.children] as HTMLElement[];
    return {
      rows: new Set(entries.map((li) => Math.round(li.getBoundingClientRect().top))).size,
      entries: entries.length,
    };
  });
}

interface Case {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly language: string;
  readonly dark: boolean;
  /**
   * Whether the grouped strip must come down to ONE row at this width. True only for the
   * laptop cases: 390px is narrower than five entries can ever be, so demanding one row
   * there would be demanding something this card never claimed.
   */
  readonly singleRow: boolean;
}

const CASES: readonly Case[] = [
  { name: '0-desktop-1366-th-light', width: 1366, height: 768, language: 'th', dark: false, singleRow: true },
  { name: '1-desktop-1366-th-dark', width: 1366, height: 768, language: 'th', dark: true, singleRow: true },
  { name: '2-mobile-390-th-light', width: 390, height: 844, language: 'th', dark: false, singleRow: false },
  { name: '3-mobile-390-th-dark', width: 390, height: 844, language: 'th', dark: true, singleRow: false },
  { name: '4-desktop-1366-en-light', width: 1366, height: 768, language: 'en', dark: false, singleRow: true },
];

async function withViewport(
  browser: Browser,
  c: Case,
  body: (page: Page) => Promise<void>
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await body(page);
  } finally {
    await context.close();
  }
}

for (const c of CASES) {
  test(`OBRS-1432 ${c.name} — BEFORE: one entry per tab, and the strip wraps`, async ({
    browser,
  }) => {
    await withViewport(browser, c, async (page) => {
      await openSettings(page, BEFORE, c.language, c.dark);
      const m = await measureStrip(page);
      expect(m.entries, 'BEFORE renders one entry per tab — that is the mechanism').toBe(8);
      expect(m.rows, `${c.name} BEFORE must actually wrap, else this shot proves nothing`)
        .toBeGreaterThan(1);
      // eslint-disable-next-line no-console
      console.log(`[OBRS-1432] BEFORE ${c.name}: entries=${m.entries} rows=${m.rows}`);
      await page.screenshot({ path: `${ASSETS}/OBRS-1432-BEFORE-${c.name}.png` });
    });
  });

  test(`OBRS-1432 ${c.name} — AFTER: one entry per topic, on fewer rows`, async ({ browser }) => {
    await withViewport(browser, c, async (page) => {
      await openSettings(page, AFTER, c.language, c.dark);
      const after = await measureStrip(page);

      // The BEFORE strip, measured in this same context at this same width, rather than
      // an expected row count written into the spec. A number I predict and then assert
      // is a guess dressed as a gate — the claim this card makes is comparative, so the
      // comparison is what runs.
      const before = await page.context().newPage();
      await openSettings(before, BEFORE, c.language, c.dark);
      const flat = await measureStrip(before);
      await before.close();

      expect(after.entries, 'AFTER renders one entry per topic, not per tab').toBe(5);
      expect(flat.entries, 'BEFORE renders one entry per tab').toBe(8);
      expect(after.rows, `${c.name}: grouping must cost fewer rows than the flat strip`)
        .toBeLessThan(flat.rows);
      if (c.singleRow) {
        expect(after.rows, `${c.name}: a laptop must get the whole strip on one row`).toBe(1);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[OBRS-1432] ${c.name}: BEFORE entries=${flat.entries} rows=${flat.rows} -> AFTER entries=${after.entries} rows=${after.rows}`
      );
      await page.screenshot({ path: `${ASSETS}/OBRS-1432-AFTER-${c.name}.png` });
    });
  });
}

/**
 * The one thing the strip alone cannot show: what a collapsed group costs to open. Shot
 * on the widest and the narrowest case, in both modes, because the menu is the only new
 * surface this card draws and it is the one that had to be taught the shell's dark tokens
 * (see system-settings-page.component.scss).
 */
for (const c of CASES.filter((x) => x.name !== '4-desktop-1366-en-light')) {
  test(`OBRS-1432 ${c.name} — AFTER: a group opened, with the tabs inside it`, async ({
    browser,
  }) => {
    await withViewport(browser, c, async (page) => {
      await openSettings(page, AFTER, c.language, c.dark);
      await page.locator('[data-testid="system-settings-group-notifications"]').click();
      const menu = page.locator('.dropdown-menu.show');
      await expect(menu).toBeVisible();
      await expect(menu.locator('[data-testid^="system-settings-tab-"]')).toHaveCount(2);
      await page.screenshot({ path: `${ASSETS}/OBRS-1432-AFTER-${c.name}-open.png` });
    });
  });
}
