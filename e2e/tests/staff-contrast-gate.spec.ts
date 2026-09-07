/**
 * The staff-shell contrast gate (OBRS-812).
 *
 * Read `e2e/support/staff-pages.ts` first -- it carries the fixtures, the floors
 * and the argument for why the staff pages are a second list rather than more
 * `CUSTOMER_PAGES` entries.
 *
 * WHAT THIS ADDS THAT `customer-contrast-gate.spec.ts` DOES NOT
 *
 * That gate sweeps twenty entries and every one of them is a customer route. So
 * `/staff/*` and `/admin/*` have never been scored by anything that runs in CI,
 * and a staff-side contrast fix has had nothing watching it. OBRS-797 is the case
 * that named the gap: it moved `.admin-field::placeholder` in dark mode from
 * 3.32:1 to 7.18:1 on the boarding scan box, and BOTH numbers came from a probe
 * written for that one card, in the office repo, which CI does not run. The
 * customer half of the same card is covered by invariant C on every push.
 *
 * The mutation test below is the proof that this file closes that specific gap
 * rather than merely reporting on the same pages in a new shape.
 *
 * WHAT IS DELIBERATELY NOT DUPLICATED FROM THE CUSTOMER GATE
 *
 *   * ITS MUST-CATCH / MUST-NOT-CATCH FIXTURE. That test pins `MEASURE`'s
 *     luminance maths and its compositing walk against the OBRS-575 and OBRS-797
 *     hex pairs, in the same lane, on every run. `MEASURE` is imported here
 *     unchanged, so a second copy of that pinning would fail in the same run for
 *     the same reason and prove nothing further.
 *   * THE :hover / :focus-visible PASS. Every finding this sweep produces is a
 *     rest-state control boundary; not one of the four pages carries a control
 *     whose defect is a hover-only colour pair, which is the case that pass was
 *     built for (OBRS-575's 2.03:1 hover). Adding it would cost four pointer
 *     round trips per named control per page per theme for a population this
 *     card measured as empty. `StaffPage` has no `hoverTargets` for that reason:
 *     the day one is needed, the field and the pass arrive together.
 *
 * WHAT IS DUPLICATED ON PURPOSE, so the next reader does not mistake it for an
 * oversight. The verdict layer below -- `Row`, `fmt`, `record`, the shortfall and
 * totals accumulation, and the `unmatched` / `unmeasured` / `stale` split that
 * OBRS-1435 paid for -- is roughly a hundred lines that also exist in
 * `customer-contrast-gate.spec.ts`. Consolidating it would mean editing that
 * file, which is the repo's live merge gate, for a card that adds no customer
 * page and changes no customer behaviour. It would also have to put `collapsed`
 * and `measured` somewhere both specs can reach: module scope, shared across two
 * spec files in one worker process, which is the exact hazard
 * `staff-pages.ts` refuses `mockEmptyBackend` over. The duplication is a real
 * future maintenance cost and is recorded as one; it is not an accident, and the
 * two copies must be changed together if the OBRS-1435 logic ever moves.
 *
 * COST. Measured 2026-09-05, see the wall clock this spec prints.
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { AA_BOUNDARY, MEASURE, boundaryKey, keyIdentity, placeholderKey, textKey } from '../support/customer-contrast';
import { STAFF_PAGES, seedStaffSweepSession, staffSweepBudgetMs, stripAdminFieldPlaceholderRules } from '../support/staff-pages';
import { STAFF_CONTRAST_ALLOW } from '../support/staff-contrast-allow';

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

test.describe('staff shell contrast gate (OBRS-812)', () => {
  /**
   * Same property the customer register is pinned against, and it earns its place
   * on this register independently: `.admin-field` and `.admin-btn` appear on
   * three of the four pages here on DIFFERENT surfaces, which is precisely the
   * shape that produced the customer register's three near-collisions (OBRS-1435).
   *
   * No browser, no page loads.
   */
  test('no two STAFF_CONTRAST_ALLOW entries share a keyIdentity', () => {
    const byIdentity = new Map<string, string[]>();
    for (const key of Object.keys(STAFF_CONTRAST_ALLOW)) {
      const id = keyIdentity(key);
      byIdentity.set(id, [...(byIdentity.get(id) ?? []), key]);
    }
    const collided = [...byIdentity.entries()].filter(([, keys]) => keys.length > 1);
    const report = collided.flatMap(([id, keys]) => ['  ' + id, ...keys.map((k) => '      ' + k)]);

    expect(
      report.join('\n'),
      `\n${collided.length} keyIdentity collision(s). Each is a pair of entries that would vouch for\n` +
        `each other: score either one and the gate pronounces the OTHER paid without measuring it,\n` +
        `which is the OBRS-1435 false delete. Widen keyIdentity until they are distinct -- do not\n` +
        `merge or delete the entries to make this pass.\n${report.join('\n')}\n`
    ).toBe('');
  });

  /**
   * The mutation test OBRS-812 was opened with, run against the LIVE stylesheet
   * rather than against the source.
   *
   * Deleting the rule from `admin-theme.scss` and re-running by hand proves the
   * same thing once, on one machine, and then tells nobody. This removes the rule
   * from the CSSOM in the browser -- the technique `dark-override-effective.spec.ts`
   * uses for the same reason -- and asserts the placeholder falls back to the UA
   * default, below AA, the way it did before OBRS-797.
   *
   * THE NUMBER IS NOT THE ONE ON THE CARD, AND THAT IS A FINDING, NOT A MISS.
   * OBRS-812 asks for 3.32:1, which is what OBRS-797 measured on 2026-07-28.
   * Measured here on 2026-09-05: 3.48:1, because the colour it falls back to is
   * `#757575` and not the `#6b7280` that card recorded. That is Chromium's UA
   * default placeholder colour, and it moved between the two runs -- provable
   * without arguing about browser versions, because the LIGHT sweep in this same
   * file measures the very same input at `#757575` on `#ffffff` (4.61:1) with no
   * OBRS-797 rule in play at all: the rule is `.is-dark`-scoped, so light mode has
   * always been showing the UA default. The mechanism the card describes is
   * intact; only the shade of grey Chrome ships has moved. Asserted as a BAND for
   * that reason -- a hard 3.32 would have gone red on a browser upgrade and said
   * "the fixture broke", which is the one thing it must never say wrongly.
   *
   * What it is really asserting is that the fixture reaches the real control. A
   * sweep whose boarding page rendered an empty shell would report "0 below AA"
   * here forever; this run cannot, because it has to produce a sub-AA ratio on
   * demand.
   */
  test('removing the OBRS-797 rule drops the boarding placeholder back to its pre-fix ratio', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
    const sheet = await context.newPage();
    try {
      const boarding = STAFF_PAGES.find((p) => p.key === 'staff-boarding');
      expect(boarding, 'the staff-boarding entry is what this test mutates').toBeTruthy();

      await seedStaffSweepSession(sheet, true, boarding!.fixture ?? []);
      await sheet.goto(boarding!.url, { waitUntil: 'domcontentloaded' });
      await sheet.waitForTimeout(2500);

      // Read the fixed value first, so a page that failed to render fails HERE
      // and not as a mutation that "worked".
      const before = await sheet.evaluate(MEASURE, '.admin-field.boarding-scan-input');
      expect(
        before.placeholders.length,
        'the boarding scan box did not paint a placeholder -- the mutation below would prove nothing'
      ).toBe(1);
      expect(before.placeholders[0].ratio).toBeGreaterThanOrEqual(7);

      // Delete every `.admin-field` ::placeholder declaration OBRS-797 added,
      // matched on the selector text rather than on a rule index, which moves
      // with every unrelated edit to admin-theme.scss. Shared with
      // obrs-812-capture.spec.ts, which reconstructs the same BEFORE state.
      const removed = await sheet.evaluate(stripAdminFieldPlaceholderRules);
      expect(removed, 'no `.admin-field ... ::placeholder` rule was found to remove').toBeGreaterThan(0);

      const after = await sheet.evaluate(MEASURE, '.admin-field.boarding-scan-input');
      expect(after.placeholders.length).toBe(1);
      const ratio = after.placeholders[0].ratio;
      console.log(
        `\nOBRS-812 mutation: removed ${removed} rule(s); boarding placeholder ` +
          `${before.placeholders[0].fg} ${before.placeholders[0].ratio.toFixed(2)}:1 -> ` +
          `${after.placeholders[0].fg} ${ratio.toFixed(2)}:1`
      );
      expect(
        ratio,
        `The placeholder still clears AA with the OBRS-797 rule gone. Either the fixture is no ` +
          `longer rendering the real control, or something else is now theming it -- in both cases ` +
          `this gate is no longer watching what it claims to watch.`
      ).toBeLessThan(4.5);
      // The band, not a point. 3.48:1 measured 2026-09-05; 3.32:1 on OBRS-797's
      // 2026-07-28 run. Both are the same UA-default mechanism at two different
      // Chromium greys -- see the docblock. Wide enough to survive that, narrow
      // enough that a real theming change lands outside it.
      expect(ratio).toBeGreaterThan(3.0);
      expect(ratio).toBeLessThan(3.7);
    } finally {
      await context.close();
    }
  });

  test('every staff text run and control surface is at or above its WCAG AA floor', async ({ browser }) => {
    test.setTimeout(staffSweepBudgetMs(2));

    /** One row per DEFECT, accumulated across all eight sweeps. */
    const collapsed = new Map<string, Row>();
    /** Every identity the sweep actually SCORED, passing rows included (OBRS-1435). */
    const measured = new Set<string>();

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

    const shortfalls: string[] = [];
    const totals = {
      text: 0,
      controls: 0,
      placeholders: 0,
      gradient: 0,
      opacity: 0,
      disabled: 0,
      invisible: 0,
      noSurface: 0,
      thirdParty: 0,
    };
    const startedAt = Date.now();

    for (const target of STAFF_PAGES) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
        const sheet = await context.newPage();
        try {
          await seedStaffSweepSession(sheet, dark, target.fixture ?? []);
          await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
          await sheet.waitForTimeout(2500);

          // The precondition, asserted rather than assumed. A renamed theme key
          // would otherwise measure the light theme twice and report both green.
          const themeApplied = await sheet.evaluate(() => document.body.classList.contains('is-dark'));
          expect(
            themeApplied,
            `${target.key}/${theme}: body.is-dark is ${themeApplied}. The theme did not apply, ` +
              `so this sweep measured the wrong palette.`
          ).toBe(dark);

          const href = await sheet.evaluate(() => location.pathname);
          if (href !== target.landsOn) {
            shortfalls.push(
              `${target.key}/${theme}: landed on ${href}, expected ${target.landsOn} -- ` +
                `the page under test was never rendered`
            );
            continue;
          }

          // The clicks that reach a control the first paint does not render. A
          // failure here is a shortfall and not an exception, so one broken screen
          // names itself instead of ending the sweep for the other seven.
          if (target.act) {
            try {
              await target.act(sheet);
              await sheet.waitForTimeout(500);
            } catch (e) {
              shortfalls.push(
                `${target.key}/${theme}: act() failed -- ${(e as Error).message.split('\n')[0]}. The ` +
                  `controls it opens were not measured.`
              );
              continue;
            }
          }

          const sweep = await sheet.evaluate(MEASURE);

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
          if (sweep.measuredPlaceholders < (target.minPlaceholders ?? 0)) {
            shortfalls.push(
              `${target.key}/${theme}: only ${sweep.measuredPlaceholders} scoreable placeholder(s), ` +
                `expected at least ${target.minPlaceholders}. These are the OBRS-797 fields.`
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
          totals.placeholders += sweep.measuredPlaceholders;
          totals.gradient += sweep.skipped.gradient;
          totals.opacity += sweep.skipped.opacity;
          totals.disabled += sweep.skipped.disabled;
          totals.invisible += sweep.skipped.invisible;
          totals.noSurface += sweep.skipped.noSurface;
          totals.thirdParty += sweep.skipped.thirdParty;

          for (const f of sweep.text) {
            measured.add(keyIdentity(textKey(theme, f)));
            if (f.ratio >= f.floor) continue;
            record({
              key: textKey(theme, f),
              page: target.key,
              detail: `text ${f.fg} on ${f.bg} -- "${f.text}"  [${f.path}]`,
              ratio: f.ratio,
              floor: f.floor,
            });
          }

          for (const f of sweep.placeholders) {
            measured.add(keyIdentity(placeholderKey(theme, f)));
            if (f.ratio >= f.floor) continue;
            record({
              key: placeholderKey(theme, f),
              page: target.key,
              detail: `placeholder ${f.fg} on ${f.bg} -- "${f.text}"  [${f.path}]`,
              ratio: f.ratio,
              floor: f.floor,
            });
          }

          for (const c of sweep.controls) {
            measured.add(keyIdentity(boundaryKey(theme, c)));
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
        } finally {
          await context.close();
        }
      }
    }

    const findings = [...collapsed.values()];
    const allowed = findings.filter((f) => STAFF_CONTRAST_ALLOW[f.key]);
    const unexpected = findings.filter((f) => !STAFF_CONTRAST_ALLOW[f.key]);
    const unmatched = Object.keys(STAFF_CONTRAST_ALLOW).filter((k) => !collapsed.has(k));
    const unmeasured = unmatched.filter((k) => !measured.has(keyIdentity(k)));
    const stale = unmatched.filter((k) => measured.has(keyIdentity(k)));

    console.log('\nstaff shell contrast gate (OBRS-812)');
    console.log(`  pages swept        : ${STAFF_PAGES.length} x 2 themes`);
    console.log(`  wall clock         : ${((Date.now() - startedAt) / 1000).toFixed(1)} s for the sweep`);
    console.log(`  text runs scored   : ${totals.text}`);
    console.log(`  controls scored    : ${totals.controls}`);
    console.log(`  placeholders scored: ${totals.placeholders} -- ::placeholder, composited (OBRS-797)`);
    console.log(`  skipped (gradient) : ${totals.gradient} -- backgroundColor is transparent under one, NOT a pass`);
    console.log(`  skipped (opacity)  : ${totals.opacity} -- composited by an opacity < 1, NOT a pass`);
    console.log(`  skipped (disabled) : ${totals.disabled} -- WCAG 1.4.3 / 1.4.11 exempt inactive components`);
    console.log(`  skipped (no surf.) : ${totals.noSurface} -- controls with neither fill nor border to bound`);
    console.log(`  skipped (3rd party): ${totals.thirdParty} -- markup this app does not own`);
    console.log(`  skipped (hidden)   : ${totals.invisible}`);
    console.log(`  known-open (ALLOW) : ${allowed.length} of ${Object.keys(STAFF_CONTRAST_ALLOW).length} entries still hit`);
    console.log(`  ALLOW not measured : ${unmeasured.length} -- element never scored this run, verdict withheld (OBRS-1435)`);
    console.log(`  ALLOW stale        : ${stale.length} -- element WAS scored and no longer matches`);
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

    // Read before the stale check on purpose: this is the weaker claim, and a run
    // that could not measure an element has not earned the right to make the
    // stronger one about it.
    expect(
      unmeasured.join('\n'),
      `\n${unmeasured.length} STAFF_CONTRAST_ALLOW entr(ies) name an element this run NEVER MEASURED.\n` +
        `DO NOT DELETE THEM -- nothing here says the debt was paid, only that the sweep did not\n` +
        `score that element. Find out why, then re-run (OBRS-1435).\n` +
        `${unmeasured.map((s) => '  - ' + s).join('\n')}\n`
    ).toBe('');

    expect(
      stale.join('\n'),
      `\n${stale.length} STAFF_CONTRAST_ALLOW entr(ies) were MEASURED this run and no longer match.\n` +
        `Delete them -- a debt register that rots reads as a considered decision. The element was\n` +
        `scored, so this is a repaint or a fix, not a page that failed to render:\n` +
        `${stale.map((s) => '  - ' + s).join('\n')}\n`
    ).toBe('');

    expect(
      unexpected.length,
      `\n${unexpected.length} contrast finding(s) below the WCAG AA floor with no STAFF_CONTRAST_ALLOW entry:\n\n` +
        unexpected
          .sort((a, b) => a.ratio - b.ratio)
          .map(fmt)
          .join('\n') +
        `\n\nFix the colours, or add a STAFF_CONTRAST_ALLOW entry naming the card that owns the fix.\n`
    ).toBe(0);
  });
});
