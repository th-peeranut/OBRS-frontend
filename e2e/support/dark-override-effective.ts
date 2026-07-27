/**
 * OBRS-767 -- does a dark-mode override actually paint anything?
 *
 * THE DEFECT CLASS THIS EXISTS FOR
 *
 * `src/styles/dark-theme.scss` states its own approach in its header:
 * component stylesheets use build-time `$variables` that nothing can reach at
 * runtime, so dark mode overrides them with explicit global selectors. The
 * first half is true. The second half quietly assumes a global selector can
 * outrank a component one, and Angular's emulated view encapsulation makes that
 * false for the commonest shape of rule in the file:
 *
 *     .menu-container .menu-text                            footer.component.scss
 *  -> .menu-container[_ngcontent-x] .menu-text[_ngcontent-x]        (0,4,0)
 *
 *     body.is-dark .menu-container .menu-text               dark-theme.scss
 *  -> body.is-dark .menu-container .menu-text                       (0,3,1)
 *
 * 4 beats 3 in the class column. The override loses, always, and leaves no
 * trace: the SCSS is valid, the selector matches the element, the build is
 * green, and the property never applies. The footer shipped that way for the
 * life of the feature -- #535968 on #1a1d27, 2.40:1 against a 4.5:1 floor, on
 * 176 element instances across 8 pages -- while reading in source like complete
 * dark support.
 *
 * WHY THIS CANNOT BE A SOURCE CHECK, AGAIN
 *
 * OBRS-584 made this argument for contrast and it applies here with less room
 * for doubt. A stylesheet parser can see both rules. It cannot see which one
 * WON, because winning is a property of the cascade, which exists only in a
 * browser, over a specific DOM, with a specific set of loaded sheets. Writing a
 * specificity calculator in the test would just move the guess: it would have
 * to model `:not()`, `:is()`, how Angular rewrites `:host-context`, which
 * sheets are present, and source order -- and it would be wrong in the same
 * confident direction as the bug.
 *
 * THE METHOD -- a mutation experiment, not a calculation
 *
 * For every CSSStyleRule in the live document whose selector mentions
 * `is-dark`, for every property it declares:
 *
 *     V0 = computed value on each matching element
 *     rule.style.removeProperty(prop)        <- take the declaration away
 *     V1 = computed value on each matching element
 *     restore the declaration verbatim (value + !important priority)
 *
 * V1 != V0 on some element means the declaration was the one in control there:
 * it WON. V1 == V0 everywhere means removing it changed nothing: it LOST.
 *
 * WHAT IS DELIBERATELY NOT A FINDING
 *
 *   * A losing declaration whose value is what the element already shows. Some
 *     other rule paints the same thing; the declaration is redundant, not
 *     broken, and no user can tell. Shorthand expansion produces these by the
 *     hundred -- `background: $dk-bg-card` becomes eight longhands of which
 *     seven are already `none`/`0%`/`repeat`. Filtering them is what takes the
 *     raw count from 255 to 48 (measured on dev before the fix).
 *   * `:hover` / `:focus` / `:active` rules. Nothing matches them at rest, so
 *     they are COUNTED and reported, never silently folded into the pass
 *     (OBRS-734).
 *   * A selector that matches no element on any swept page. Unreachable from
 *     this sweep is not the same as proven dead.
 *
 * WHY TRANSITIONS ARE SUPPRESSED FIRST (OBRS-774)
 *
 * V1 is read in the same task that removed the declaration. If the element has
 * a `transition` covering that property, the computed value at that instant is
 * still V0 -- the transition has not started animating -- so V1 == V0 and the
 * method calls a declaration dead that is fully in control. It is silent and it
 * is systematic: every property of every transitioned element reads as LOST.
 *
 * Most of those never surfaced, because a declaration that IS in control paints
 * what it asks for, and "paints what it asks for" is already not a finding. The
 * ones that surfaced were the elements owned by a deliberate more-specific
 * variant (`&.is-active`, `.p-highlight`): there the painted value legitimately
 * differs from the base declaration's, so the two filters lined up and produced
 * a finding with no defect behind it. That is where eight of OBRS-774's
 * thirty-one register rows came from -- `.tab` carries
 * `transition: all 0.2s`, `.back-btn` carries `transition: 0.3s`, and PrimeNG
 * transitions its nav links and buttons.
 *
 * So the census disables transitions and animations document-wide before it
 * measures anything, and restores the page afterwards. dark-theme.scss declares
 * no `transition` of its own (checked), and the suppression touches only
 * `transition-property`/`animation`, so it cannot shadow a declaration this
 * method judges. Any `transition-*`/`animation-*` declaration is skipped and
 * counted rather than judged under a rule the census itself installed.
 */

export interface DeadDeclaration {
  selector: string;
  prop: string;
  /** How many elements the selector matched across this page. */
  matched: number;
  /** Elements where removing the declaration changed the computed value. */
  won: number;
  /** What the element actually shows. */
  painted: string;
  /** What the declaration asks for, normalised the way the browser computes it. */
  wanted: string;
  /** First matching element, as tag + classes -- enough to find it by hand. */
  sample: string;
}

export interface CensusResult {
  dead: DeadDeclaration[];
  /**
   * Selectors that matched at least one element here, so a verdict on them
   * MEANS something. The debt register needs this to tell "this declaration
   * was fixed" (the selector was there and the declaration won) apart from
   * "the element did not render this run" (nothing to judge) -- treating the
   * second as the first turns a PrimeNG state that renders one run in ten into
   * a red build with no defect behind it.
   */
  observed: string[];
  /** Declarations that won on at least one element -- the healthy population. */
  aliveCount: number;
  /** Declarations only reachable in a :hover/:focus state. Counted, not judged. */
  statefulCount: number;
  /** Declarations whose selector matched nothing here. Counted, not judged. */
  unmatchedCount: number;
  /** Every declaration this page could judge at rest. The population floor. */
  judgedCount: number;
  /**
   * The same population as `judgedCount`, keyed `<selector-part> :: <prop>` so
   * the caller can de-duplicate across pages. `judgedCount` summed over a sweep
   * counts declaration *instances* -- the footer is judged once per page -- and
   * a reader will take that number for a count of declarations. Report both.
   */
  judged: string[];
  /**
   * Declarations written with `var()`, which the CSSOM reads back as empty and
   * this method therefore cannot judge. Counted, never passed over in silence.
   */
  unjudgeableCount: number;
  /**
   * `transition-*` / `animation-*` declarations, which the census cannot judge
   * because it suppresses both to measure anything at all. Counted, never
   * silently folded into the pass (OBRS-734, OBRS-774).
   */
  animatedPropCount: number;
}

/** The key a debt-register entry is filed under. */
export const deadKey = (d: { selector: string; prop: string }): string => `${d.selector} :: ${d.prop}`;

/**
 * Runs inside the page. Serialised by Playwright, so it must be a single
 * self-contained expression with no imports and no closure over module scope.
 */
export const CENSUS = (): CensusResult => {
  const STATEFUL = /:(hover|focus|focus-visible|focus-within|active|checked|disabled|target)\b/;
  const ANIMATED_PROP = /^(transition|animation)/;

  // Read the header: without this, a transitioned property never moves inside
  // the task that removed its declaration, and the whole element reads as dead.
  const freeze = document.createElement('style');
  freeze.id = 'oc-freeze';
  freeze.textContent =
    '*, *::before, *::after { transition-property: none !important; animation: none !important; }';
  document.head.appendChild(freeze);

  const flat: CSSStyleRule[] = [];
  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        // Only the media blocks in force at this viewport can be judged; the
        // others are not dead, they are not applicable.
        if (window.matchMedia(rule.conditionText).matches) walk(rule.cssRules);
        continue;
      }
      if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules);
        continue;
      }
      if (rule instanceof CSSStyleRule) flat.push(rule);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // A cross-origin sheet cannot be read. Nothing of ours is cross-origin.
    }
  }

  // Normalise a declared value the way the browser would compute it, so
  // "painted #535968, wants #9aa3b8" can be told apart from "painted exactly
  // what this rule asks for, just via a different rule".
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px';
  document.body.appendChild(probe);
  const norm = (prop: string, val: string): string => {
    let base = 'position:absolute;visibility:hidden;left:-9999px';
    // A border or outline WIDTH computes to 0px whenever its STYLE is `none`,
    // which is a bare div's default -- so `norm('border-top-width', '1px')`
    // answered `0px` and every width declaration in the file read as "paints
    // 1px, wants 0px". That is how OBRS-774 inherited eight register rows for
    // `.btn-back`/`.back-btn`, whose rule declares `border: 1px solid ...` and
    // whose elements paint exactly the 1px it asks for. Give the probe a style
    // so the width it is asked about can survive to the computed value.
    if (/^border(-(top|right|bottom|left))?-width$/.test(prop)) base += ';border-style:solid';
    if (prop === 'outline-width') base += ';outline-style:solid';
    probe.style.cssText = base;
    try {
      probe.style.setProperty(prop, val);
    } catch {
      return val;
    }
    return getComputedStyle(probe).getPropertyValue(prop);
  };

  const dead: DeadDeclaration[] = [];
  const observed = new Set<string>();
  const judged = new Set<string>();
  let aliveCount = 0;
  let statefulCount = 0;
  let unmatchedCount = 0;
  let judgedCount = 0;
  let unjudgeableCount = 0;
  let animatedPropCount = 0;

  for (const rule of flat) {
    if (!/\bis-dark\b/.test(rule.selectorText)) continue;

    const parts = rule.selectorText.split(',').map((s) => s.trim()).filter(Boolean);
    const props = Array.from(rule.style);
    if (!props.length) continue;

    const restParts = parts.filter((p) => !STATEFUL.test(p));
    statefulCount += (parts.length - restParts.length) * props.length;
    if (!restParts.length) continue;

    // The element population is fixed for the whole rule; find it once.
    const pop = new Map<string, Element[]>();
    for (const part of restParts) {
      try {
        const els = Array.from(document.querySelectorAll(part));
        pop.set(part, els);
        if (els.length) observed.add(part);
      } catch {
        pop.set(part, []);
      }
    }

    for (const prop of props) {
      // Suppressed above to make any measurement possible at all, so this
      // census has nothing honest to say about them.
      if (ANIMATED_PROP.test(prop)) {
        animatedPropCount++;
        continue;
      }
      const declared = rule.style.getPropertyValue(prop);

      // A longhand of a shorthand written with var() -- `border-color:
      // var(--admin-outline, rgba(255,255,255,0.15))` -- reads back as the
      // EMPTY STRING here, because substitution happens at computed-value time
      // and the CSSOM cannot expand it. Two things follow, and the second one
      // cost a debugging round:
      //   1. There is no declared value to compare against, so no verdict.
      //   2. Removing and re-adding it DESTROYS the declaration. That is not a
      //      false finding, it is a corrupted page: the first sample of home
      //      wiped theme-toggle's `border-color` and every later read saw the
      //      dark-theme value winning a fight it had actually lost. A gate that
      //      changes what it measures reports on a document that never shipped.
      // So: skip it, and restore by cssText below rather than by re-setting
      // the property, which cannot round-trip a var().
      if (declared === '') {
        unjudgeableCount++;
        continue;
      }

      const wanted = norm(prop, declared);
      const savedCssText = rule.style.cssText;

      const before = new Map<string, string[]>();
      for (const [part, els] of pop) {
        before.set(part, els.map((el) => getComputedStyle(el).getPropertyValue(prop)));
      }

      rule.style.removeProperty(prop);

      for (const [part, els] of pop) {
        if (!els.length) {
          unmatchedCount++;
          continue;
        }
        const v0 = before.get(part)!;
        let won = 0;
        els.forEach((el, i) => {
          if (getComputedStyle(el).getPropertyValue(prop) !== v0[i]) won++;
        });
        judgedCount++;
        judged.add(part + ' :: ' + prop);
        if (won > 0) {
          aliveCount++;
          continue;
        }
        // Lost. Only a finding on the elements where what is painted differs
        // from what it asks for -- elsewhere some other rule already does the
        // same job. Judged per ELEMENT, not off `v0[0]`: a rule with a
        // deliberate `&.is-active` variant paints that one element differently
        // BY DESIGN, and keying the verdict on whichever element happened to be
        // first made the whole declaration look defeated (OBRS-774).
        const candidates = els.map((_, i) => i).filter((i) => v0[i] !== wanted);
        if (!candidates.length) continue;
        const el = els[candidates[0]];
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        dead.push({
          selector: part,
          prop,
          matched: els.length,
          won,
          painted: v0[candidates[0]] ?? '',
          wanted,
          sample: el.tagName.toLowerCase() + cls,
        });
      }

      // Verbatim, not property-by-property: re-setting a property appends it
      // at the end of the block, which reorders declarations inside the rule.
      rule.style.cssText = savedCssText;
    }
  }

  probe.remove();
  freeze.remove();
  return {
    dead,
    observed: Array.from(observed),
    aliveCount,
    statefulCount,
    unmatchedCount,
    judgedCount,
    judged: Array.from(judged),
    unjudgeableCount,
    animatedPropCount,
  };
};
