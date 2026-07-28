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
 * WHAT IS MEASURED -- THREE INVARIANTS, NOT ONE
 *
 *   A. TEXT (WCAG 1.4.3). Every element that renders its own text run, against
 *      the background actually painted behind it (composited up the ancestor
 *      chain). 4.5:1, or 3.0:1 for large text.
 *
 *   B. BOUNDARY (WCAG 1.4.11). An interactive control's own surface against the
 *      surface it sits on, 3.0:1, with a visible border allowed to carry the
 *      boundary instead of the fill. This is a DIFFERENT criterion and no
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
  count: number;
}

export interface Sweep {
  href: string;
  bodyIsDark: boolean;
  text: TextFinding[];
  controls: BoundaryFinding[];
  placeholders: PlaceholderFinding[];
  /** Everything measured, not just what failed -- the denominator for the 0-match guard. */
  measuredText: number;
  measuredControls: number;
  measuredPlaceholders: number;
  skipped: {
    gradient: number;
    opacity: number;
    disabled: number;
    invisible: number;
    noSurface: number;
    thirdParty: number;
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

  const skipped = { gradient: 0, opacity: 0, disabled: 0, invisible: 0, noSurface: 0, thirdParty: 0 };

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
      boundary: Math.max(fillVsPage, borderVsPage ?? 0),
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

  return {
    href: location.pathname,
    bodyIsDark: document.body.classList.contains('is-dark'),
    text: textRows,
    controls: controlRows,
    placeholders: placeholderRows,
    measuredText,
    measuredControls,
    measuredPlaceholders,
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
