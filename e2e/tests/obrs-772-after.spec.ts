/**
 * OBRS-772 BEFORE/AFTER evidence.
 *
 * The BEFORE frames are not re-created here and could not honestly be: they were
 * photographed by `obrs-772-boundary-mockup.spec.ts` on this same lane BEFORE any
 * SCSS in this branch was touched, and are kept at
 * `docs/manual-tests/assets/OBRS-772/before/`. This spec shoots the same four
 * screens in the same two themes on the CURRENT build and pairs each with its
 * saved BEFORE, so the two halves of every sheet are the same viewport, the same
 * fixtures and the same lane -- the only thing that differs is the code.
 *
 * A missing BEFORE file fails the run rather than producing a one-sided sheet.
 *
 * ⚠ THIS SPEC IS NOT REPRODUCIBLE FROM A CLEAN CLONE, and that is a property of
 * the repo rather than an oversight: `.gitignore:78` excludes
 * `docs/manual-tests/assets/`, so evidence lives on the Jira card and not in git.
 * The sheets this produced are attached to OBRS-772. To run it again you must
 * first put the BEFORE frames back under `docs/manual-tests/assets/OBRS-772/
 * before/` -- either from the card, or by re-shooting them from `origin/dev`
 * with `obrs-772-boundary-mockup.spec.ts` (its `current` variant is exactly the
 * unrepainted frame) and renaming `-current` to `-BEFORE`.
 *
 * ASCII-only source.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { STAFF_PAGES, seedStaffSweepSession } from '../support/staff-pages';

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-772');

const SHOTS = [
  { key: 'home', shell: 'customer', focus: '.btn-search', caption: 'Customer / -- search form, dropdown triggers, navbar' },
  { key: 'my-bookings', shell: 'customer', focus: '.filter-pill', caption: 'Customer /my-bookings -- kebab menu, filter pills' },
  { key: 'staff-sell', shell: 'staff', focus: '.ptype-tile', caption: 'Staff /staff/sell -- checkout fields, date field' },
  { key: 'staff-boarding', shell: 'staff', focus: '.admin-btn', caption: 'Staff /staff/boarding -- scan box, search box' },
] as const;

test.describe('OBRS-772 before/after', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test('pair each repainted screen with the frame taken before the change', async ({ browser }) => {
    for (const shot of SHOTS) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const beforePath = path.join(OUT, 'before', `OBRS-772-${shot.key}-${theme}-BEFORE.png`);
        expect(fs.existsSync(beforePath), `missing BEFORE frame: ${beforePath}`).toBe(true);

        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const sheet = await context.newPage();
        try {
          if (shot.shell === 'customer') {
            const target = CUSTOMER_PAGES.find((p) => p.key === shot.key)!;
            await seedCustomerSession(sheet, dark);
            await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
            await sheet.waitForTimeout(2500);
            if (target.seed) {
              await seedStore(sheet, target.storeOverride?.());
              await sheet.waitForTimeout(1200);
            }
          } else {
            const target = STAFF_PAGES.find((p) => p.key === shot.key)!;
            await seedStaffSweepSession(sheet, dark, target.fixture ?? []);
            await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
            await sheet.waitForTimeout(2500);
            if (target.act) await target.act(sheet);
            await sheet.waitForTimeout(800);
          }
          if (shot.focus && (await sheet.locator(shot.focus).count()) > 0) {
            await sheet
              .locator(shot.focus)
              .first()
              .scrollIntoViewIfNeeded()
              .catch(() => undefined);
            await sheet.waitForTimeout(300);
          }
          const after = await sheet.screenshot();
          fs.writeFileSync(path.join(OUT, `OBRS-772-${shot.key}-${theme}-AFTER.png`), after);

          const board = await browser.newPage({ viewport: { width: 1480, height: 400 } });
          await board.setContent(
            `<style>body{margin:0;background:#111;font:13px system-ui;color:#eee}` +
              `h1{margin:14px 20px 4px;font-size:15px}figure{margin:0 20px 18px}` +
              `figcaption{padding:6px 0;font-weight:600}` +
              `img{display:block;width:1440px;border:1px solid #444}</style>` +
              `<h1>OBRS-772 &mdash; ${shot.caption} &mdash; ${theme} theme</h1>` +
              `<figure><figcaption>BEFORE &mdash; framework default control borders</figcaption>` +
              `<img src="data:image/png;base64,${fs.readFileSync(beforePath).toString('base64')}"></figure>` +
              `<figure><figcaption>AFTER &mdash; fields, dropdown triggers and icon-only buttons on the control-boundary token</figcaption>` +
              `<img src="data:image/png;base64,${after.toString('base64')}"></figure>`
          );
          await board.waitForTimeout(400);
          await board.screenshot({
            path: path.join(OUT, `OBRS-772-BEFORE-AFTER-${shot.key}-${theme}.png`),
            fullPage: true,
          });
          await board.close();
        } finally {
          await context.close();
        }
      }
    }
  });
});
