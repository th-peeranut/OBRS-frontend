/**
 * OBRS-767 -- the dark-override gate.
 *
 * Read `e2e/support/dark-override-effective.ts` first: it carries the argument
 * for why a declaration can be correct, matched, and still paint nothing, and
 * why only a browser can tell you which rule won.
 *
 * WHAT THIS GATE CLAIMS
 *
 *   Every declaration in dark-theme.scss either controls something, or is
 *   written down in the debt register with the card that owns it.
 *
 * WHAT IT DOES NOT CLAIM
 *
 *   Nothing about whether the value is the RIGHT value -- that is the contrast
 *   gate's job (customer-contrast-gate.spec.ts). These two are complementary
 *   and neither subsumes the other: a dead declaration can leave a passing
 *   colour behind (the theme-toggle rows in the register), and a live
 *   declaration can paint 2.4:1.
 *
 *   It also says nothing about `:hover`/`:focus` rules -- nothing matches those
 *   at rest. They are counted and printed, so "0 dead" is never quietly taken
 *   over a population that was skipped (OBRS-734).
 *
 * ASCII-only source.
 */
import { expect, test } from '@playwright/test';
import { CENSUS, deadKey, type DeadDeclaration } from '../support/dark-override-effective';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { DARK_OVERRIDE_ALLOW } from '../support/dark-override-allow';

/**
 * Two pages beyond the contrast gate's eight. dark-theme.scss section 5 is
 * written for login AND register, and section 9 for how-to-book; without them
 * a third of the file is unreachable and the census would report a clean sweep
 * over rules it never visited.
 */
const EXTRA_PAGES = [
  { key: 'register', url: '/register', seed: false },
  { key: 'how-to-book', url: '/how-to-book', seed: false },
];

const TARGETS = [
  ...CUSTOMER_PAGES.map((p) => ({ key: p.key, url: p.url, seed: !!p.seed })),
  ...EXTRA_PAGES,
];

/**
 * A floor on the population, for the same reason every page in the contrast
 * gate declares one: "0 dead declarations" is also what a sweep that rendered
 * nothing reports. Measured at 772 across the ten pages on the run that
 * established the register; 500 leaves room for ordinary edits to
 * dark-theme.scss while still going red if a third of the sweep stops
 * rendering.
 */
const MIN_JUDGED = 500;

test.describe('dark-mode overrides actually apply (OBRS-767)', () => {
  /**
   * The gate's own must-catch / must-NOT-catch, run before it is trusted to
   * report on the app -- OBRS-569 shipped a gate whose first run flagged 38
   * sites of which 17 were already correct, and OBRS-584 established that a
   * gate which cannot demonstrate it fires is prose.
   *
   * The fixture reproduces the real defect shape rather than a toy one: a
   * component-style rule carrying two `[_ngcontent]`-like attributes, which is
   * what Angular emits and what the global rule actually loses to.
   */
  test('the detector fires on the OBRS-767 shape and not on its fix', async ({ page }) => {
    await seedCustomerSession(page, true);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('is-dark')))
      .toBe(true);

    // Three evaluates rather than one: `page.evaluate(fn, arg)` serialises the
    // ARGUMENT as JSON, so CENSUS cannot be passed in. It has to be the
    // callback itself, exactly as the sweep below calls it -- which is the
    // point anyway. A self-test that exercised a copy of the detector would
    // prove nothing about the detector.
    const paintedBefore = await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'oc-fixture';
      style.textContent = [
        // 1. The defect. Component rule (0,4,0) vs global (0,3,1): global loses.
        '.oc-dead[_ngc-t] .oc-dead-leaf[_ngc-t] { color: rgb(83, 89, 104); }',
        'body.is-dark .oc-dead .oc-dead-leaf { color: rgb(154, 163, 184); }',
        // 2. The fix shape. What :host-context expands to -- host attribute on
        //    top of everything the component rule carries. Global wins.
        '.oc-live[_ngc-t] .oc-live-leaf[_ngc-t] { color: rgb(83, 89, 104); }',
        'body.is-dark [_ngh-t] .oc-live[_ngc-t] .oc-live-leaf[_ngc-t] { color: rgb(154, 163, 184); }',
        // 3. Loses, but asks for exactly what is already painted. Redundant,
        //    not broken, and must NOT be reported -- shorthand expansion makes
        //    hundreds of these and they would bury every real finding.
        '.oc-same[_ngc-t] .oc-same-leaf[_ngc-t] { color: rgb(83, 89, 104); }',
        'body.is-dark .oc-same .oc-same-leaf { color: rgb(83, 89, 104); }',
        // 4. Only reachable on :hover. Must be counted, never judged.
        'body.is-dark .oc-hover:hover { color: rgb(1, 2, 3); }',
        // 5. THE WINNER IS WRITTEN WITH var(). The CSSOM reads such a longhand
        //    back as the empty string, so removing and re-adding it destroys
        //    the declaration outright. That is not a wrong verdict, it is a
        //    corrupted page: this exact shape (theme-toggle's
        //    `border-color: var(--admin-outline, ...)`) made the first sample
        //    of /  wipe the winning rule, after which every later read saw the
        //    LOSING dark-theme value and reported it as alive. The detector
        //    must skip it and leave the page as it found it.
        'body.is-dark [_ngh-t] .oc-var[_ngc-t] { border-color: var(--oc-undefined, rgb(10, 20, 30)); }',
        'body.is-dark .oc-var { border-color: rgb(40, 50, 60); }',
        // 6. OBRS-774. A BORDER WIDTH that is applied and correct. The declared
        //    1px is normalised through a probe element, and a probe with no
        //    border-style computes every width to 0px -- so this read as
        //    "paints 1px, wants 0px" and put eight rows of `.btn-back` /
        //    `.back-btn` in the debt register with no defect behind them.
        //    It has to LOSE to be judged at all, so the component rule is the
        //    deeper one, and both ask for the same 1px and the same colour --
        //    leaving the width as the only thing under test.
        '.oc-w-p[_ngc-t] .oc-width[_ngc-t] { border: 1px solid rgb(9, 9, 9); }',
        'body.is-dark .oc-w-p .oc-width { border: 1px solid rgb(9, 9, 9); }',
        // 7. OBRS-774, and the one that cost the most. A TRANSITIONED element
        //    whose dark rule is fully in control. V1 is read in the same task
        //    that removed the declaration, and a transitioned property has not
        //    moved by then -- so V1 == V0 and a live declaration reads as dead.
        //    `.tab` (transition: all 0.2s), `.back-btn` (0.3s) and PrimeNG's
        //    nav links are all this shape; it is why eight register rows
        //    described no defect. The census freezes transitions first.
        //    The base rule below WINS on `.oc-trans` and is overridden on
        //    `.oc-trans.is-on` by its own variant, exactly as `.tab` is by
        //    `.tab.is-active`. Frozen, removing it moves the first element and
        //    the declaration is alive. Unfrozen, neither element moves, the
        //    variant's colour is not what the base asks for, and the two
        //    filters line up into a finding that describes nothing.
        '.oc-trans[_ngc-t] { color: rgb(83, 89, 104); transition: all 0.4s ease; }',
        'body.is-dark .oc-trans { color: rgb(154, 163, 184); }',
        'body.is-dark .oc-trans.is-on { color: rgb(75, 194, 247); }',
      ].join('\n');
      document.head.appendChild(style);

      const host = document.createElement('div');
      host.id = 'oc-host';
      host.setAttribute('_ngh-t', '');
      host.innerHTML =
        '<div class="oc-dead" _ngc-t><span class="oc-dead-leaf" _ngc-t>x</span></div>' +
        '<div class="oc-live" _ngc-t><span class="oc-live-leaf" _ngc-t>x</span></div>' +
        '<div class="oc-same" _ngc-t><span class="oc-same-leaf" _ngc-t>x</span></div>' +
        '<div class="oc-hover">x</div>' +
        '<div class="oc-var" _ngc-t>x</div>' +
        '<div class="oc-w-p" _ngc-t><div class="oc-width" _ngc-t>x</div></div>' +
        '<div class="oc-trans" _ngc-t>x</div>' +
        '<div class="oc-trans is-on" _ngc-t>x</div>';
      document.body.appendChild(host);

      return {
        dead: getComputedStyle(document.querySelector('.oc-dead-leaf')!).color,
        live: getComputedStyle(document.querySelector('.oc-live-leaf')!).color,
        varBorder: getComputedStyle(document.querySelector('.oc-var')!).borderTopColor,
        width: getComputedStyle(document.querySelector('.oc-width')!).borderTopWidth,
        trans: getComputedStyle(document.querySelector('.oc-trans.is-on')!).color,
      };
    });

    const res = await page.evaluate(CENSUS);

    // Longer than `.oc-trans`'s 0.4s transition. The census freezes transitions
    // while it measures and releases them at the end, so a transitioned element
    // is briefly mid-flight afterwards -- reading `paintedAfter` immediately
    // catches it there and reports a restore failure that is really a moving
    // element. The assertion is "the page settles back to what it was", so give
    // it the chance to settle (OBRS-774).
    await page.waitForTimeout(700);

    const paintedAfter = await page.evaluate(() => {
      const after = {
        dead: getComputedStyle(document.querySelector('.oc-dead-leaf')!).color,
        live: getComputedStyle(document.querySelector('.oc-live-leaf')!).color,
        varBorder: getComputedStyle(document.querySelector('.oc-var')!).borderTopColor,
        width: getComputedStyle(document.querySelector('.oc-width')!).borderTopWidth,
        trans: getComputedStyle(document.querySelector('.oc-trans.is-on')!).color,
      };
      document.getElementById('oc-host')?.remove();
      document.getElementById('oc-fixture')?.remove();
      return after;
    });

    const mine = res.dead.filter((d) => d.selector.includes('.oc-'));
    const keys = mine.map((d) => deadKey(d));

    // MUST CATCH: the real shape, with the values it actually paints.
    expect(keys).toContain('body.is-dark .oc-dead .oc-dead-leaf :: color');
    const found = mine.find((d) => d.selector === 'body.is-dark .oc-dead .oc-dead-leaf');
    expect(found?.painted).toBe('rgb(83, 89, 104)');
    expect(found?.wanted).toBe('rgb(154, 163, 184)');

    // MUST NOT CATCH: the fix, and the merely-redundant declaration.
    expect(keys).not.toContain('body.is-dark [_ngh-t] .oc-live[_ngc-t] .oc-live-leaf[_ngc-t] :: color');
    expect(keys).not.toContain('body.is-dark .oc-same .oc-same-leaf :: color');

    // The var() winner is not judged, and the rule it beats IS reported --
    // being unable to inspect the winner does not excuse missing the loser.
    expect(res.unjudgeableCount).toBeGreaterThan(0);
    expect(keys).toContain('body.is-dark .oc-var :: border-top-color');
    expect(paintedBefore.varBorder).toBe('rgb(10, 20, 30)');

    // MUST NOT CATCH (OBRS-774): a border width that is applied and correct.
    // Before the normaliser gave its probe a border-style, EVERY width read as
    // "wants 0px" -- eight rows of debt that described nothing.
    expect(paintedBefore.width).toBe('1px');
    expect(keys.filter((k) => k.includes('.oc-width'))).toEqual([]);

    // MUST NOT CATCH (OBRS-774): a live declaration on a TRANSITIONED element.
    // Unfrozen this is reported, because the transition hides the removal and
    // the variant next to it paints something the base never asked for. It is
    // the single largest source of the debt register's false rows.
    expect(paintedBefore.trans).toBe('rgb(75, 194, 247)');
    expect(keys).not.toContain('body.is-dark .oc-trans :: color');

    // COUNTED, NOT JUDGED.
    expect(res.statefulCount).toBeGreaterThan(0);

    // RESTORED. The census mutates the live CSSOM; a gate that leaves the page
    // in a different state than it found it would corrupt whatever runs next.
    expect(paintedAfter).toEqual(paintedBefore);
  });

  test('no dark-theme.scss declaration is dead outside the debt register', async ({ page }) => {
    // Ten page loads plus a full CSSOM walk each. The lane's 60s default is
    // sized for a single-page spec; this one measures ~70s.
    test.setTimeout(240_000);

    const seen = new Map<string, { d: DeadDeclaration; pages: Set<string>; instances: number }>();
    const observed = new Set<string>();
    const judgedDistinct = new Set<string>();
    let judged = 0;
    let stateful = 0;
    let unmatched = 0;
    let unjudgeable = 0;
    let animatedProps = 0;

    for (const t of TARGETS) {
      await seedCustomerSession(page, true);
      if (t.seed) await seedStore(page);
      await page.goto(t.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // The whole measurement is meaningless if the page is not in dark mode,
      // and "not dark" reports zero dead declarations -- a clean pass.
      const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
      expect(isDark, `${t.key} never entered dark mode -- the census would pass over nothing`).toBe(true);

      // TWO SAMPLES, and a declaration counts as dead only if it is dead in
      // BOTH. Not defensive padding -- measured: `.p-selectbutton
      // .p-button.p-highlight` reads `transparent` on some loads and
      // `rgb(75,194,247)` on others, because PrimeNG settles that fill after
      // first paint. One sample makes that entry appear and disappear between
      // runs, which is a red build with no defect behind it and the fastest
      // way to teach people to re-run a gate until it is green. Intersecting
      // two samples drops any transient without special-casing this one.
      const s1 = await page.evaluate(CENSUS);
      await page.waitForTimeout(700);
      const s2 = await page.evaluate(CENSUS);

      judged += s1.judgedCount;
      stateful += s1.statefulCount;
      unmatched += s1.unmatchedCount;
      unjudgeable += s1.unjudgeableCount;
      animatedProps += s1.animatedPropCount;
      for (const s of s1.observed) observed.add(s);
      for (const s of s2.observed) observed.add(s);
      for (const k of s1.judged) judgedDistinct.add(k);

      const alsoDead = new Set(s2.dead.map(deadKey));
      const stableDead = s1.dead.filter((d) => alsoDead.has(deadKey(d)));

      for (const d of stableDead) {
        const k = deadKey(d);
        const cur = seen.get(k) ?? { d, pages: new Set<string>(), instances: 0 };
        cur.pages.add(t.key);
        cur.instances += d.matched;
        seen.set(k, cur);
      }
    }

    console.log(
      `[OBRS-767] ${TARGETS.length} pages, ${judged} declaration-instances judged at rest ` +
        `(${judgedDistinct.size} distinct declarations -- the footer is judged once per page, ` +
        `so the two numbers answer different questions), ` +
        `${seen.size} dead, ${Object.keys(DARK_OVERRIDE_ALLOW).length} registered as known debt.\n` +
        `           NOT judged: ${stateful} reachable only in a :hover/:focus state, ` +
        `${unmatched} whose selector matched no element here, ` +
        `${unjudgeable} written with var() and unreadable from the CSSOM, ` +
        `${animatedProps} transition/animation declarations the census suppresses to measure at all (OBRS-774).`
    );

    expect(
      judged,
      `only ${judged} declarations could be judged (floor ${MIN_JUDGED}) -- the sweep did not render`
    ).toBeGreaterThanOrEqual(MIN_JUDGED);

    const unregistered = [...seen.entries()].filter(([k]) => !(k in DARK_OVERRIDE_ALLOW));
    if (unregistered.length) {
      const report = unregistered
        .map(
          ([k, v]) =>
            `  ${k}\n      paints ${v.d.painted}, declares ${v.d.wanted}` +
            ` -- x${v.instances} e.g. <${v.d.sample}> on ${[...v.pages].join(',')}`
        )
        .join('\n');
      throw new Error(
        `${unregistered.length} dark-mode declaration(s) never apply to anything.\n` +
          'The rule is in dark-theme.scss, its selector matches, and removing it changes nothing on\n' +
          'the page -- something more specific wins. See src/styles/_dark-tokens.scss for where the\n' +
          'rule belongs instead. If it is known debt, register it in e2e/support/dark-override-allow.ts\n' +
          'against a card.\n' +
          report
      );
    }

    // The register must not outlive what it describes -- an entry for a
    // declaration that now works makes it a document about a codebase that no
    // longer exists, and that is how an allow-list quietly becomes a lie.
    //
    // But "not dead" and "not looked at" are different things, and only the
    // first is a stale entry. Some selectors here are transient PrimeNG states
    // (`.p-button.p-highlight`) that render on some runs and not others; a
    // check that could not tell them apart would go red with no defect behind
    // it, and a gate people re-run until it is green is not a gate. So an
    // entry is stale only if its SELECTOR was seen carrying elements while the
    // declaration was not dead. Entries whose selector was never reachable are
    // printed instead -- unproven, not passed.
    const registered = Object.keys(DARK_OVERRIDE_ALLOW);
    const selectorOf = (k: string) => k.slice(0, k.lastIndexOf(' :: '));
    const stale = registered.filter((k) => !seen.has(k) && observed.has(selectorOf(k)));
    const unreachable = registered.filter((k) => !seen.has(k) && !observed.has(selectorOf(k)));
    if (unreachable.length) {
      console.log(
        `[OBRS-767] ${unreachable.length} registered entr(ies) could not be judged this run -- their ` +
          `selector matched no element on any swept page:\n           ${unreachable.join('\n           ')}`
      );
    }
    expect(
      stale,
      'DARK_OVERRIDE_ALLOW entries whose declaration now applies -- delete them, the debt is paid'
    ).toEqual([]);
  });
});
