import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1331 evidence capture — see playwright.obrs1331.config.ts for how to run it (two
 * hand-started servers, no backend).
 *
 * <p>BEFORE and AFTER differ by ONE variable: the tree being served. Same viewport, same
 * synthetic session, same stubs, same language, same mode. The BEFORE tree is the OBRS-1308
 * worktree — `dev` carrying the seventh tab and not this card's declaration — so it is the
 * state the owner actually screenshotted, not a reconstruction.
 *
 * <p>Every shot asserts what it is supposed to show BEFORE shooting, and the two
 * width-dependent claims are MEASURED into the report rather than left to the eye: a
 * screenshot of a strip that happened not to wrap would look like proof of a fix that was
 * never exercised.
 *
 * <p>Screenshots land in e2e-evidence/ (gitignored) — the only prefix the e2e lane gate
 * allows — are uploaded to the card from there, then deleted. Not part of the committed
 * regression suite; the regression is pinned by
 * src/app/modules/admin-shell-tab-strip-wrap.spec.ts, which runs in CI.
 */

const BEFORE = 'http://localhost:4330';
const AFTER = 'http://localhost:4331';
const ASSETS = 'e2e-evidence/obrs-1331';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/**
 * The Booking Policy tab is the one the strip opens on (it is first, and the parent route
 * redirects to it). Without this its form never leaves the loading state and every shot
 * would be of a skeleton under the strip — which reads as "the page is broken" to whoever
 * reviews the card. Registered after stubGateAdminShell's catch-all so it wins.
 */
async function stubBookingPolicy(page: Page): Promise<void> {
  await page.route('**/private/admin/configs/booking-policy', (route) =>
    route.fulfill(ok({ maxAdvanceDays: 60, cutoffMinutes: 20 }))
  );
}

const tabStrip = (page: Page) => page.locator('[data-testid="system-settings-tabs"]');

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
    // `app_admin_theme`, not `theme`: ThemeService kept the original admin-only key when it
    // grew to drive the whole app (theme.service.ts:9). The first run of this spec used
    // `theme` and the dark shots came out byte-identical to the light ones — a "dark mode
    // holds too" claim backed by four light screenshots.
    await page.addInitScript(() => localStorage.setItem('app_admin_theme', 'dark'));
  }
  await stubBookingPolicy(page);
  await page.goto(`${origin}/admin/settings`);
  await expect(tabStrip(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid="system-settings-tab-notification-messages"]')).toBeVisible();
  // The active tab must actually be active, or "the active tab is detached" is a claim
  // about nothing.
  await expect(page.locator('.nav-tabs .nav-link.active')).toHaveCount(1);
  // And the mode has to be the one that was asked for, for the same reason.
  await expect
    .poll(() => page.evaluate(() => document.body.classList.contains('is-dark')))
    .toBe(dark);
}

/**
 * The two numbers this card is about, read off the live page:
 *  - rows: how many lines the flex strip wrapped into
 *  - gapToUlLine: how far the active tab's bottom edge sits ABOVE the <ul>'s border, i.e.
 *    how far the connector is from the tab it is supposed to connect
 *  - ownBaseline: whether the active tab's own row draws a baseline at all (this is the
 *    fix; on BEFORE the row-mates' border-bottom is transparent)
 */
async function measureStrip(page: Page): Promise<{
  rows: number;
  gapToUlLine: number;
  ownBaseline: boolean;
}> {
  return tabStrip(page).evaluate((ul) => {
    const links = [...ul.querySelectorAll<HTMLElement>('.nav-link')];
    const active = ul.querySelector<HTMLElement>('.nav-link.active')!;
    const activeTop = Math.round(active.getBoundingClientRect().top);
    const rowMates = links.filter(
      (a) => a !== active && Math.round(a.getBoundingClientRect().top) === activeTop
    );
    const painted = (el: HTMLElement) => {
      const c = getComputedStyle(el).borderBottomColor;
      const m = /^rgba?\(([^)]+)\)$/.exec(c);
      const parts = m ? m[1].split(',').map((s) => parseFloat(s)) : [];
      return !(parts.length === 4 && parts[3] === 0);
    };
    return {
      rows: new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size,
      gapToUlLine: +(
        ul.getBoundingClientRect().bottom - active.getBoundingClientRect().bottom
      ).toFixed(1),
      ownBaseline: rowMates.length > 0 && rowMates.every(painted),
    };
  });
}

/**
 * The whole difference this card makes is ONE 1px line, and at 1280x720 a full-page shot
 * is not a fair way to ask anyone to judge it — the reviewer would be hunting a hairline
 * in a screenshot of a settings form. So each pair also gets a close-up: the strip plus
 * the top of the panel it is supposed to connect to, at 3x, which is where "the selected
 * tab is joined to its row" is either true or it isn't.
 *
 * <p>Resolution comes from `deviceScaleFactor: 3` on the CONTEXT (see the close-up tests
 * below), never from `body { zoom }`: zoom re-lays-out the page, so the clip computed from
 * the 1x box lands somewhere else entirely. The first attempt did exactly that and wrote
 * two byte-identical 23,984-byte crops of the notification bell — a pair that "matched"
 * only because both were equally wrong.
 */
async function shootStripCloseUp(page: Page, path: string): Promise<void> {
  const box = await tabStrip(page).boundingBox();
  if (!box) throw new Error('tab strip has no box — nothing to shoot');
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, box.x - 16),
      y: Math.max(0, box.y - 16),
      width: box.width + 32,
      // The panel's top edge is the thing the active tab is meant to join, so it has to be
      // in frame; without it the shot cannot answer the question it was taken for.
      height: box.height + 90,
    },
  });
}

const CASES: ReadonlyArray<{ name: string; language: string; dark: boolean }> = [
  { name: '0-en-light', language: 'en', dark: false },
  { name: '1-th-light', language: 'th', dark: false },
  { name: '2-en-dark', language: 'en', dark: true },
  { name: '3-th-dark', language: 'th', dark: true },
];

for (const c of CASES) {
  test(`OBRS-1331 ${c.name} — BEFORE: the strip wraps and the active tab is detached`, async ({
    page,
  }) => {
    await openSettings(page, BEFORE, c.language, c.dark);
    const m = await measureStrip(page);
    expect(m.rows, `${c.name} BEFORE must actually wrap at 1280px, else this shot proves nothing`)
      .toBeGreaterThan(1);
    expect(m.ownBaseline, `${c.name} BEFORE: the active tab's row must have NO baseline`).toBe(false);
    // eslint-disable-next-line no-console
    console.log(`[OBRS-1331] BEFORE ${c.name}: rows=${m.rows} gapToUlLine=${m.gapToUlLine}px ownBaseline=${m.ownBaseline}`);
    await page.screenshot({ path: `${ASSETS}/OBRS-1331-BEFORE-${c.name}.png` });
  });

  test(`OBRS-1331 ${c.name} — AFTER: it still wraps, and the active tab keeps its own baseline`, async ({
    page,
  }) => {
    await openSettings(page, AFTER, c.language, c.dark);
    const m = await measureStrip(page);
    expect(m.rows, `${c.name} AFTER must wrap too — the fix is not "make it fit"`).toBeGreaterThan(1);
    expect(m.ownBaseline, `${c.name} AFTER: the active tab's row must draw its own baseline`).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`[OBRS-1331] AFTER  ${c.name}: rows=${m.rows} gapToUlLine=${m.gapToUlLine}px ownBaseline=${m.ownBaseline}`);
    await page.screenshot({ path: `${ASSETS}/OBRS-1331-AFTER-${c.name}.png` });
  });
}

/**
 * The close-up pair, rendered at 3x device pixels with the SAME CSS layout — same 1280px
 * viewport, so the strip wraps exactly as it does for the owner. This is the pair the card
 * is actually judged on.
 */
for (const c of CASES) {
  for (const [label, origin] of [
    ['BEFORE', BEFORE],
    ['AFTER', AFTER],
  ] as const) {
    test(`OBRS-1331 ${c.name} closeup ${label} — the strip at 3x, with the panel edge in frame`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 3,
      });
      const page = await context.newPage();
      try {
        await openSettings(page, origin, c.language, c.dark);
        const m = await measureStrip(page);
        expect(m.rows, 'the close-up must show a WRAPPED strip or it shows nothing').toBeGreaterThan(1);
        expect(m.ownBaseline).toBe(label === 'AFTER');
        await shootStripCloseUp(page, `${ASSETS}/OBRS-1331-${label}-${c.name}-closeup.png`);
      } finally {
        await context.close();
      }
    });
  }
}

/**
 * The blast-radius claim, as an image rather than only as a number: a strip wide enough
 * NOT to wrap must look the same after this card as before it. parcel-schedule-tabs (4
 * tabs) and parcel-consign (2 tabs) never wrap, so this is what they see.
 */
test('OBRS-1331 4-wide — a strip that does not wrap is unchanged (parcel pages see this)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  await openSettings(page, AFTER, 'en', false);
  const m = await measureStrip(page);
  expect(m.rows, '1600px must fit all seven tabs on one row').toBe(1);
  expect(
    Math.abs(m.gapToUlLine),
    'on one row the tab’s own border must land on the <ul>’s line, or this card changed pages that never had the bug'
  ).toBeLessThanOrEqual(1);
  // eslint-disable-next-line no-console
  console.log(`[OBRS-1331] AFTER  4-wide-1600: rows=${m.rows} gapToUlLine=${m.gapToUlLine}px`);
  await page.screenshot({ path: `${ASSETS}/OBRS-1331-AFTER-4-wide-no-wrap.png` });
});

test('OBRS-1331 5-wide — the same width on BEFORE, so the pair is comparable', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  await openSettings(page, BEFORE, 'en', false);
  const m = await measureStrip(page);
  expect(m.rows).toBe(1);
  // eslint-disable-next-line no-console
  console.log(`[OBRS-1331] BEFORE 5-wide-1600: rows=${m.rows} gapToUlLine=${m.gapToUlLine}px`);
  await page.screenshot({ path: `${ASSETS}/OBRS-1331-BEFORE-5-wide-no-wrap.png` });
});

/**
 * The second of the three templates that share `.admin-shell .nav-tabs`, shot for real
 * rather than argued from the settings page. `TABS` is a module const in
 * parcel-schedule-tabs-page.component.ts, so the STRIP renders with no backend even though
 * the page body under it cannot load — which is why these two shots are cropped to the
 * strip element. The body is not the subject and an error panel in frame would only
 * invite the wrong question.
 *
 * <p>parcel-consign is deliberately not shot: its strip is the same markup with two tabs
 * instead of four, so it is a strictly weaker case of what this pair already shows.
 */
for (const [label, origin] of [
  ['BEFORE', BEFORE],
  ['AFTER', AFTER],
] as const) {
  test(`OBRS-1331 6-parcel-schedule ${label} — the other template that shares this strip`, async ({
    page,
  }) => {
    await seedGateAdminSession(page, {
      username: 'salesperson@system.local',
      roles: ['salesperson'],
      language: 'en',
    });
    await page.goto(`${origin}/staff/parcels/schedule/1`);
    const strip = page.locator('[data-testid="parcel-schedule-tabs"]');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    const rows = await strip.evaluate(
      (ul) =>
        new Set(
          [...ul.querySelectorAll('.nav-link')].map((a) =>
            Math.round(a.getBoundingClientRect().top)
          )
        ).size
    );
    expect(rows, 'this strip must NOT wrap — that is the whole point of shooting it').toBe(1);
    // eslint-disable-next-line no-console
    console.log(`[OBRS-1331] ${label} 6-parcel-schedule: rows=${rows}`);
    await strip.screenshot({ path: `${ASSETS}/OBRS-1331-${label}-6-parcel-schedule-strip.png` });
  });
}
