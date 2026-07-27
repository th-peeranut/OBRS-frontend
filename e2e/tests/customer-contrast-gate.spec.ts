/**
 * The customer-shell contrast gate (OBRS-584).
 *
 * Read `e2e/support/customer-contrast.ts` first -- it carries the argument for
 * why this has to run in a browser rather than over the stylesheets, and what
 * the two invariants are. This file is the verdict layer: it drives the pages,
 * enforces the floors, and holds the debt register honest.
 *
 * WHAT MAKES THIS A GATE RATHER THAN A REPORT
 *
 *   1. It runs in the GATE lane, in CI, on every push (`e2e-gate` in ci.yml).
 *      The measurement it performs already existed as `capture-obrs752.js` and
 *      found 263 sites below AA -- once, by hand, and then told nobody.
 *   2. It FAILS WHEN THERE IS NOTHING TO MEASURE. Each page declares a minimum
 *      number of scoreable text runs and controls, and the pathname it must
 *      land on. A page that redirects, renders an empty shell, or loses its
 *      fixtures reports too small a population and goes red -- rather than
 *      reporting "0 below AA", which is what a gate looks like moments before
 *      somebody discovers it has been measuring nothing (OBRS-734).
 *   3. Its own colour maths is pinned against pairs published on the card, so a
 *      quietly wrong luminance formula cannot make the whole run green.
 *   4. Every skip is COUNTED and printed. Gradients, `opacity < 1` and disabled
 *      controls are not scored -- but "not scored" is reported as a number, not
 *      folded into the pass.
 *
 * COST. This adds ~1 minute of wall clock to a job that already boots `ng serve`
 * for the rest of the lane. The card warned about a 2,000 minute/month Actions
 * ceiling; that ceiling is real for the PRIVATE OBRS-backend repo and does not
 * reach this workflow -- `th-peeranut/OBRS-frontend` is PUBLIC, so Actions
 * minutes here are unmetered (established in OBRS-735, and stated at length in
 * ci.yml). The trade is wall clock, not quota.
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { AA_BOUNDARY, MEASURE, boundaryKey, textKey } from '../support/customer-contrast';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { CONTRAST_ALLOW } from '../support/customer-contrast-allow';

interface Row {
  key: string;
  /** Every page the defect was seen on -- one entry, many sightings. */
  pages: Set<string>;
  /** The WORST sighting: its detail line, so the report quotes real values. */
  detail: string;
  ratio: number;
  floor: number;
  count: number;
}

const fmt = (r: Row) =>
  `  ${r.ratio.toFixed(2)}:1 (needs ${r.floor}) x${r.count} on ${[...r.pages].join(',')}\n` +
  `      ${r.key}\n      ${r.detail}`;

test.describe('customer shell contrast gate (OBRS-584)', () => {
  /**
   * The gate's own must-catch / must-NOT-catch, run before it is allowed to
   * report on the app.
   *
   * OBRS-569's first gate flagged 38 sites of which 17 were already correct;
   * believing a red run straight would have "fixed" seventeen working things.
   * So the fixtures below are not synthetic colours -- they are the OBRS-575
   * defect and its shipped fix, at the exact hex values recorded on both cards,
   * driven through the REAL `MEASURE` in a real browser. If the luminance
   * formula or the compositing walk is wrong, this fails here rather than
   * turning the eight-page sweep silently green.
   */
  test('the gate fires on the OBRS-575 defect and stays quiet on its fix', async ({ page }) => {
    await page.goto('about:blank');
    await page.setContent(`
      <body style="margin:0">
        <!-- The dark Home card. $dk-bg-soft. -->
        <div class="booking-card" style="background-color:#22263a;padding:20px">
          <!-- BEFORE cda7794: the pill inherits $brand-customer-strong in dark mode
               because dark-theme.scss contained no .recent-route-btn selector at all.
               2.79:1 -- below AA for text (4.5) AND for a boundary (3.0). -->
          <button class="broken-pill" style="background-color:transparent;color:#4069b8;border:1px solid #4069b8">
            Nong Chak - Mo Chit 2
          </button>
          <!-- AFTER cda7794: repointed to $dk-accent. 7.36:1 text, and the border
               carries the boundary at the same ratio. -->
          <button class="fixed-pill" style="background-color:transparent;color:#4bc2f7;border:1px solid #4bc2f7">
            Ban Bueng - BTS Mo Chit
          </button>
          <!-- WCAG exempts inactive components; scoring this would demand that a
               greyed-out control be made to look enabled. -->
          <button class="off-pill" disabled style="background-color:transparent;color:#4069b8;border:1px solid #4069b8">
            Disabled
          </button>
          <!-- A gradient fill returns rgba(0,0,0,0) from backgroundColor, so the
               composite walk would report the card behind it and invent a ratio.
               Must be COUNTED, never scored (OBRS-734). -->
          <button class="grad-pill" style="background-image:linear-gradient(90deg,#0772a2,#4bc2f7);color:#ffffff;border:0">
            Gradient
          </button>
          <!-- Legible label, and 21:1 against the card. Neither invariant may fire. -->
          <p class="fine-copy" style="color:#ffffff">Readable copy on the dark card</p>
        </div>
      </body>
    `);

    const sweep = await page.evaluate(MEASURE);

    const textOf = (cls: string) => sweep.text.find((t) => t.path.includes(cls));
    const controlOf = (cls: string) => sweep.controls.find((c) => c.path.includes(cls));

    // must-catch, invariant A: the label.
    const brokenText = textOf('broken-pill');
    expect(brokenText, 'the 2.79:1 label was not measured at all').toBeTruthy();
    expect(brokenText!.ratio).toBeCloseTo(2.79, 2);
    expect(brokenText!.ratio).toBeLessThan(brokenText!.floor);

    // must-catch, invariant B: the boundary. A transparent fill leaves the border
    // as the only thing separating the control from the card, and it is the same
    // 2.79:1 -- a criterion no text-contrast check can see.
    const brokenBoundary = controlOf('broken-pill');
    expect(brokenBoundary, 'the outline pill was not scored for a boundary').toBeTruthy();
    expect(brokenBoundary!.boundary).toBeCloseTo(2.79, 2);
    expect(brokenBoundary!.boundary).toBeLessThan(AA_BOUNDARY);

    // must-NOT-catch: the shipped fix, both invariants.
    const fixedText = textOf('fixed-pill');
    expect(fixedText!.ratio).toBeGreaterThanOrEqual(fixedText!.floor);
    expect(controlOf('fixed-pill')!.boundary).toBeGreaterThanOrEqual(AA_BOUNDARY);

    const copy = textOf('fine-copy');
    expect(copy!.ratio).toBeGreaterThanOrEqual(copy!.floor);

    // must-NOT-catch: the three populations that must be counted, not scored.
    expect(textOf('off-pill'), 'a disabled control was scored -- WCAG exempts it').toBeFalsy();
    expect(controlOf('off-pill')).toBeFalsy();
    expect(controlOf('grad-pill'), 'a gradient fill was scored from a transparent backgroundColor').toBeFalsy();
    expect(sweep.skipped.disabled).toBeGreaterThan(0);
    expect(sweep.skipped.gradient).toBeGreaterThan(0);
  });

  // Eight pages in two themes, sequentially, in one browser context. Splitting
  // them into a test each would read better in a report but makes the
  // stale-entry check impossible: an allowlist entry is only provably dead once
  // every page has run, and this lane spreads tests across workers.
  test('every text run and control surface is at or above its WCAG AA floor', async ({ page, browser }) => {
    test.setTimeout(300_000);

    // One row per DEFECT, accumulated across all sixteen sweeps. The worst
    // sighting wins the printed detail; every sighting is counted.
    const collapsed = new Map<string, Row>();
    const record = (hit: { key: string; page: string; detail: string; ratio: number; floor: number }) => {
      const seen = collapsed.get(hit.key);
      if (!seen) {
        collapsed.set(hit.key, {
          key: hit.key,
          pages: new Set([hit.page]),
          detail: hit.detail,
          ratio: hit.ratio,
          floor: hit.floor,
          count: 1,
        });
        return;
      }
      seen.pages.add(hit.page);
      seen.count++;
      if (hit.ratio < seen.ratio) {
        seen.ratio = hit.ratio;
        seen.detail = hit.detail;
      }
    };

    /**
     * A :hover / :focus-visible finding only counts when it is WORSE than the
     * rest state of the same element -- same colour pair at the same ratio means
     * the border simply does not change on hover, and the rest entry already
     * carries it.
     *
     * Measured, not assumed: without this the first hover run produced 20 extra
     * findings and all 20 were byte-identical repeats of a rest-state entry --
     * the same defect filed five times (rest, light:hover, light:focus,
     * dark:hover, dark:focus). A register five times longer than the defect list
     * is one nobody reads, and it would have buried the case this pass exists
     * for: OBRS-575's hover was a DIFFERENT and worse pair than its rest
     * ($text-white on the accent fill, 2.03:1). That still reports, because a
     * different pair is a different key.
     */
    const coveredAtRest = (restKey: string, ratio: number) => {
      const rest = collapsed.get(restKey);
      return !!rest && rest.ratio <= ratio + 0.005;
    };

    const shortfalls: string[] = [];
    const totals = {
      text: 0,
      controls: 0,
      gradient: 0,
      opacity: 0,
      disabled: 0,
      invisible: 0,
      noSurface: 0,
      thirdParty: 0,
    };

    for (const target of CUSTOMER_PAGES) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
        const sheet = await context.newPage();
        try {
          await seedCustomerSession(sheet, dark);
          await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
          await sheet.waitForTimeout(2500);
          if (target.seed) {
            await seedStore(sheet);
            await sheet.waitForTimeout(1200);
          }

          const sweep = await sheet.evaluate(MEASURE);

          // The precondition, asserted rather than assumed. A renamed theme key
          // would otherwise measure the light theme twice and report both green
          // -- a theme test passing on the wrong background.
          expect(
            sweep.bodyIsDark,
            `${target.key}/${theme}: body.is-dark is ${sweep.bodyIsDark}. The theme did not apply, ` +
              `so this sweep measured the wrong palette.`
          ).toBe(dark);

          if (sweep.href !== target.landsOn) {
            shortfalls.push(
              `${target.key}/${theme}: landed on ${sweep.href}, expected ${target.landsOn} -- ` +
                `the page under test was never rendered`
            );
            continue;
          }

          // A stray alert dialog covers the page and every colour behind it is
          // measured through a modal that does not ship (OBRS backend-down swal).
          const swal = await sheet.locator('.swal2-popup').count();
          if (swal > 0) {
            shortfalls.push(`${target.key}/${theme}: ${swal} swal popup(s) over the page`);
            continue;
          }

          if (sweep.measuredText < target.minText) {
            shortfalls.push(
              `${target.key}/${theme}: only ${sweep.measuredText} scoreable text runs, expected at ` +
                `least ${target.minText}. Do not read this run as a pass -- the page did not render.`
            );
          }
          if (sweep.measuredControls < target.minControls) {
            shortfalls.push(
              `${target.key}/${theme}: only ${sweep.measuredControls} scoreable controls, expected at ` +
                `least ${target.minControls}.`
            );
          }

          for (const selector of target.mustRender) {
            if ((await sheet.locator(selector).count()) === 0) {
              shortfalls.push(
                `${target.key}/${theme}: "${selector}" rendered zero times. The page cleared its ` +
                  `population floor, so this would have passed as a clean sweep over a screen that ` +
                  `no longer contains the element the gate was built to watch.`
              );
            }
          }

          totals.text += sweep.measuredText;
          totals.controls += sweep.measuredControls;
          totals.gradient += sweep.skipped.gradient;
          totals.opacity += sweep.skipped.opacity;
          totals.disabled += sweep.skipped.disabled;
          totals.invisible += sweep.skipped.invisible;
          totals.noSurface += sweep.skipped.noSurface;
          totals.thirdParty += sweep.skipped.thirdParty;

          for (const f of sweep.text) {
            if (f.ratio >= f.floor) continue;
            record({
              key: textKey(theme, f),
              page: target.key,
              detail: `text ${f.fg} on ${f.bg} -- "${f.text}"  [${f.path}]`,
              ratio: f.ratio,
              floor: f.floor,
            });
          }

          for (const c of sweep.controls) {
            if (c.boundary >= AA_BOUNDARY) continue;
            record({
              key: boundaryKey(theme, c),
              page: target.key,
              detail:
                `boundary: fill ${c.fill ?? 'none'} (${c.fillVsPage.toFixed(2)}:1) / border ` +
                `${c.border ?? 'none'} (${c.borderVsPage === null ? 'n/a' : c.borderVsPage.toFixed(2) + ':1'}) ` +
                `on ${c.page} -- "${c.label}"  [${c.path}]`,
              ratio: c.boundary,
              floor: AA_BOUNDARY,
            });
          }

          // --- :hover and :focus-visible ---------------------------------
          //
          // Only the page's named controls, not all 150: a hover is a real
          // round trip (move the pointer, let the transition settle, re-read),
          // and a gate whose wall clock scales with the size of the DOM stops
          // being run. OBRS-575's hover state -- $text-white on the accent fill
          // at 2.03:1 -- was on a named control, and so is every case the two
          // cards that motivated this gate actually produced.
          for (const selector of target.hoverTargets) {
            const control = sheet.locator(selector).first();
            if ((await control.count()) === 0) continue;
            for (const state of ['hover', 'focus'] as const) {
              if (state === 'hover') await control.hover();
              else await control.focus();
              await sheet.waitForTimeout(250);
              const one = await sheet.evaluate(MEASURE, selector);
              const stateTheme = `${theme}:${state}`;
              for (const f of one.text) {
                if (f.ratio >= f.floor) continue;
                if (coveredAtRest(textKey(theme, f), f.ratio)) continue;
                record({
                  key: textKey(stateTheme, f),
                  page: target.key,
                  detail: `text ${f.fg} on ${f.bg} -- "${f.text}"  [${f.path}]`,
                  ratio: f.ratio,
                  floor: f.floor,
                });
              }
              for (const c of one.controls) {
                if (c.boundary >= AA_BOUNDARY) continue;
                if (coveredAtRest(boundaryKey(theme, c), c.boundary)) continue;
                record({
                  key: boundaryKey(stateTheme, c),
                  page: target.key,
                  detail:
                    `boundary: fill ${c.fill ?? 'none'} (${c.fillVsPage.toFixed(2)}:1) / border ` +
                    `${c.border ?? 'none'} (${c.borderVsPage === null ? 'n/a' : c.borderVsPage.toFixed(2) + ':1'}) ` +
                    `on ${c.page} -- "${c.label}"  [${c.path}]`,
                  ratio: c.boundary,
                  floor: AA_BOUNDARY,
                });
              }
            }
            // Park the pointer and the focus ring off the control, or the NEXT
            // selector is measured with this one still lit.
            await sheet.mouse.move(0, 0);
            await sheet.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
            await sheet.waitForTimeout(150);
          }
        } finally {
          await context.close();
        }
      }
    }

    // --- the report, printed whether the run is green or red ----------------
    const findings = [...collapsed.values()];
    const allowed = findings.filter((f) => CONTRAST_ALLOW[f.key]);
    const unexpected = findings.filter((f) => !CONTRAST_ALLOW[f.key]);
    const stale = Object.keys(CONTRAST_ALLOW).filter((k) => !collapsed.has(k));

    console.log('\ncustomer shell contrast gate (OBRS-584)');
    console.log(`  pages swept        : ${CUSTOMER_PAGES.length} x 2 themes`);
    console.log(`  text runs scored   : ${totals.text}`);
    console.log(`  controls scored    : ${totals.controls}`);
    console.log(`  skipped (gradient) : ${totals.gradient} -- backgroundColor is transparent under one, NOT a pass`);
    console.log(`  skipped (opacity)  : ${totals.opacity} -- composited by an opacity < 1, NOT a pass`);
    console.log(`  skipped (disabled) : ${totals.disabled} -- WCAG 1.4.3 / 1.4.11 exempt inactive components`);
    console.log(`  skipped (no surf.) : ${totals.noSurface} -- controls with neither fill nor border to bound`);
    console.log(`  skipped (3rd party): ${totals.thirdParty} -- markup this app does not own (Google Identity Services)`);
    console.log(`  skipped (hidden)   : ${totals.invisible}`);
    console.log(`  known-open (ALLOW) : ${allowed.length} of ${Object.keys(CONTRAST_ALLOW).length} entries still hit`);
    console.log(`  NEW below floor    : ${unexpected.length}`);

    if (process.env['CONTRAST_CENSUS']) {
      console.log('\n  --- every finding (CONTRAST_CENSUS=1) ---');
      for (const f of [...findings].sort((a, b) => a.ratio - b.ratio)) console.log(fmt(f));
    }

    expect(
      shortfalls.join('\n'),
      `\nThe sweep did not measure what it claims to measure. A gate with nothing to check is a\n` +
        `false green, not a pass:\n${shortfalls.map((s) => '  - ' + s).join('\n')}\n`
    ).toBe('');

    expect(
      stale.join('\n'),
      `\n${stale.length} CONTRAST_ALLOW entr(ies) no longer match anything. Delete them -- a debt\n` +
        `register that rots reads as a considered decision:\n${stale.map((s) => '  - ' + s).join('\n')}\n`
    ).toBe('');

    expect(
      unexpected.length,
      `\n${unexpected.length} contrast finding(s) below the WCAG AA floor with no CONTRAST_ALLOW entry:\n\n` +
        unexpected
          .sort((a, b) => a.ratio - b.ratio)
          .map(fmt)
          .join('\n') +
        `\n\nFix the colours, or add a CONTRAST_ALLOW entry naming the card that owns the fix.\n`
    ).toBe(0);
  });
});
