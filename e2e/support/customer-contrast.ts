/**
 * Runtime contrast measurement for the CUSTOMER shell (OBRS-584).
 *
 * WHY THIS IS A RUNTIME GATE AND NOT ANOTHER SOURCE PARSER
 *
 * OBRS-575 shipped `.recent-route-btn` at 2.79:1 on the dark Home card while
 * `check-admin-theme-tokens.mjs` and `check-brand-fill-contrast.mjs` both ran
 * green in CI. Neither was broken. The failure mode was OMISSION, not a wrong
 * value: before the fix, `dark-theme.scss` contained no `.recent-route-btn`
 * selector at all. The component declared `color: $brand-customer-strong` in its
 * own stylesheet and dark mode simply inherited it, because nobody wrote an
 * override. A parser that reads what IS declared cannot see what was NEVER
 * written, and the admin gate only works because `--admin-*` custom properties
 * can be enumerated from the file -- the customer side uses SCSS `$variables`,
 * which are gone by build time.
 *
 * The second structural blind spot is the CASCADE. `check-brand-fill-contrast`
 * has to see `color` and `background` in the same rule block, and deliberately
 * refuses to inherit through a descendant combinator (pairing a background with
 * text that is not in the same box is how a contrast gate becomes noise). So the
 * booking stepper -- `#b0d4e8` label on a `#edf9fe` panel it inherits from an
 * ancestor, 1.46:1, 35 sites, in LIGHT mode -- is invisible to it by
 * construction. Only a browser knows what an element is actually painted on.
 *
 * So: open the real pages in a real browser, in both themes, and read
 * `getComputedStyle`.
 *
 * WHAT IS MEASURED -- FOUR INVARIANTS, NOT ONE
 *
 *   A. TEXT (WCAG 1.4.3). Every element that renders its own text run, against
 *      the background actually painted behind it (composited up the ancestor
 *      chain). 4.5:1, or 3.0:1 for large text.
 *
 *   B. BOUNDARY (WCAG 1.4.11). An interactive control's own surface against the
 *      surface it sits on, 3.0:1, with a visible border allowed to carry the
 *      boundary for a control whose fill is too faint to read as a surface of its
 *      own (below 1.5:1 on the page) -- but never for one that paints a real
 *      surface (design-system §2.6 clause 2, OBRS-1782). This is a DIFFERENT criterion and no
 *      contrast-of-text check can see it: OBRS-746 measured `.btn-search` at
 *      2.80:1 fill-vs-page in dark mode with a perfectly legible white label.
 *      Before OBRS-752 that same button was the opposite -- boundary fine, label
 *      2.03:1. Checking only one of the two turns a fix for it into a silent
 *      regression of the other.
 *
 *   C. PLACEHOLDER (WCAG 1.4.3 again, but unreachable by invariant A).
 *      `getComputedStyle(el, '::placeholder')` -- OBRS-797. Until that card this
 *      file called `getComputedStyle(n)` in six places and passed a second
 *      argument in NONE of them, so every pseudo-element was invisible to the
 *      gate BY CONSTRUCTION rather than by omission from CONTRAST_ALLOW. It was
 *      not reachable by widening invariant A either: `ownsText()` looks for a
 *      child text node and an `<input>` has no children, so the sweep would have
 *      to be blind to placeholders even if the pseudo were read for free.
 *
 *   D. STATE (WCAG 1.4.11 again, the half invariant B cannot reach). 1.4.11 asks
 *      3:1 of the visual information required to identify components "and
 *      states". B compares a control's own surface to the PAGE it sits on, which
 *      says nothing about whether the selected member of a group looks different
 *      from the unselected ones -- the pair a user actually has to tell apart.
 *      OBRS-772 measured that hole and wrote it down rather than fixing it
 *      (docs/design-system.md 2.6); OBRS-1774 is the fix. So: find the element
 *      the app marks as selected, find its unselected siblings, and compare the
 *      surfaces actually painted.
 *
 *      The rule applied to the result is the one the owner decided in 2.6 on
 *      2026-09-08, and it is NOT a straight reading of the standard: a state
 *      that rests on a faint fill ALONE is a defect, and a state that also
 *      carries a colour, a weight, a border or an underline is accepted --
 *      because the second signal is what the user reads, and the colour half of
 *      it is already scored by invariant A. Its known soft edge, stated rather
 *      than hidden: two text colours that both clear AA but barely differ from
 *      each other would be accepted here. Nothing in this file measures the
 *      distance between them, and inventing a floor for it would be inventing a
 *      rule the owner has not been asked about.
 *
 *      What it hid: eighteen customer fields at **1.10:1**. Bootstrap 5.3 paints
 *      `.form-control::placeholder` with `--bs-secondary-color` =
 *      rgba(33,37,41,.75), a theme-blind dark grey -- 6.78:1 on white, 1.10:1 on
 *      the dark input surface -- while the dark-mode sweep ran green over all of
 *      them for months. The alpha is load-bearing: read the pseudo's colour
 *      without compositing it and you get the ELEMENT's text colour, which
 *      scores those same eighteen fields as passing.
 *
 * THE THREE FALSE POSITIVES THIS REFUSES TO SCORE
 *
 * Measured for real on 2026-07-27, not anticipated. Each is counted and printed
 * rather than passed, because a gate that reports "0 below AA" over a population
 * it silently skipped is exactly the OBRS-734 failure (`getComputedStyle`
 * returns `rgba(0,0,0,0)` for a gradient, so every gradient-filled button was
 * skipped while the run reported full coverage):
 *
 *   1. GRADIENT surfaces. `backgroundColor` is transparent for them, so the
 *      composite walk would report the surface BEHIND the element -- the navbar
 *      avatar comes out "#ffffff on #ffffff = 1:1", which is not a defect, it is
 *      a measurement that does not exist. Detected by walking the same chain for
 *      a `background-image` and refusing to score.
 *   2. `opacity < 1` anywhere up the chain. Opacity composites the WHOLE
 *      subtree, text and fill together, against what is behind it; the number
 *      you get from the two computed colours is wrong in the flattering
 *      direction.
 *   3. DISABLED controls. WCAG 1.4.3/1.4.11 both exempt inactive components, and
 *      the whole point of greying one out is that it reads as unavailable.
 *
 * ASCII-only source. The colour maths is deliberately identical to
 * `src/app/testing/contrast.ts` (the karma-side helper) -- it cannot be imported
 * here because Playwright serialises `MEASURE` into the page, where module
 * scope does not exist. `contrast-maths.spec` inside the gate spec pins both
 * against the same published pairs so the copy cannot drift silently.
 */

/** WCAG AA floor for normal-size text. */
export const AA_TEXT = 4.5;
/** WCAG AA floor for large text (>=24px, or >=18.66px bold) and non-text. */
export const AA_LARGE = 3.0;
/** WCAG 1.4.11 floor for the boundary of a user-interface component. */
export const AA_BOUNDARY = 3.0;

export interface TextFinding {
  key: string;
  path: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  floor: number;
  count: number;
}

/**
 * A placeholder is text a user has to read to know what the field wants, so it
 * carries the same 1.4.3 floor as any other copy. `fg` is the pseudo-element's
 * colour ALREADY COMPOSITED over `bg` -- see the alpha note in the header.
 */
export interface PlaceholderFinding {
  key: string;
  path: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  floor: number;
  count: number;
}

export interface BoundaryFinding {
  key: string;
  path: string;
  label: string;
  fill: string | null;
  border: string | null;
  page: string;
  fillVsPage: number;
  borderVsPage: number | null;
  boundary: number;
  /**
   * Which of the two numbers above `boundary` actually is, so a register entry can
   * never again record a border ratio as the reason a FILL was accepted (OBRS-1782).
   * `'fill'` means design-system §2.6 clause 2 decided this row; `'border'` means
   * clause 1/3 did.
   */
  boundaryFrom: 'fill' | 'border';
  count: number;
}

/**
 * One selected control, weighed against the unselected sibling it is hardest to
 * tell apart from.
 *
 * `carriers` is the whole verdict, and it is computed here rather than on the
 * node side because it needs `getComputedStyle` on both elements at once. It
 * lists every signal that DIFFERS between the two -- `fill`, `color`, `weight`,
 * `border`, `underline`, `shadow`, `outline`. A row whose only carrier is `fill`
 * is the one the floor applies to.
 */
export interface StateFinding {
  key: string;
  path: string;
  label: string;
  selectedFill: string;
  siblingFill: string;
  siblingPath: string;
  fillVsSibling: number;
  /** Selected border against the sibling's border, or null when either paints none. */
  borderVsSibling: number | null;
  /** Selected outline against the sibling's outline, or null when either paints none. */
  outlineVsSibling: number | null;
  carriers: string[];
  count: number;
}

export interface Sweep {
  href: string;
  bodyIsDark: boolean;
  text: TextFinding[];
  controls: BoundaryFinding[];
  placeholders: PlaceholderFinding[];
  states: StateFinding[];
  /** Everything measured, not just what failed -- the denominator for the 0-match guard. */
  measuredText: number;
  measuredControls: number;
  measuredPlaceholders: number;
  measuredStates: number;
  skipped: {
    gradient: number;
    opacity: number;
    disabled: number;
    invisible: number;
    noSurface: number;
    thirdParty: number;
    /** A selected control with no unselected sibling on screen to compare it to. */
    stateNoPeer: number;
    /**
     * Selected and unselected compute IDENTICALLY on the marked element itself,
     * so whatever shows the state lives somewhere this comparison cannot see: a
     * descendant, a pseudo-element, an injected icon. Counted and printed, never
     * scored -- calling it a defect would be inventing one, and folding it into
     * the pass is the OBRS-734 failure.
     */
    stateNoDelta: number;
  };
}

/**
 * The browser-side sweep. Self-contained on purpose: Playwright stringifies this
 * and evaluates it in the page, so it can close over nothing.
 *
 * Returns EVERY element it could score, failing or not. The verdict is taken on
 * the node side, where the allowlist lives -- a browser-side filter would make
 * the skipped population invisible to the report.
 *
 * `only` narrows the sweep to one selector and its descendants. That is how the
 * :hover / :focus-visible pass reuses this function rather than growing a second
 * copy of the colour maths: Playwright hovers the element, then this runs over
 * just that subtree. OBRS-575 failed in BOTH states and by different amounts
 * ($text-white on the accent fill is 2.03:1, which the rest state never shows),
 * so a gate that only measures rest states would have reported half the defect.
 */
export const MEASURE = (only?: string): Sweep => {
  const rgba = (c: string): [number, number, number, number] => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };

  const lum = (c: number[]): number => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };

  const ratio = (a: number[], b: number[]): number => {
    const x = lum(a);
    const y = lum(b);
    return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
  };

  const hex = (c: number[]): string =>
    '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  /**
   * The colour actually painted behind `el`: composite every translucent layer
   * onto its ancestor, stopping at the first opaque one. Falls back to white
   * only when nothing in the chain paints at all, which is what a browser does
   * over the default canvas.
   */
  const paintedBg = (el: Element | null): number[] => {
    const layers: [number, number, number, number][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    if (!layers.length) return [255, 255, 255];
    let bg = layers[layers.length - 1].slice(0, 3) as number[];
    for (let i = layers.length - 2; i >= 0; i--) {
      const [tr, tg, tb, ta] = layers[i];
      bg = [tr * ta + bg[0] * (1 - ta), tg * ta + bg[1] * (1 - ta), tb * ta + bg[2] * (1 - ta)];
    }
    return bg;
  };

  /**
   * True if anything in the compositing chain paints a background IMAGE.
   * `backgroundColor` is `rgba(0,0,0,0)` under a gradient, so paintedBg() would
   * silently report the surface behind it and invent a ratio. Stops at the same
   * first-opaque boundary paintedBg() stops at -- walking to <html> would flag
   * every element on a page with a decorative body gradient and turn the whole
   * measurement into "cannot tell", which reads as a pass.
   */
  const overImage = (el: Element | null): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
      if (rgba(cs.backgroundColor)[3] >= 1) return false;
    }
    return false;
  };

  /** Opacity is not inherited as a computed value, but it composites the subtree. */
  const faded = (el: Element | null): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const o = Number(getComputedStyle(n).opacity);
      if (Number.isFinite(o) && o < 1) return true;
    }
    return false;
  };

  const inactive = (el: Element): boolean =>
    !!el.closest('[disabled], [aria-disabled="true"], .is-disabled, .disabled, fieldset:disabled');

  /**
   * Markup this app does not own and cannot restyle.
   *
   * Only one entry, and it earned its place by being measured: Google Identity
   * Services renders its own Sign-in button into `.gis-btn-wrapper`, and it came
   * out at 1.37:1 (a `#dadce0` border on white). The class names on it
   * (`nsm7Bb-HzV7m-LgbsSe`) are BUILD HASHES, so allowlisting it would put a key
   * in the debt register that rots the next time Google ships, failing this
   * build for a reason no OBRS commit caused. Excluding it silently would be
   * worse, so it is counted and printed like every other skip.
   *
   * OBRS-778 CORRECTION -- this used to add "and it is Google's", which was the
   * half of the sentence that was false, and it kept the miss unfiled across
   * three cards. The MARKUP is Google's; the COLOURS are ours. `renderButton()`
   * takes a `theme` option and login.component.ts chose `'outline'` (white) in
   * both modes. Skipping the element is still right -- the hashed key is the
   * reason -- but a skip here means "this gate cannot key it", never "nobody
   * owns it". If a skipped element looks wrong, go find the option we pass.
   *
   * Add to this list only for markup a third party injects. "We would rather not
   * fix it" is what CONTRAST_ALLOW is for.
   */
  const thirdParty = (el: Element): boolean => !!el.closest('.gis-btn-wrapper');

  const visible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (cs.display === 'none') return false;
    if (Number(cs.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width >= 2 && box.height >= 2;
  };

  /**
   * A stable, human-readable identity for an element: its class chain, Angular's
   * generated `_ngcontent-*` / `ng-*` state classes stripped (they change on
   * every build and on every form interaction, so leaving them in would make
   * every allowlist key rot within a day).
   */
  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    for (let n: Element | null = el; n && n !== document.body && parts.length < 5; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !/^ng-|^_ng|^cdk-|^p-element$/.test(c))
        .slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };

  const ownsText = (el: Element): boolean => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && (n.textContent || '').trim().length > 0) return true;
    }
    return false;
  };

  const skipped = {
    gradient: 0,
    opacity: 0,
    disabled: 0,
    invisible: 0,
    noSurface: 0,
    thirdParty: 0,
    stateNoPeer: 0,
    stateNoDelta: 0,
  };

  const textScope = only
    ? Array.from(document.querySelectorAll(only)).flatMap((el) => [el, ...Array.from(el.querySelectorAll('*'))])
    : Array.from(document.body.querySelectorAll('*'));

  // --- invariant A: text on its painted background ------------------------
  const textRows: TextFinding[] = [];
  let measuredText = 0;
  for (const el of textScope) {
    if (!ownsText(el)) continue;
    if (!visible(el)) {
      skipped.invisible++;
      continue;
    }
    if (thirdParty(el)) {
      skipped.thirdParty++;
      continue;
    }
    if (inactive(el)) {
      skipped.disabled++;
      continue;
    }
    if (faded(el)) {
      skipped.opacity++;
      continue;
    }
    if (overImage(el)) {
      skipped.gradient++;
      continue;
    }
    const cs = getComputedStyle(el);
    // background-clip:text paints the glyphs with the background image; the
    // computed `color` is then a transparent placeholder and means nothing.
    if (rgba(cs.color)[3] < 1) {
      skipped.gradient++;
      continue;
    }
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const floor = size >= 24 || (size >= 18.66 && weight >= 700) ? 3.0 : 4.5;
    const fg = rgba(cs.color).slice(0, 3);
    const bg = paintedBg(el);
    measuredText++;
    textRows.push({
      key: '',
      path: pathOf(el),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      fg: hex(fg),
      bg: hex(bg),
      ratio: ratio(fg, bg),
      floor,
      count: 1,
    });
  }

  // --- invariant B: the boundary of an interactive control ----------------
  //
  // Scoped to elements that PAINT a surface of their own, and only to real
  // controls. A `<button>` styled as inline text has no surface to distinguish
  // and its label is what identifies it -- that is invariant A's job, and
  // demanding 3:1 of a fill it deliberately does not have would be inventing a
  // rule. What this catches is the control that DOES claim a surface (a fill, a
  // border, or both) and then fails to separate it from the page: OBRS-575's
  // outline pill (border 2.79:1) and OBRS-746's `.btn-search` (fill 2.80:1).
  const CONTROLS =
    'button, [role="button"], input:not([type="hidden"]), select, textarea, a.btn, a[class*="-btn"]';
  const controlRows: BoundaryFinding[] = [];
  let measuredControls = 0;
  const controlScope = only
    ? Array.from(document.querySelectorAll(only)).filter((el) => el.matches(CONTROLS))
    : Array.from(document.querySelectorAll(CONTROLS));
  for (const el of controlScope) {
    if (!visible(el)) {
      skipped.invisible++;
      continue;
    }
    if (thirdParty(el)) {
      skipped.thirdParty++;
      continue;
    }
    if (inactive(el)) {
      skipped.disabled++;
      continue;
    }
    if (faded(el)) {
      skipped.opacity++;
      continue;
    }
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      skipped.gradient++;
      continue;
    }
    const page = paintedBg(el.parentElement);
    if (overImage(el.parentElement)) {
      skipped.gradient++;
      continue;
    }

    const fillRaw = rgba(cs.backgroundColor);
    // A translucent fill really does composite over the page -- that is a
    // surface, just a weaker one, and scoring the composited result is honest.
    const fill =
      fillRaw[3] > 0
        ? [
            fillRaw[0] * fillRaw[3] + page[0] * (1 - fillRaw[3]),
            fillRaw[1] * fillRaw[3] + page[1] * (1 - fillRaw[3]),
            fillRaw[2] * fillRaw[3] + page[2] * (1 - fillRaw[3]),
          ]
        : null;

    // `border: 1px solid transparent` is Bootstrap's default on .btn. Reading
    // borderTopColor without its ALPHA reports #000000 and then "21:1 against a
    // white page" -- the best boundary on the page, and invisible (OBRS-746).
    // Any one visible side is enough to bound the control, so take the best.
    let border: number[] | null = null;
    let borderVsPage: number | null = null;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat((cs as unknown as Record<string, string>)['border' + side + 'Width']) || 0;
      const style = (cs as unknown as Record<string, string>)['border' + side + 'Style'];
      if (w <= 0 || style === 'none' || style === 'hidden') continue;
      const c = rgba((cs as unknown as Record<string, string>)['border' + side + 'Color']);
      if (c[3] <= 0) continue;
      const composited = [
        c[0] * c[3] + page[0] * (1 - c[3]),
        c[1] * c[3] + page[1] * (1 - c[3]),
        c[2] * c[3] + page[2] * (1 - c[3]),
      ];
      const r = ratio(composited, page);
      if (borderVsPage === null || r > borderVsPage) {
        borderVsPage = r;
        border = composited;
      }
    }

    // No fill and no border: this control's design does not claim a surface, so
    // there is no boundary to score. Counted, never passed.
    if (!fill && borderVsPage === null) {
      skipped.noSurface++;
      continue;
    }

    const fillVsPage = fill ? ratio(fill, page) : 1;
    // WHICH CLAUSE DECIDES THIS ROW (design-system §2.6, split out by OBRS-1782).
    //
    // This used to be `Math.max(fillVsPage, borderVsPage ?? 0)`, which quietly
    // erased the line §2.6 draws on purpose: a control whose FILL fails clause 2
    // passed on a border that clause 2 does not let it borrow, and the register
    // then recorded the BORDER's ratio as the reason -- the wrong number under the
    // wrong clause. `.btn-search` is the proof it mattered: fill 2.80:1, border
    // 7.37:1, the one must-catch §2.6 names -- and until this split the live sweep
    // scored it 7.37 and passed it every run.
    //
    // The trigger is "the fill is visible AS A SURFACE", not "has a
    // background-color", and the difference is the whole of OBRS-1782's second
    // half. Read literally, clause 2 condemns every dark field in the app (fill
    // 1.04:1 on the page, border 4.03:1) -- controls OBRS-772 repainted three
    // weeks earlier and clause 1 blesses in that exact shape. Clause 1 and clause
    // 2 disagree about a faintly filled field, and `max()` was what kept the
    // disagreement invisible.
    //
    // 1.5 is a house rule; WCAG has no such number and the owner set this one
    // (2026-09-09). It is deliberately not fine-tuned: measured over both sweeps
    // that day (458 controls), every sub-3:1 fill in the app sits at <=1.37 or at
    // >=2.33 with nothing between, so any value in 1.38..2.33 picks the same
    // population. What it fixes is the concept -- a surface you cannot see is not
    // a surface. Inlined rather than imported because this function is serialised
    // into the browser and closes over nothing; the same reason `3.0` and `4.5`
    // are literals above.
    const paintsFill = fill !== null && fillVsPage >= 1.5;
    // A faint fill with NO border at all is still scored on its fill -- the skip
    // above only fires when there is neither. Without this the row would be
    // labelled "via border" beside a border of `none`, which is the same defect
    // this card is fixing, one shape further along.
    const scoredOnFill = paintsFill || borderVsPage === null;
    measuredControls++;
    controlRows.push({
      key: '',
      path: pathOf(el),
      label: (el.textContent || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      fill: fill ? hex(fill) : null,
      border: border ? hex(border) : null,
      page: hex(page),
      fillVsPage,
      borderVsPage,
      // The `??` is unreachable -- `scoredOnFill` is true whenever borderVsPage is
      // null -- and is here to satisfy the type, not to cover a case.
      boundary: scoredOnFill ? fillVsPage : borderVsPage ?? fillVsPage,
      boundaryFrom: scoredOnFill ? 'fill' : 'border',
      count: 1,
    });
  }

  // --- invariant C: the ::placeholder pseudo-element ----------------------
  //
  // Same floor and the same five exclusions as invariant A, over a population A
  // structurally cannot reach. `only` narrows it the same way, so the hover /
  // focus pass measures a focused field's placeholder too -- which matters: a
  // `:focus` rule that repaints the input's surface moves what the placeholder
  // sits on, and the rest-state row says nothing about that.
  const placeholderRows: PlaceholderFinding[] = [];
  let measuredPlaceholders = 0;
  const phScope = only
    ? Array.from(document.querySelectorAll(only)).flatMap((el) => [
        el,
        ...Array.from(el.querySelectorAll('input, textarea')),
      ])
    : Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
  for (const el of phScope) {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) continue;
    if (el.type === 'hidden') continue;
    // An empty placeholder paints nothing. Scoring it would report the colour of
    // a glyph that does not exist, and every input without one would arrive as a
    // finding keyed on a blank string.
    if (!(el.getAttribute('placeholder') || '').trim()) continue;
    if (!visible(el)) {
      skipped.invisible++;
      continue;
    }
    if (thirdParty(el)) {
      skipped.thirdParty++;
      continue;
    }
    if (inactive(el)) {
      skipped.disabled++;
      continue;
    }
    if (faded(el)) {
      skipped.opacity++;
      continue;
    }
    if (overImage(el)) {
      skipped.gradient++;
      continue;
    }

    const ps = getComputedStyle(el, '::placeholder');
    const raw = rgba(ps.color);
    const bg = paintedBg(el);
    // The compositing step IS the measurement. Bootstrap's placeholder colour is
    // 75% opaque and Chrome's UA default is a flat #6b7280; taking `raw` as the
    // foreground reports a colour that is never painted, and in the dark-mode
    // case it reports one that is 6x too flattering.
    const fg = [
      raw[0] * raw[3] + bg[0] * (1 - raw[3]),
      raw[1] * raw[3] + bg[1] * (1 - raw[3]),
      raw[2] * raw[3] + bg[2] * (1 - raw[3]),
    ];
    const size = parseFloat(ps.fontSize) || parseFloat(getComputedStyle(el).fontSize);
    const weight = Number(ps.fontWeight) || 400;
    const floor = size >= 24 || (size >= 18.66 && weight >= 700) ? 3.0 : 4.5;
    measuredPlaceholders++;
    placeholderRows.push({
      key: '',
      path: pathOf(el),
      text: (el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      fg: hex(fg),
      bg: hex(bg),
      ratio: ratio(fg, bg),
      floor,
      count: 1,
    });
  }

  // --- invariant D: a selected control against its unselected sibling -----
  //
  // The population is the elements the APP marks as selected, not the ones that
  // look selected: `.active` (Bootstrap and this app's own tabs, pills and nav
  // links), `.selected` (the seat map), and the three ARIA state attributes.
  // Reading the marker rather than guessing from colour is what keeps this from
  // being circular -- a gate that decided which element is selected by looking
  // at its fill could never report that the fill says nothing.
  const SELECTED =
    '.active, .selected, [aria-selected="true"], [aria-pressed="true"], [aria-current]:not([aria-current="false"])';
  const stateRows: StateFinding[] = [];
  let measuredStates = 0;
  // A state is a comparison BETWEEN siblings, and `only` narrows the DOM to one
  // control and its descendants -- the siblings are outside the scope by
  // construction. The hover / focus pass therefore contributes no state rows at
  // all rather than a screenful of "no peer", which would be a measurement that
  // does not exist dressed as a skip.
  const stateScope = only ? [] : Array.from(document.querySelectorAll(SELECTED));
  for (const el of stateScope) {
    if (!visible(el)) {
      skipped.invisible++;
      continue;
    }
    if (thirdParty(el)) {
      skipped.thirdParty++;
      continue;
    }
    if (inactive(el)) {
      skipped.disabled++;
      continue;
    }
    if (faded(el)) {
      skipped.opacity++;
      continue;
    }
    if (overImage(el)) {
      skipped.gradient++;
      continue;
    }

    // Same tag as the selected element, same parent, not selected itself. The
    // tag test is what stops a selected tab being compared with the `<hr>` or
    // the heading that happens to share its parent: those are not the other
    // options, and a ratio against them answers no question anyone has.
    const peers = Array.from(el.parentElement ? el.parentElement.children : []).filter(
      (p) =>
        p !== el &&
        p.tagName === el.tagName &&
        !p.matches(SELECTED) &&
        visible(p) &&
        !inactive(p) &&
        !faded(p) &&
        !overImage(p)
    );
    if (!peers.length) {
      skipped.stateNoPeer++;
      continue;
    }

    const cs = getComputedStyle(el);
    const selFill = paintedBg(el);
    const page = paintedBg(el.parentElement);
    const sides = ['Top', 'Right', 'Bottom', 'Left'];

    /**
     * A signature of the edge AS PAINTED. A side with no width or `style: none`
     * contributes the string 'none' and its colour is dropped.
     *
     * That is not tidiness, it is the difference between a sound verdict and a
     * false green. `border-color` and `outline-color` both initialise to
     * `currentcolor`, so two siblings that differ ONLY in text colour compute
     * different border and outline colours even with `border: 0` -- and the
     * first version of this comparison read those as two extra carriers. The
     * first census run showed exactly that: rows tagged `[color+border+outline]`
     * where nothing but the colour was ever painted. Harmless there, because a
     * colour carrier is accepted anyway; NOT harmless in the case this gate
     * exists for, where a phantom border carrier would rescue a state that rests
     * on a faint fill alone and turn the only defect class D can see green.
     */
    const edge = (style: CSSStyleDeclaration): string =>
      sides
        .map((side) => {
          const r = style as unknown as Record<string, string>;
          const w = parseFloat(r['border' + side + 'Width']) || 0;
          const st = r['border' + side + 'Style'];
          if (w <= 0 || st === 'none' || st === 'hidden') return 'none';
          return w + ' ' + st + ' ' + r['border' + side + 'Color'];
        })
        .join('|');

    /** The painted border of an element, composited over its own surface. */
    const edgeColour = (style: CSSStyleDeclaration, over: number[]): number[] | null => {
      let best: number[] | null = null;
      let bestRatio = -1;
      for (const side of sides) {
        const r = style as unknown as Record<string, string>;
        const w = parseFloat(r['border' + side + 'Width']) || 0;
        const st = r['border' + side + 'Style'];
        if (w <= 0 || st === 'none' || st === 'hidden') continue;
        const c = rgba(r['border' + side + 'Color']);
        if (c[3] <= 0) continue;
        const composited = [
          c[0] * c[3] + over[0] * (1 - c[3]),
          c[1] * c[3] + over[1] * (1 - c[3]),
          c[2] * c[3] + over[2] * (1 - c[3]),
        ];
        const rr = ratio(composited, over);
        if (rr > bestRatio) {
          bestRatio = rr;
          best = composited;
        }
      }
      return best;
    };

    const outlined = (style: CSSStyleDeclaration): string => {
      const w = parseFloat(style.outlineWidth) || 0;
      if (w <= 0 || style.outlineStyle === 'none') return 'none';
      return w + ' ' + style.outlineStyle + ' ' + style.outlineColor;
    };

    /**
     * An outline is drawn OUTSIDE the border edge, so it composites over the
     * surface the control sits on, not over the control's own fill.
     */
    const outlineColour = (style: CSSStyleDeclaration, over: number[]): number[] | null => {
      const w = parseFloat(style.outlineWidth) || 0;
      if (w <= 0 || style.outlineStyle === 'none') return null;
      const c = rgba(style.outlineColor);
      if (c[3] <= 0) return null;
      return [
        c[0] * c[3] + over[0] * (1 - c[3]),
        c[1] * c[3] + over[1] * (1 - c[3]),
        c[2] * c[3] + over[2] * (1 - c[3]),
      ];
    };

    /**
     * Every unselected sibling is compared, and the HARDEST pair is the one
     * recorded.
     *
     * The first version ranked peers by fill distance alone and then read the
     * border of whichever peer won that -- so in a group of three or more, a
     * weak border pairing against a DIFFERENT sibling went unmeasured. What
     * ranks a pair now is the best separation it has by any measurable means, so
     * the peer that survives is the one this control is genuinely hardest to
     * tell apart from. Ties break on the fill, which is the carrier the register
     * keys on.
     */
    interface Candidate {
      peer: Element;
      peerFill: number[];
      carriers: string[];
      fillVsSibling: number;
      borderVsSibling: number | null;
      outlineVsSibling: number | null;
      rank: number;
    }
    let chosen: Candidate | null = null;
    for (const p of peers) {
      const ps = getComputedStyle(p);
      const peerFill = paintedBg(p);

      const carriers: string[] = [];
      if (hex(selFill) !== hex(peerFill)) carriers.push('fill');
      if (cs.color !== ps.color) carriers.push('color');
      if (cs.fontWeight !== ps.fontWeight) carriers.push('weight');
      if (edge(cs) !== edge(ps)) carriers.push('border');
      if (cs.textDecorationLine !== ps.textDecorationLine) carriers.push('underline');
      if (cs.boxShadow !== ps.boxShadow) carriers.push('shadow');
      if (outlined(cs) !== outlined(ps)) carriers.push('outline');
      // Nothing on this element differs from this sibling, so whatever shows the
      // state is somewhere this comparison cannot see. Ranking it would put a
      // measurement that does not exist at the top.
      if (!carriers.length) continue;

      const selEdge = edgeColour(cs, selFill);
      const peerEdge = edgeColour(ps, peerFill);
      const borderVsSibling = selEdge && peerEdge ? ratio(selEdge, peerEdge) : null;
      const selOutline = outlineColour(cs, page);
      const peerOutline = outlineColour(ps, page);
      const outlineVsSibling = selOutline && peerOutline ? ratio(selOutline, peerOutline) : null;

      // A carrier that is not a colour question, or one this file cannot weigh
      // because the sibling paints nothing to weigh it against, settles the pair
      // -- and a settled pair is the easiest to tell apart, not the hardest.
      const settled =
        carriers.some((c) => c === 'color' || c === 'weight' || c === 'underline' || c === 'shadow') ||
        (carriers.includes('border') && borderVsSibling === null) ||
        (carriers.includes('outline') && outlineVsSibling === null);
      const rank = settled
        ? Infinity
        : Math.max(
            carriers.includes('fill') ? ratio(selFill, peerFill) : 0,
            carriers.includes('border') && borderVsSibling !== null ? borderVsSibling : 0,
            carriers.includes('outline') && outlineVsSibling !== null ? outlineVsSibling : 0
          );

      const candidate: Candidate = {
        peer: p,
        peerFill,
        carriers,
        fillVsSibling: ratio(selFill, peerFill),
        borderVsSibling,
        outlineVsSibling,
        rank,
      };
      if (!chosen || candidate.rank < chosen.rank || (candidate.rank === chosen.rank && candidate.fillVsSibling < chosen.fillVsSibling)) {
        chosen = candidate;
      }
    }

    if (!chosen) {
      skipped.stateNoDelta++;
      continue;
    }

    measuredStates++;
    stateRows.push({
      key: '',
      path: pathOf(el),
      label: (el.textContent || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      selectedFill: hex(selFill),
      siblingFill: hex(chosen.peerFill),
      siblingPath: pathOf(chosen.peer),
      fillVsSibling: chosen.fillVsSibling,
      borderVsSibling: chosen.borderVsSibling,
      outlineVsSibling: chosen.outlineVsSibling,
      carriers: chosen.carriers,
      count: 1,
    });
  }

  return {
    href: location.pathname,
    bodyIsDark: document.body.classList.contains('is-dark'),
    text: textRows,
    controls: controlRows,
    placeholders: placeholderRows,
    states: stateRows,
    measuredText,
    measuredControls,
    measuredPlaceholders,
    measuredStates,
    skipped,
  };
};

// ---------------------------------------------------------------------------
// node-side scoring
// ---------------------------------------------------------------------------

/**
 * The identity an allowlist entry is keyed on: the element itself, not the five
 * wrappers above it.
 *
 * Both halves of this were measured before being chosen, on the real 2026-07-27
 * population of 176 raw sites:
 *
 *   * The FULL ancestor path produced 176 keys for ~50 distinct defects -- the
 *     footer alone occupied 91, one per (page x element), all one bug. It also
 *     rots on contact: inserting a wrapper `div` renames every key underneath
 *     it, and the stale-entry check then fails the build for a markup edit that
 *     changed no colour at all. A gate that goes red for the wrong reason gets
 *     switched off, and takes the true positives with it.
 *   * The PAGE is deliberately not in the key either. The footer is one
 *     component rendered on seven pages; seven entries describing one defect is
 *     bookkeeping, not information. The trade is stated rather than hidden: the
 *     same colour pair on the same element appearing on a NEW page is covered by
 *     the existing entry. That is the same defect, so covering it is right --
 *     but it does mean this gate reports defects, not sightings. The page list
 *     is still printed in the report.
 *   * The COLOUR PAIR stays in the key. A repaint invalidates the entry, the
 *     stale-entry check fires, and somebody looks again. An entry keyed only on
 *     a selector would outlive the defect it described and go on excusing a
 *     different one.
 */
export function leafOf(path: string): string {
  const parts = path.split(' > ');
  const last = parts[parts.length - 1];
  // A bare `span` or `p` says nothing on its own -- borrow one level of context.
  if (!last.includes('.') && parts.length > 1) return parts.slice(-2).join(' > ');
  return last;
}

export const textKey = (theme: string, f: { path: string; fg: string; bg: string }): string =>
  `${theme}|${leafOf(f.path)}|${f.fg}-on-${f.bg}`;

export const boundaryKey = (theme: string, f: { path: string; page: string }): string =>
  `${theme}|${leafOf(f.path)}|boundary-on-${f.page}`;

/**
 * `placeholder` is in the key on purpose. Without it a placeholder finding and a
 * text finding on the same element with the same colour pair collapse into ONE
 * row -- and they are different defects with different fixes (the element's
 * `color` versus its `::placeholder` colour), so an allowlist entry written for
 * one would silently excuse the other.
 */
export const placeholderKey = (theme: string, f: { path: string; fg: string; bg: string }): string =>
  `${theme}|${leafOf(f.path)}|placeholder|${f.fg}-on-${f.bg}`;

/**
 * A state key names the SIBLING SURFACE it was weighed against, for the same
 * reason `boundaryKey` names the page: two members of different groups with the
 * same class chain are different comparisons, and an entry written for one must
 * not excuse the other. The selected element's own fill stays out of it -- it is
 * the half a repaint changes, and the entry has to survive long enough for the
 * stale check to say something about it.
 */
export const stateKey = (theme: string, f: { path: string; siblingFill: string }): string =>
  `${theme}|${leafOf(f.path)}|state-vs-${f.siblingFill}`;

/**
 * The verdict on one state row, in ONE place because three readers need it: both
 * gates and the capture spec that photographs what they scored.
 *
 * 2.6 decided the shape -- a state resting on a faint fill ALONE is a defect,
 * and a second signal accepts it. What the first census run showed is that "a
 * second signal" cannot be taken on the word `border`: the passenger-type tile
 * on /staff/sell separates its selected member by a 1.09:1 fill and a 1.54:1
 * border change in dark mode, with no colour and no weight anywhere. Under a
 * carrier COUNT that passes; under 1.4.11 nothing on that tile reaches 3:1. So
 * the carriers this file can actually weigh are weighed, and the rest are
 * accepted for reasons named one by one below rather than by being unlisted.
 *
 * The owner was asked rather than assumed: 2.6 as written on 2026-09-08 accepts
 * "several signals", and reading a 1.54:1 border delta as one of them is an
 * interpretation, not a deduction. Amended 2026-09-09 -- a carrier that PAINTS A
 * SURFACE (fill, border, outline) must itself reach 3:1 to accept a state. The
 * text `color` carrier is NOT one of those -- it keeps its own 2026-09-08
 * exemption below -- and every other carrier (weight, underline, shadow) still
 * settles it on sight. Both halves are recorded in 2.6.
 */
export function stateFails(f: {
  carriers: string[];
  fillVsSibling: number;
  borderVsSibling: number | null;
  outlineVsSibling: number | null;
}): boolean {
  // Not a colour question at all. A weight, an underline or a shadow either
  // shows or it does not, and 1.4.11 has nothing to say about the contrast of a
  // change in stroke thickness.
  if (f.carriers.some((c) => c === 'weight' || c === 'underline' || c === 'shadow')) return false;
  // 2.6's explicit decision, and its stated soft edge: a text colour that moves
  // is scored for legibility by invariant A, and the distance between the two
  // colours is not something this file has been asked to floor.
  if (f.carriers.includes('color')) return false;
  // An outline or a border that APPEARS where the sibling has none is a ring the
  // unselected member does not have; there is no second colour to weigh it
  // against here, and its contrast against the surface is invariant B's job.
  if (f.carriers.includes('border') && f.borderVsSibling === null) return false;
  if (f.carriers.includes('outline') && f.outlineVsSibling === null) return false;
  // What is left is the three carriers with a real ratio behind them. The
  // outline is weighed and not waved through: it was the one carrier this
  // function still accepted on presence after the border stopped being, which
  // is the same defect family one property along (OBRS-1774 review).
  if (f.carriers.includes('fill') && f.fillVsSibling >= AA_BOUNDARY) return false;
  if (f.carriers.includes('border') && f.borderVsSibling !== null && f.borderVsSibling >= AA_BOUNDARY) return false;
  if (f.carriers.includes('outline') && f.outlineVsSibling !== null && f.outlineVsSibling >= AA_BOUNDARY) return false;
  return true;
}

/**
 * A key with its FOREGROUND dropped and everything that says WHERE it was
 * painted kept: theme, element, role, and the surface it sat on.
 *
 * The foreground belongs in the key -- a repaint has to invalidate the entry,
 * which is the argument made at length above. But it also means "no key matches"
 * has two causes that read identically, and OBRS-1435 is what that costs: the
 * gate told a reader to delete a LIVE OBRS-1424 entry because the h1 that carried
 * it was never scored on that run. An element the sweep did not measure says
 * nothing about whether its debt was paid.
 *
 * Applied to both sides -- a CONTRAST_ALLOW key, and the key of a row the sweep
 * actually scored, passing or failing -- this answers the narrower question the
 * verdict needs first: did this run measure that element, in that theme, in that
 * role, ON THAT SURFACE? `text` / `placeholder` / `boundary` stay apart for the
 * same reason `placeholderKey` gives: different defects, different fixes.
 *
 * THE SURFACE IS NOT OPTIONAL, and the first version of this function dropped it.
 * Measured against the register as it stands: collapsing a boundary key to
 * `theme|leaf|boundary` gave 22 identities for 25 entries, and all three
 * collisions were a control that carries the SAME framework-default border on two
 * different backgrounds -- `input.form-control`, `input.form-control.mt-1` and
 * `button.theme-toggle-btn`, each registered on both `#1a1d27` and `#0f1117` by
 * OBRS-970. One twin being scored would then vouch for the other, so the entry
 * whose element did not render would be pronounced paid: the exact false delete
 * this card exists to stop, reintroduced by its own fix. With the surface kept:
 * 25 identities, 0 collisions.
 *
 * A boundary key carries no foreground at all -- the fill/border ratio is not in
 * it -- so it is kept whole. A repaint still invalidates it through `collapsed`:
 * a control that now clears 3:1 stops being a finding while its identity stays in
 * the measured set, which is `stale`, "delete it". The one case that reads
 * differently after this is a fix that ALSO moves the surface: that lands in
 * `unmeasured`, "go and look", rather than "delete". Never a false delete, which
 * is the direction to be wrong in.
 *
 * Parsed rather than built a second time, so there is one definition of a key and
 * not two that can drift. Safe because a colour pair contains no `|`, and `leafOf`
 * returns a class chain joined by ' > ', which contains none either -- so the
 * third field alone names the role.
 */
export function keyIdentity(key: string): string {
  const parts = key.split('|');
  const [theme, leaf] = parts;
  const third = parts[2] ?? '';
  if (third.startsWith('boundary-on-')) return `${theme}|${leaf}|${third}`;
  if (third.startsWith('state-vs-')) return `${theme}|${leaf}|${third}`;
  const role = third === 'placeholder' ? 'placeholder' : 'text';
  const pair = role === 'placeholder' ? parts[3] ?? '' : third;
  return `${theme}|${leaf}|${role}|on-${pair.split('-on-')[1] ?? ''}`;
}
