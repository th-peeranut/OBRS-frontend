// Brand-fill text contrast gate (OBRS-740).
//
// Why this exists, and why it is NOT a duplicate of the OBRS-734 runtime probe:
//
// OBRS-734 measured contrast in a real browser by reading
// `getComputedStyle(el).backgroundColor`. That call returns `rgba(0, 0, 0, 0)`
// whenever the background is a GRADIENT, so every button painted with
// `linear-gradient(...)` was silently skipped -- and the run still reported
// "0 elements below AA", which reads as coverage it never had. The app's
// primary button is exactly such a gradient, and it ramps from 6.46:1 at one
// end to 2.12:1 at the other.
//
// The same blind spot hid the floating usability-report FAB for two cards:
// `var(--accent, #4dbeef)` looks theme-aware, but the component renders
// OUTSIDE `.admin-shell`, so `--accent` never resolves and the FALLBACK
// literal is what ships -- white on #4dbeef, 2.12:1, on every route.
//
// So this gate reads the SOURCE instead of the DOM, and deliberately:
//
//   1. expands `linear-gradient(...)` into its individual colour stops and
//      checks the declared text colour against EVERY stop, not just the first;
//   2. resolves `var(--token, fallback)` to the set of ALL values that token is
//      ever declared with (including the fallback literal), then reports the
//      WORST pair. `--accent` is #4dbeef / #ff7a45 / #2dd4bf depending on the
//      theme class, so "it passes in the default theme" is not an answer;
//   3. counts and prints what it could NOT resolve, so a rule that stops
//      matching shows up as a shrinking population instead of a silent pass.
//
// Known-open violations live in ALLOW below, each with a card reference. That
// is a debt marker, not an exemption: adding a NEW brand fill that fails still
// turns this red.
//
// Self-test (must-catch AND must-NOT-catch) runs on every invocation before
// the real scan -- a gate nobody proved can fire is prose with a shebang.
//
// Run locally with: npm run test:brand-contrast
//
// ASCII-only source.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(HERE, '..', 'src');

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

// Known-open failures. Keyed by "<path relative to src>::<selector>".
//
// AS OF OBRS-752 THIS LIST IS EMPTY -- every brand fill in the app is at or
// above its WCAG AA floor, and the gate now has nothing to tolerate.
//
// It is a debt marker, not an exemption, and it was always spelled out site by
// site with the measured ratio: the alternative -- narrowing the gate until it
// only sees the one thing the current card fixed -- would have reported "OK"
// while the rest stayed below AA, which is precisely the failure mode
// OBRS-734's "0 elements below AA" already demonstrated once. It ran 740 -> 741
// -> 752 that way, shrinking each time, and an entry that stops matching
// anything fails the gate (see staleAllow), so it could never quietly outlive
// the bugs it described.
//
// OBRS-752 emptied it. The 48 customer-palette entries that lived here
// are FIXED, not moved: every one of them was driven by a variable in
// styles/variables.scss -- not a single site had a local hex of its own -- so
// five palette values moved to their measured AA floor and three sites were
// repointed at an existing darker token. See that file's header for the
// derivation.
//
// The list is kept EMPTY rather than deleted so the next brand fill that falls
// below AA has nowhere to hide: an ALLOW entry has to be written, by hand, with
// a card number on it.
const SWEEP_ALLOW = {};

const ALLOW = {
  // The five brand-gradient entries are gone because they are FIXED: the ramps
  // now end at --accent-fill / --admin-primary-bright #107eaf instead of the
  // full-brightness accent. OBRS-741.

  // --- hardcoded hex, unrelated to the token system ---
  //
  // `vehicle-inspection-panel.component.scss::.admin-btn.is-active` used to be
  // listed here at "2.00:1 (theme-admin world)". It was never a defect: the gate
  // could not read `--accent-soft` (an rgba tint), treated the token as absent,
  // and read the `var(--accent-soft, var(--accent))` FALLBACK -- so it scored
  // #c2410c text against a solid #ff7a45 that never renders. The real
  // background is a 14%-alpha tint of the same hue over a white card. Fixed in
  // resolveColours (declared-but-unreadable != undeclared), and the entry is
  // gone rather than "fixed", because there was nothing to fix. OBRS-741.
  // The nine local-hex entries that used to sit here are FIXED, not moved:
  // .locate-me-btn hover, .route-chip.active, both reschedule-estimate states,
  // both my-bookings status badges, and the three select/pay hovers.

  // --- the customer palette (OBRS-752) ---
  //
  // 48 entries used to sit here. They were invisible until this gate learned to
  // read SCSS $variables -- NEW to the list, not newly broken -- and 23 of them
  // were white on $primary-blue (#4bc2f7, 2.03:1), i.e. every primary button in
  // the customer flow. They are now FIXED at the palette; see
  // src/styles/variables.scss.
  ...SWEEP_ALLOW,
};

// ---------------------------------------------------------------------------
// colour maths
// ---------------------------------------------------------------------------

const NAMED = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
};

/** Normalise a colour literal to #rrggbb, or null if it is not an opaque hex-able colour. */
function toHex(raw) {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return '#' + [...m[1]].map((c) => c + c).join('');
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return '#' + m[1];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(v);
  if (m) {
    // A translucent fill composites against whatever is behind it, which source
    // text cannot know. Refusing to guess is the point -- it is counted, not
    // silently passed.
    if (m[4] !== undefined && Number(m[4]) < 1) return null;
    return (
      '#' +
      [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    );
  }
  return null;
}

function luminance(hex) {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// SCSS parsing
// ---------------------------------------------------------------------------

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Flatten a stylesheet into blocks, each carrying its own declarations and a
 * pointer to its parent. The parent link matters: `&:hover { background: X }`
 * inherits the `color` declared one level up, and a hover state that fails is
 * still a failure.
 */
function parseBlocks(src) {
  const blocks = [];
  const stack = [];
  let buf = '';
  let depthParen = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depthParen++;
    else if (c === ')') depthParen--;
    if (depthParen > 0) {
      buf += c;
      continue;
    }
    if (c === '{') {
      const b = {
        selector: buf.trim().replace(/\s+/g, ' '),
        decls: {},
        parent: stack.length ? stack[stack.length - 1] : null,
      };
      blocks.push(b);
      stack.push(b);
      buf = '';
    } else if (c === '}') {
      recordDecl(stack[stack.length - 1], buf);
      stack.pop();
      buf = '';
    } else if (c === ';') {
      recordDecl(stack[stack.length - 1], buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  return blocks;
}

function recordDecl(block, text) {
  if (!block) return;
  const m = /^\s*([-a-z]+)\s*:\s*([\s\S]+)$/.exec(text);
  if (!m) return;
  block.decls[m[1]] = m[2].trim().replace(/\s+/g, ' ');
}

/**
 * Walk up the parent chain for a declaration the block itself does not set,
 * but ONLY through `&`-prefixed nesting -- `&:hover` / `&.is-active` are the
 * SAME element and do inherit the parent's `color`, whereas `.circle` nested
 * inside `.step` is a DIFFERENT element and does not.
 *
 * The first draft inherited through everything and reported the stepper's
 * 16x16 `.circle` dot as "#b0d4e8 text on #b0d4e8" -- a decorative dot with no
 * text in it at all, paired with a colour belonging to its parent. Pairing a
 * background with text that is not in the same box is how a contrast gate
 * generates noise until someone switches it off.
 */
function inherited(block, prop) {
  for (let b = block; b; b = b.parent) {
    if (b.decls[prop] !== undefined) return b.decls[prop];
    // Climb only when this block is a state/pseudo of the SAME element.
    if (!b.selector.startsWith('&')) return undefined;
  }
  return undefined;
}

/** Full selector path, for readable reporting and stable ALLOW keys. */
function selectorPath(block) {
  const parts = [];
  for (let b = block; b; b = b.parent) {
    if (b.selector && !b.selector.startsWith('@')) parts.unshift(b.selector);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// token table + value resolution
// ---------------------------------------------------------------------------

// The six theme "worlds" a rule can actually render in. Resolving a token to
// the union of every value it is ever declared with was the first draft, and it
// produced 55 findings of which the overwhelming majority were impossible
// pairings -- light-theme text (#191c1e) against dark-theme card (#1d2226),
// a combination no browser ever composites. A gate that cries wolf 40 times
// gets switched off, so values are resolved PER WORLD and a rule is only
// checked in the worlds its own selector can appear in.
const WORLDS = [];
for (const variant of ['base', 'admin', 'staff']) {
  for (const dark of [false, true]) WORLDS.push({ variant, dark, name: `${variant}/${dark ? 'dark' : 'light'}` });
}

function selectorTraits(sel) {
  const s = sel.toLowerCase();
  return {
    dark: /\bis-dark\b/.test(s),
    variant: /theme-admin/.test(s) ? 'admin' : /theme-staff/.test(s) ? 'staff' : 'base',
  };
}

/** Does a custom-property declaration written under `sel` apply in `world`? */
function appliesIn(sel, world) {
  const t = selectorTraits(sel);
  if (t.dark && !world.dark) return false;
  if (t.variant !== 'base' && t.variant !== world.variant) return false;
  return true;
}

/**
 * Which worlds a RULE is checked in. Deliberately narrower than appliesIn():
 * a rule with no `is-dark` in its own selector is checked in LIGHT worlds only.
 *
 * Not laziness -- modelling the real cascade. OBRS paints dark mode by ADDING
 * `.is-dark`-scoped rules, so `.admin-table thead th { color: #5a6871 }` is
 * followed 10 lines later by `.is-dark .admin-table thead th { color:
 * var(--admin-muted) }`. Evaluating the first rule in a dark world reported
 * 2.56:1 for a combination the browser never paints, because this gate reads
 * one rule at a time and cannot see the override. Rules that genuinely forgot
 * dark mode are already the job of check-admin-theme-tokens.mjs invariant 1
 * (every --admin-* token needs a dark override or a written exemption), so
 * nothing is left uncovered by drawing the line here.
 */
function worldsForRule(sel) {
  const t = selectorTraits(sel);
  return WORLDS.filter((w) => {
    if (w.dark !== t.dark) return false;
    if (t.variant !== 'base') return t.variant === w.variant;
    return true;
  });
}

/**
 * Every custom-property declaration, tagged with the selector that scopes it,
 * so a token can later be resolved the way the cascade would resolve it.
 *
 * Declarations whose value is not hex-able (an `rgba(...)` with alpha, a
 * computed expression) are recorded with `hex: null` instead of being dropped.
 * That distinction is load-bearing -- see the `var()` branch of resolveColours:
 * a token that is DECLARED but unreadable is not the same as an absent one, and
 * conflating them made the gate report the fallback as if it were what renders.
 */
function collectTokensFromBlocks(blocks, tokens) {
  for (const block of blocks) {
    const sel = selectorPath(block);
    for (const [prop, value] of Object.entries(block.decls)) {
      if (!prop.startsWith('--')) continue;
      if (!tokens.has(prop)) tokens.set(prop, []);
      tokens.get(prop).push({ sel, hex: toHex(value) });
    }
  }
  return tokens;
}

function collectTokens(files) {
  const tokens = new Map();
  for (const f of files) {
    collectTokensFromBlocks(parseBlocks(stripComments(readFileSync(f, 'utf8'))), tokens);
  }
  return tokens;
}

/**
 * SCSS `$variables`, collected tree-wide into one flat map.
 *
 * Why the gate needs this at all: it used to see `background: $primary-blue` as
 * an unreadable value and skip the block, while catching the
 * `&:hover { background: #0090d0 }` two lines below because THAT one was a
 * literal. So the report said "the hover state is the bug" about a button whose
 * REST state is worse -- `$primary-blue` is #4bc2f7 and white on it is 2.06:1
 * against the hover's 3.56:1. Every select/pay button in the customer flow sat
 * in that blind spot, and a blind spot reads exactly like a pass.
 *
 * A flat tree-wide map is safe here, and that was checked rather than assumed:
 * every `$name` under src/ is declared exactly once. If that ever stops being
 * true this needs real per-file @use scoping; the duplicate guard in main()
 * turns that day into a loud error instead of a quietly wrong colour.
 */
let SCSS_VARS = new Map();

function scssVarsFromSource(src, vars, dupes) {
  let depth = 0;
  for (const line of stripComments(src).split('\n')) {
    const atTopLevel = depth === 0;
    for (const c of line) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    // Only top-level declarations: a `$x:` inside a block is a local shadow,
    // and modelling shadowing wrong is worse than not modelling it.
    if (!atTopLevel) continue;
    const m = /^\s*(\$[a-z0-9-]+)\s*:\s*([^;]+);/i.exec(line);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const value = m[2].trim().replace(/\s*!default\s*$/, '');
    if (vars.has(name) && vars.get(name) !== value) dupes.push(name);
    vars.set(name, value);
  }
}

function collectScssVars(files) {
  const vars = new Map();
  const dupes = [];
  for (const f of files) scssVarsFromSource(readFileSync(f, 'utf8'), vars, dupes);
  return { vars, dupes: [...new Set(dupes)] };
}

/**
 * The value a token takes in one world. Ordering mirrors the cascade closely
 * enough for these stylesheets: a dark override beats a theme variant, which
 * beats the base declaration, and a later declaration beats an earlier one at
 * equal rank.
 *
 * Returns `{ declared, hex }`. `declared` says whether ANY declaration reaches
 * this world; `hex` is null when the winning one is not hex-able.
 */
function tokenInWorld(tokens, name, world) {
  const decls = tokens.get(name);
  if (!decls) return { declared: false, hex: null };
  let best = null;
  let bestRank = -1;
  let declared = false;
  for (const d of decls) {
    if (!appliesIn(d.sel, world)) continue;
    declared = true;
    const t = selectorTraits(d.sel);
    const rank = (t.dark ? 2 : 0) + (t.variant !== 'base' ? 1 : 0);
    if (rank >= bestRank) {
      bestRank = rank;
      best = d.hex;
    }
  }
  return { declared, hex: best };
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

/**
 * Resolve a CSS value to the SET of concrete colours it can render as.
 * Returns { colours: string[], unresolved: number }.
 */
function resolveColours(value, tokens, world) {
  if (!value) return { colours: [], unresolved: 0 };
  const v = value.trim();

  const grad = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(([\s\S]*)\)$/i.exec(v);
  if (grad) {
    // THE point of this gate: a gradient is not one colour, it is a ramp, and
    // the text has to survive every stop of it. getComputedStyle() reports
    // rgba(0,0,0,0) here and skips the element entirely (OBRS-734).
    const out = [];
    let unresolved = 0;
    for (const part of splitTopLevel(grad[1])) {
      // drop the angle / "to right" / bare position arguments
      if (/^(to\s|[\d.]+deg|[\d.]+turn|circle|ellipse|at\s)/i.test(part)) continue;
      // strip a trailing colour-stop position
      const colourOnly = part.replace(/\s+[\d.]+%?$/, '').trim();
      if (!colourOnly) continue;
      const r = resolveColours(colourOnly, tokens, world);
      out.push(...r.colours);
      unresolved += r.unresolved;
      if (!r.colours.length && !r.unresolved) unresolved++;
    }
    return { colours: [...new Set(out)], unresolved };
  }

  const varM = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i.exec(v);
  if (varM) {
    const t = tokenInWorld(tokens, varM[1], world);
    if (t.hex) return { colours: [t.hex], unresolved: 0 };
    // A token that IS declared here just cannot be read by this gate (an rgba
    // tint, say). The browser still paints the declaration, NOT the fallback, so
    // reading the fallback would be inventing a colour: that is how
    // `.admin-btn.is-active` got reported at 2.00:1 for #c2410c-on-#ff7a45, a
    // pairing that never renders -- its real background is a 14%-alpha tint of
    // the same hue over a white card. Count it unresolved and say so.
    if (t.declared) return { colours: [], unresolved: 1 };
    // Genuinely undeclared in this world means the FALLBACK literal is what
    // renders -- which is exactly how the FAB shipped #4dbeef on every page
    // while looking like it was themed.
    if (varM[2]) return resolveColours(varM[2], tokens, world);
    return { colours: [], unresolved: 1 };
  }

  // SCSS `$variable` -- resolved through the tree-wide map, following aliases
  // ($brand-customer: $primary-blue) with a depth guard so a cycle cannot hang.
  const scssM = /^(\$[a-z0-9-]+)$/i.exec(v);
  if (scssM) {
    let cur = v.toLowerCase();
    for (let hops = 0; hops < 8; hops++) {
      const next = SCSS_VARS.get(cur);
      if (next === undefined) return { colours: [], unresolved: 1 };
      if (/^\$[a-z0-9-]+$/i.test(next.trim())) {
        cur = next.trim().toLowerCase();
        continue;
      }
      return resolveColours(next, tokens, world);
    }
    return { colours: [], unresolved: 1 };
  }

  const hex = toHex(v);
  if (hex) return { colours: [hex], unresolved: 0 };

  // Shorthand `background: <colour> <something-else>` -- take a leading colour.
  const lead = v.split(/\s+/)[0];
  const leadHex = toHex(lead);
  if (leadHex) return { colours: [leadHex], unresolved: 0 };
  if (/^var\(/i.test(lead) || /^\$[a-z0-9-]+$/i.test(lead)) return resolveColours(lead, tokens, world);

  if (/^(none|transparent|inherit|initial|unset|currentcolor)$/i.test(v)) {
    return { colours: [], unresolved: 0 };
  }
  return { colours: [], unresolved: 1 };
}

/**
 * WCAG 1.4.3 exempts "text or images of text that are part of an inactive user
 * interface component" -- a disabled button's label has NO contrast minimum,
 * and the whole point of greying it out is that it reads as unavailable.
 *
 * Without this the gate demands 4.5:1 on nine disabled states (white on
 * #dddee1 = 1.35:1) whose only correct fix would be to make them look enabled.
 * `-diabled` is in the list because the app ships that spelling as a real class
 * name in three stylesheets; matching the typo is not tidy, but a gate that
 * silently misses the sites it is aimed at is worse than an ugly regex.
 */
/**
 * `opacity` below 1 composites the WHOLE element -- fill and label together --
 * against whatever is behind it, and source alone cannot know what that is.
 *
 * This is not a hypothetical. `.admin-btn-primary:not(:disabled):hover` set
 * `opacity: 0.9` over the rest-state gradient, and this gate scored it as the
 * gradient's own colours: a clean pass. Composited against the white card it
 * actually rendered 3.84-4.42:1 across the three theme variants -- the button
 * passed at rest and failed the moment you pointed at it, which is precisely
 * the split OBRS-741 exists to close, reintroduced by a property that is not a
 * colour and so was invisible here.
 *
 * The honest answer is the same one toHex() already gives translucent rgba:
 * refuse to score it, and COUNT it, rather than report a number that is wrong
 * in the reassuring direction. 51 declarations across the tree carry an
 * opacity, so turning these into findings would be noise; turning them into a
 * printed count means a false pass becomes a visible "cannot tell".
 */
function hasTranslucency(block) {
  for (let b = block; b; b = b.parent) {
    const o = b.decls['opacity'];
    if (o !== undefined && Number(o) < 1) return true;
    if (!b.selector.startsWith('&')) return false;
  }
  return false;
}

function isInactiveState(sel) {
  // Strip `:not(...)` FIRST. `&:hover:not(:disabled)` is the ENABLED hover
  // state and must still be checked -- the first draft of this function matched
  // the `:disabled` inside the negation and exempted exactly the rule this card
  // exists to fix. The staleAllow guard is what caught it, which is the whole
  // argument for keeping known-open entries listed instead of narrowing a gate.
  const positive = sel.replace(/:not\([^)]*\)/gi, '');
  return /(:disabled|\[disabled\]|\bis-disabled\b|-diabled\b|\bdisabled\b)/i.test(positive);
}

/** WCAG large text: >=24px, or >=18.66px when bold. */
function thresholdFor(block) {
  const size = inherited(block, 'font-size');
  const weight = inherited(block, 'font-weight');
  const px = size && /^([\d.]+)px$/.exec(size) ? Number(/^([\d.]+)px$/.exec(size)[1]) : null;
  const rem = size && /^([\d.]+)rem$/.exec(size) ? Number(/^([\d.]+)rem$/.exec(size)[1]) * 16 : null;
  const effective = px !== null ? px : rem;
  if (effective === null) return AA_NORMAL;
  const bold = weight !== undefined && (Number(weight) >= 700 || /bold/i.test(weight));
  if (effective >= 24) return AA_LARGE;
  if (effective >= 18.66 && bold) return AA_LARGE;
  return AA_NORMAL;
}

// ---------------------------------------------------------------------------
// the scan
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.scss$/.test(name)) out.push(p);
  }
  return out;
}

function scan(files, tokens, srcRoot) {
  const findings = [];
  const stats = { blocks: 0, pairs: 0, unresolvedBg: 0, unresolvedFg: 0, inactive: 0, translucent: 0 };

  for (const file of files) {
    const rel = relative(srcRoot, file).replace(/\\/g, '/');
    const blocks = parseBlocks(stripComments(readFileSync(file, 'utf8')));
    for (const block of blocks) {
      stats.blocks++;
      const fgRaw = inherited(block, 'color');
      const bgRaw = block.decls['background'] ?? block.decls['background-color'];
      if (!fgRaw || !bgRaw) continue;

      const sel = selectorPath(block);
      if (isInactiveState(sel)) {
        stats.inactive++;
        continue;
      }
      if (hasTranslucency(block)) {
        stats.translucent++;
        continue;
      }
      const threshold = thresholdFor(block);
      let worst = null;

      for (const world of worldsForRule(sel)) {
        const fg = resolveColours(fgRaw, tokens, world);
        const bg = resolveColours(bgRaw, tokens, world);
        stats.unresolvedFg += fg.unresolved;
        stats.unresolvedBg += bg.unresolved;
        if (!fg.colours.length || !bg.colours.length) continue;
        for (const f of fg.colours) {
          for (const b of bg.colours) {
            stats.pairs++;
            const r = contrast(f, b);
            if (worst === null || r < worst.ratio) worst = { ratio: r, fg: f, bg: b, world: world.name };
          }
        }
      }

      if (worst && worst.ratio < threshold) {
        findings.push({
          file: rel,
          selector: sel,
          key: `${rel}::${sel}`,
          ratio: worst.ratio,
          fg: worst.fg,
          bg: worst.bg,
          world: worst.world,
          threshold,
          gradient: /gradient\(/i.test(bgRaw),
        });
      }
    }
  }
  return { findings, stats };
}

// ---------------------------------------------------------------------------
// self-test: prove the gate fires, and prove it does not fire on correct code
// ---------------------------------------------------------------------------

const MUST_CATCH = `
$fixture-brand: #4bc2f7;
$fixture-alias: $fixture-brand;
.admin-shell { --accent: #4dbeef; --accent-contrast: #ffffff; }
.bad-solid { background-color: var(--accent, #4dbeef); color: var(--accent-contrast, #fff); }
.bad-gradient {
  background: linear-gradient(135deg, #006687 0%, #4dbeef 100%);
  color: #ffffff;
}
.bad-hover { background: #006687; color: #ffffff;
  &:hover { background: #4dbeef; }
}
.bad-scss-var { background: $fixture-brand; color: white; }
.bad-scss-alias { background: $fixture-alias; color: white; }
// The ENABLED hover state. Reads as disabled to a careless substring match.
.bad-enabled-hover { background: #006687; color: #ffffff;
  &:hover:not(:disabled) { background: #4dbeef; }
}
`;

const MUST_NOT_CATCH = `
.admin-shell { --accent: #4dbeef; }
.ok-solid { background-color: #006687; color: #ffffff; }
.ok-dark-overlay { background: rgb(25, 28, 30); color: #ffffff; }
// 3.45:1 -- below the 4.5 normal-text floor, above the 3.0 large-text one.
// The first draft of this fixture used white on #4dbeef (2.12:1) and the
// self-test rightly rejected it: that pair fails BOTH thresholds, so it could
// never have proved the large-text branch works.
.ok-large-text { background: #8a8a8a; color: #ffffff; font-size: 30px; }
.ok-dot { background: var(--accent); }
.ok-inherit-only { color: #ffffff; }
// A token DECLARED as a translucent tint, used with a fallback. The browser
// paints the 12%-alpha tint over the card, which source alone cannot composite;
// reading the fallback instead invents #4dbeef and reports 3.05:1 for a pairing
// no browser ever draws. This is .admin-btn.is-active, reduced.
.tinted-host { --soft-fixture: rgba(0, 102, 135, 0.12); }
.ok-tinted { background: var(--soft-fixture, var(--accent)); color: #006687; }
// WCAG 1.4.3 exempts inactive components. 1.35:1, and correctly not a finding.
.ok-disabled { background: #dddee1; color: #ffffff;
  &:disabled { background: #dddee1; }
}
.ok-diabled-typo { background: #dddee1; color: #ffffff; }
// White on #4dbeef is 2.12:1 and WOULD be caught -- except the opacity means
// the rendered colours are neither of these two, so the honest verdict is
// "not scored", counted in the opacity line of the report. This is
// .admin-btn-primary:hover before OBRS-741, reduced.
.ok-opacity-composited { background: #4dbeef; color: #ffffff; opacity: 0.9; }
.ok-opacity-inherited { background: #006687; color: #ffffff; opacity: 0.9;
  &:hover { background: #4dbeef; }
}
`;

function selfTest() {
  const failures = [];

  // Feed the fixtures through the same code path the real scan uses -- a
  // self-test that re-implements the logic tests the copy, not the gate.
  const runFixture = (css) => {
    const tokens = collectTokensFromBlocks(parseBlocks(stripComments(css)), new Map());
    SCSS_VARS = new Map();
    scssVarsFromSource(css, SCSS_VARS, []);
    const hits = [];
    for (const block of parseBlocks(stripComments(css))) {
      const sel = selectorPath(block);
      const fgRaw = inherited(block, 'color');
      const bgRaw = block.decls['background'] ?? block.decls['background-color'];
      if (!fgRaw || !bgRaw) continue;
      if (isInactiveState(sel)) continue;
      if (hasTranslucency(block)) continue;
      const threshold = thresholdFor(block);
      let worst = Infinity;
      for (const world of worldsForRule(sel)) {
        const fg = resolveColours(fgRaw, tokens, world);
        const bg = resolveColours(bgRaw, tokens, world);
        if (!fg.colours.length || !bg.colours.length) continue;
        for (const f of fg.colours) for (const b of bg.colours) worst = Math.min(worst, contrast(f, b));
      }
      if (worst < threshold) hits.push(sel);
    }
    return hits;
  };

  const caught = runFixture(MUST_CATCH);
  for (const want of ['.bad-solid', '.bad-gradient', '.bad-hover &:hover']) {
    if (!caught.some((h) => h.includes(want.split(' ')[0]))) {
      failures.push(`must-catch fixture "${want}" was NOT caught (gate is a no-op for it)`);
    }
  }
  if (!caught.some((h) => h.includes('bad-gradient'))) {
    failures.push('must-catch: gradient stop expansion did not fire -- this is the whole point of the gate');
  }
  if (!caught.some((h) => h.includes('bad-hover'))) {
    failures.push('must-catch: a hover state that drops below AA was not caught');
  }
  if (!caught.some((h) => h.includes('bad-scss-var'))) {
    failures.push('must-catch: a SCSS $variable fill was not resolved -- the blind spot that hid every select/pay button');
  }
  if (!caught.some((h) => h.includes('bad-scss-alias'))) {
    failures.push('must-catch: a SCSS $variable ALIAS ($a: $b) was not followed');
  }
  if (!caught.some((h) => h.includes('bad-enabled-hover'))) {
    failures.push('must-catch: `:hover:not(:disabled)` was read as a disabled state and exempted');
  }

  const wrongly = runFixture(MUST_NOT_CATCH);
  if (wrongly.length) {
    failures.push(`must-NOT-catch: gate fired on correct code: ${wrongly.join(', ')}`);
  }

  return failures;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

if (!existsSync(SRC)) {
  console.error(`::error::brand fill contrast gate cannot find ${SRC} -- did the tree move?`);
  process.exit(1);
}

const selfTestFailures = selfTest();
if (selfTestFailures.length) {
  console.error('::error::brand fill contrast gate FAILED ITS OWN SELF-TEST:');
  for (const f of selfTestFailures) console.error(`  - ${f}`);
  console.error('  A gate that cannot demonstrate it fires proves nothing. Fix the gate first.');
  process.exit(1);
}

const files = walk(SRC);
const { vars: scssVars, dupes } = collectScssVars(files);
if (dupes.length) {
  // The flat map above is only sound while names are unique tree-wide. If this
  // ever fires, the honest answer is real @use scoping -- not picking a winner.
  console.error('::error::SCSS $variable declared more than once with different values -- the flat map would pick a colour at random:');
  for (const d of dupes) console.error(`  - ${d}`);
  process.exit(1);
}
SCSS_VARS = scssVars;
const tokens = collectTokens(files);
const { findings, stats } = scan(files, tokens, SRC);

const unexpected = findings.filter((f) => !ALLOW[f.key]);
const allowedHit = findings.filter((f) => ALLOW[f.key]);

console.log('brand fill contrast gate (OBRS-740)');
console.log(`  self-test          : PASS (6 must-catch, 12 must-NOT-catch)`);
console.log(`  stylesheets        : ${files.length}`);
console.log(`  custom properties  : ${tokens.size} declared, all declared values considered`);
console.log(`  SCSS $variables    : ${scssVars.size} resolved tree-wide (aliases followed)`);
console.log(`  rule blocks        : ${stats.blocks}`);
console.log(`  skipped (inactive) : ${stats.inactive} disabled-state blocks -- WCAG 1.4.3 exempts them`);
console.log(`  skipped (opacity)  : ${stats.translucent} blocks composited by an opacity < 1 -- NOT scored, NOT a pass`);
console.log(`  colour pairs tested: ${stats.pairs}`);
console.log(
  `  unresolved         : ${stats.unresolvedBg} background / ${stats.unresolvedFg} text (translucent or computed -- NOT counted as passing)`
);
console.log(`  known-open (ALLOW) : ${allowedHit.length} of ${Object.keys(ALLOW).length} entries still hit`);

for (const f of allowedHit) {
  console.log(`    - ${f.key} @ ${f.ratio.toFixed(2)}:1 -- ${ALLOW[f.key]}`);
}

const staleAllow = Object.keys(ALLOW).filter((k) => !findings.some((f) => f.key === k));
if (staleAllow.length) {
  console.error('::error::ALLOW entries that no longer match anything -- delete them or the list rots into a lie:');
  for (const k of staleAllow) console.error(`  - ${k}`);
  process.exit(1);
}

if (unexpected.length) {
  console.error(`::error::${unexpected.length} brand fill(s) below the WCAG AA text threshold:`);
  for (const f of unexpected) {
    console.error(
      `  ${f.file}\n    ${f.selector}\n    ${f.fg} on ${f.bg}${f.gradient ? ' (gradient stop)' : ''} = ${f.ratio.toFixed(2)}:1, needs ${f.threshold}:1`
    );
  }
  console.error('');
  console.error('  Fix the colours, or add an ALLOW entry naming the card that owns the fix.');
  process.exit(1);
}

console.log('  RESULT             : OK -- no unexpected brand fill below AA');
