/**
 * OBRS-812 evidence: what the staff contrast gate now sees, and the defect it
 * would now catch.
 *
 *   npx playwright test --config=playwright.obrs812capture.config.ts
 *
 * CAPTURE and not GATE because the verdict already belongs to
 * `staff-contrast-gate.spec.ts`, which owns the register and fails the build. Two
 * judges on one question is worse than one. What this adds is the two things that
 * lane structurally cannot give the card:
 *
 *   1. PICTURES OF THE POPULATION. The gate reports "4 pages x 2 themes" and a
 *      count of text runs. Neither shows that the fixtures reach real, populated
 *      screens rather than empty shells that happen to clear a floor -- and
 *      "the fixture rendered nothing" is precisely the failure OBRS-734 and
 *      OBRS-795 are about. A human confirms that by looking.
 *   2. THE BEFORE THAT NO LONGER EXISTS ON dev. The defect this card exists for
 *      was fixed by OBRS-797 seven weeks ago, so `dev` cannot show it. The pair
 *      below reconstructs it the same way the gate's mutation test does -- by
 *      removing the shipped rule from the live CSSOM -- and paints the MEASURED
 *      ratio onto each frame, because a placeholder's dimness is exactly the kind
 *      of difference a screenshot argues about and a number does not.
 *
 * Fully stubbed: it reuses `e2e/support/staff-pages.ts`, so every /api/** call is
 * answered in-browser and nothing reaches SIT.
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { MEASURE } from '../support/customer-contrast';
import { STAFF_PAGES, seedStaffSweepSession, stripAdminFieldPlaceholderRules } from '../support/staff-pages';

const ASSETS = `e2e-evidence/obrs-812`;

/** Paint a caption into the page so the frame carries its own measurement. */
async function caption(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.evaluate((label) => {
    const el = document.createElement('div');
    el.textContent = label;
    el.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#111;color:#fff;' +
      'font:600 15px/1.6 monospace;padding:8px 14px;letter-spacing:.2px';
    document.body.appendChild(el);
  }, text);
}

test.describe('OBRS-812 evidence', () => {
  test('AFTER: the four staff pages the gate now sweeps, in both themes', async ({ browser }) => {
    test.setTimeout(240_000);
    for (const target of STAFF_PAGES) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
        const page = await context.newPage();
        try {
          await seedStaffSweepSession(page, dark, target.fixture ?? []);
          await page.goto(target.url, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2500);
          if (target.act) await target.act(page);
          await page.waitForTimeout(500);

          const sweep = await page.evaluate(MEASURE);
          // Asserted, not just shot: a frame of an empty shell is worse evidence
          // than no frame, because it looks like proof.
          expect(sweep.measuredText).toBeGreaterThanOrEqual(target.minText);
          expect(sweep.bodyIsDark).toBe(dark);

          await caption(
            page,
            `OBRS-812  ${target.key}  ${theme}  --  ${sweep.measuredText} text runs, ` +
              `${sweep.measuredControls} controls, ${sweep.measuredPlaceholders} placeholders scored`
          );
          await page.screenshot({ path: `${ASSETS}/OBRS-812-AFTER-swept-${target.key}-${theme}.png`, fullPage: true });
        } finally {
          await context.close();
        }
      }
    }
  });

  test('BEFORE/AFTER: the boarding scan placeholder, with and without the OBRS-797 rule', async ({ browser }) => {
    test.setTimeout(120_000);
    const boarding = STAFF_PAGES.find((p) => p.key === 'staff-boarding')!;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await seedStaffSweepSession(page, true, boarding.fixture ?? []);
      await page.goto(boarding.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const box = page.locator('.boarding-scan-box');
      await expect(box).toBeVisible();

      const after = await page.evaluate(MEASURE, '.admin-field.boarding-scan-input');
      expect(after.placeholders.length).toBe(1);
      await caption(
        page,
        `AFTER (dev today, OBRS-797 rule in place)  --  placeholder ${after.placeholders[0].fg} on ` +
          `${after.placeholders[0].bg} = ${after.placeholders[0].ratio.toFixed(2)}:1  (AA needs 4.5)`
      );
      await page.screenshot({ path: `${ASSETS}/OBRS-812-AFTER-boarding-placeholder-guarded.png` });

      // Reconstruct the pre-OBRS-797 state the same way the gate's mutation test
      // does, so the picture and the assertion are the same experiment.
      const removed = await page.evaluate(stripAdminFieldPlaceholderRules);
      expect(removed).toBeGreaterThan(0);

      const before = await page.evaluate(MEASURE, '.admin-field.boarding-scan-input');
      expect(before.placeholders.length).toBe(1);
      await page.evaluate(() => document.querySelectorAll('div[style*="2147483647"]').forEach((n) => n.remove()));
      await caption(
        page,
        `BEFORE (OBRS-797 rule removed -- what shipped before it, and what NOTHING was watching)  --  ` +
          `placeholder ${before.placeholders[0].fg} on ${before.placeholders[0].bg} = ` +
          `${before.placeholders[0].ratio.toFixed(2)}:1  (AA needs 4.5)`
      );
      await page.screenshot({ path: `${ASSETS}/OBRS-812-BEFORE-boarding-placeholder-unguarded.png` });

      console.log(
        `\nOBRS-812 evidence: guarded ${after.placeholders[0].fg} ${after.placeholders[0].ratio.toFixed(2)}:1 ` +
          `-> unguarded ${before.placeholders[0].fg} ${before.placeholders[0].ratio.toFixed(2)}:1 ` +
          `(${removed} rule(s) removed)`
      );
    } finally {
      await context.close();
    }
  });
});
