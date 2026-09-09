/**
 * OBRS-1782 evidence: the two staff sell tile rows before and after the dark fill
 * was removed, in both themes.
 *
 *   npx playwright test --config=playwright.obrs1782capture.config.ts
 *
 * CAPTURE and not GATE because the verdict belongs to `staff-contrast-gate.spec.ts`
 * and to the invariant-B self-test in `customer-contrast-gate.spec.ts`, which is
 * where the clause split fails a build. What this adds is the pictures the card
 * asks for, and one thing a picture on its own cannot carry: the MEASURED ratio
 * painted onto each frame, because 1.09:1 against 1.61:1 is exactly the kind of
 * difference a screenshot argues about and a number does not.
 *
 * WHY THE "BEFORE" IS AN INJECTED RULE AND NOT A SECOND BUILD
 *
 * The whole change to the app is one declaration per row --
 * `background-color: var(--admin-surface-soft)` under `:host-context(.admin-shell.is-dark)`
 * -- so BEFORE is reconstructed by putting exactly that declaration back into the
 * live CSSOM, the same mutation idiom `obrs-812-capture.spec.ts` uses for the
 * OBRS-797 rule. It is not taken on trust: each frame asserts the composited fill
 * hex it was shot with, so a BEFORE that failed to reproduce the old surface, or an
 * AFTER still painting one, fails here instead of producing a misleading pair.
 *
 * Fully stubbed: it reuses `e2e/support/staff-pages.ts`, so every /api/** call is
 * answered in-browser and nothing reaches SIT.
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { MEASURE } from '../support/customer-contrast';
import { STAFF_PAGES, seedStaffSweepSession } from '../support/staff-pages';

const ASSETS = `e2e-evidence/obrs-1782`;

/** The declaration this card removed, put back exactly as it read. */
const REMOVED_RULE = `
  .admin-shell.is-dark .ptype-tile,
  .admin-shell.is-dark .fare-tile { background-color: var(--admin-surface-soft) !important }
`;

/**
 * Inserted INTO the flow directly above the tile rows, not pinned to the top of
 * the viewport: the frame below is a clip of those two rows, and a `position:
 * fixed` banner sits outside it -- which is a caption that exists on the page and
 * not on the evidence.
 */
async function caption(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.evaluate((label) => {
    const row = document.querySelector('.ptype-row');
    if (!row) return;
    const el = document.createElement('div');
    el.textContent = label;
    el.style.cssText =
      'background:#111;color:#fff;font:600 12px/1.5 monospace;padding:6px 10px;' +
      'letter-spacing:.2px;white-space:normal';
    el.id = 'obrs1782-caption';
    row.parentElement!.insertBefore(el, row);
  }, text);
}

async function dropCaption(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => document.getElementById('obrs1782-caption')?.remove());
}

/**
 * Both rows in one frame. They are siblings and the card is about the pair reading
 * as one group, so a shot of either alone would be the wrong evidence.
 */
async function shootTileRows(
  page: import('@playwright/test').Page,
  path: string
): Promise<void> {
  const box = await page.evaluate(() => {
    const rows = ['#obrs1782-caption', '.ptype-row', '.fare-category-row']
      .map((s) => document.querySelector(s))
      .filter((el): el is Element => el !== null)
      .map((el) => el.getBoundingClientRect());
    if (rows.length < 3) return null;
    const pad = 24;
    const top = Math.min(...rows.map((r) => r.top)) - pad;
    const left = Math.min(...rows.map((r) => r.left)) - pad;
    return {
      x: Math.max(0, left),
      y: Math.max(0, top),
      width: Math.max(...rows.map((r) => r.right)) - Math.max(0, left) + pad,
      height: Math.max(...rows.map((r) => r.bottom)) - Math.max(0, top) + pad,
    };
  });
  expect(
    box,
    'the caption and BOTH tile rows must be on screen -- one row alone, or a frame ' +
      'without the ratio it was shot at, is the wrong evidence'
  ).toBeTruthy();
  await page.screenshot({ path, clip: box! });
}

test.describe('OBRS-1782 evidence', () => {
  for (const dark of [true, false]) {
    const theme = dark ? 'dark' : 'light';

    test(`BEFORE/AFTER: the passenger-type and fare-category tile rows, ${theme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const sell = STAFF_PAGES.find((p) => p.key === 'staff-sell')!;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      try {
        await seedStaffSweepSession(page, dark, sell.fixture ?? []);
        await page.goto(sell.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await sell.act!(page);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => document.body.classList.contains('is-dark'))).toBe(dark);

        // Both rows render an ACTIVE tile by default, and the active state paints
        // `--accent-soft` -- a different question (OBRS-1774's) and not this card's.
        // Path cannot separate them: `pathOf` reports the same leaf for every tile
        // in a row, which is exactly why the register collapses them onto one key.
        // So address the INACTIVE one by its ordinal within its row, read from the
        // DOM's own `aria-pressed`.
        const ordinals = await page.evaluate(() => {
          const idx = (sel: string) =>
            Array.from(document.querySelectorAll(sel)).findIndex(
              (el) => el.getAttribute('aria-pressed') === 'false'
            );
          return { 'ptype-tile': idx('.ptype-tile'), 'fare-tile': idx('.fare-tile') };
        });
        expect(ordinals['ptype-tile'], 'no unselected passenger-type tile on screen').toBeGreaterThanOrEqual(0);
        expect(ordinals['fare-tile'], 'no unselected fare-category tile on screen').toBeGreaterThanOrEqual(0);

        const read = async () => {
          const sweep = await page.evaluate(MEASURE);
          const of = (cls: 'ptype-tile' | 'fare-tile') =>
            sweep.controls.filter((c) => c.path.includes(cls))[ordinals[cls]];
          const ptype = of('ptype-tile');
          const fare = of('fare-tile');
          expect(ptype, 'the passenger-type tile was not scored').toBeTruthy();
          expect(fare, 'the fare-category tile was not scored').toBeTruthy();
          return { ptype: ptype!, fare: fare! };
        };

        // --- BEFORE: the removed declaration, put back ------------------------
        await page.addStyleTag({ content: REMOVED_RULE });
        await page.waitForTimeout(200);
        const before = await read();
        await caption(
          page,
          `OBRS-1782 BEFORE  ${theme}  --  .ptype-tile fill ${before.ptype.fill ?? 'none'} ` +
            `${before.ptype.fillVsPage.toFixed(2)}:1 / border ${before.ptype.borderVsPage?.toFixed(2) ?? 'n/a'}:1 ` +
            `on ${before.ptype.page}  -- scored ${before.ptype.boundary.toFixed(2)}:1 via ${before.ptype.boundaryFrom}`
        );
        await shootTileRows(page, `${ASSETS}/OBRS-1782-BEFORE-tiles-${theme}.png`);
        await dropCaption(page);

        // --- AFTER: the shipped state -----------------------------------------
        await page.evaluate(() => {
          for (const el of Array.from(document.querySelectorAll('style'))) {
            if (el.textContent && el.textContent.includes('--admin-surface-soft) !important')) el.remove();
          }
        });
        await page.waitForTimeout(200);
        const after = await read();
        await caption(
          page,
          `OBRS-1782 AFTER  ${theme}  --  .ptype-tile fill ${after.ptype.fill ?? 'none'} ` +
            `${after.ptype.fillVsPage.toFixed(2)}:1 / border ${after.ptype.borderVsPage?.toFixed(2) ?? 'n/a'}:1 ` +
            `on ${after.ptype.page}  -- scored ${after.ptype.boundary.toFixed(2)}:1 via ${after.ptype.boundaryFrom}`
        );
        await shootTileRows(page, `${ASSETS}/OBRS-1782-AFTER-tiles-${theme}.png`);

        // --- what the pair has to prove, asserted rather than eyeballed --------
        for (const row of ['ptype', 'fare'] as const) {
          if (dark) {
            // What this pair does and does NOT prove, said plainly, because the
            // owner's 1.5:1 surface floor moved the answer after the card was
            // written. The tile fill is 1.09:1 -- BELOW that floor -- so the gate
            // scores it on the border in both halves and the registered 1.61:1
            // never changes. That is the point: removing the fill was the owner's
            // design call, not a verdict the gate forced, and the register's
            // "labelled tile, no fill of its own" is only literally true AFTER.
            expect(before[row].fill).toBe('#23292e');
            expect(before[row].fillVsPage).toBeCloseTo(1.09, 2);
            expect(after[row].fill).toBeNull();
            // Same number, same clause, on both halves -- and now honestly so.
            for (const half of [before[row], after[row]]) {
              expect(half.boundaryFrom).toBe('border');
              expect(half.boundary).toBeCloseTo(1.61, 2);
            }
          } else {
            // Light mode was already clause 3 and this card must not have touched
            // it. Same number on both halves is the proof, not an assumption.
            expect(after[row].boundaryFrom).toBe('border');
            expect(after[row].boundary).toBeCloseTo(before[row].boundary, 2);
          }
        }
      } finally {
        await context.close();
      }
    });
  }
});
