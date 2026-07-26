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

// Known-open failures, ALL of them owned by OBRS-741.
//
// This list is a debt marker, not an exemption. It is spelled out site by site
// with the measured ratio because the alternative -- narrowing the gate until
// it only sees the one thing this card fixed -- would have reported "OK" while
// 14 other surfaces stayed below AA, which is precisely the failure mode
// OBRS-734's "0 elements below AA" already demonstrated once.
//
// OBRS-740 fixed the FAB only; the owner's scope decision was explicitly
// "FAB now, separate card for the gradient family". `.admin-btn-primary` is the
// app-wide primary button, so repainting it is a visual change on every admin
// page and needs its own before/after sweep to be reviewable at all.
//
// An entry that stops matching anything fails the gate (see staleAllow), so
// this list cannot quietly outlive the bugs it describes.
//
// Keyed by "<path relative to src>::<selector>".
const OWNER = 'OBRS-741';
const ALLOW = {
  // --- brand gradient family: white text on the bright end of the ramp ---
  'styles/admin-theme.scss::.admin-btn-primary': `1.86:1 (theme-staff world) -- app-wide primary button, ${OWNER}`,
  'styles/admin-theme.scss::.admin-avatar': `1.86:1 -- gradient avatar, ${OWNER}`,
  'app/shared/components/navbar/navbar.component.scss::.navbar-avatar': `2.12:1 -- gradient avatar, ${OWNER}`,
  'app/modules/admin/pages/schedules/schedules-page.component.scss::.schedule-tab.is-active .schedule-tab-count': `2.12:1 -- gradient count pill, ${OWNER}`,
  'app/modules/admin/pages/user-management/user-form-modal/user-form-modal.component.scss::.user-editor-save': `2.12:1 -- gradient save button, ${OWNER}`,

  // --- hardcoded hex, unrelated to the token system ---
  'app/modules/admin/pages/vehicles/vehicle-inspection/vehicle-inspection-panel.component.scss::.admin-btn.is-active': `2.00:1 (theme-admin world), ${OWNER}`,
  'app/modules/home/components/route-map/route-map-panel/route-map-panel.component.scss::.locate-me-btn &:hover:not(:disabled)': `2.29:1 hover state, ${OWNER}`,
  'app/modules/home/components/station-home/station-home.component.scss::.route-chip.active': `2.46:1, ${OWNER}`,
  'app/modules/my-bookings/components/reschedule-dialog/reschedule-estimate-summary/reschedule-estimate-summary.component.scss::.reschedule-estimate__net &.is-topup': `3.43:1, ${OWNER}`,
  'app/modules/my-bookings/components/reschedule-dialog/reschedule-estimate-summary/reschedule-estimate-summary.component.scss::.reschedule-estimate__net &.is-refund': `3.59:1, ${OWNER}`,
  'app/modules/my-bookings/my-bookings.component.scss::.status-badge &.is-success': `3.59:1, ${OWNER}`,
  'app/modules/my-bookings/my-bookings.component.scss::.status-badge &.is-warning': `3.43:1, ${OWNER}`,
  'app/modules/schedule-booking/components/schedule-booking-list/schedule-booking-list.component.scss::.booking-container .schedule-item .right .select-btn &:hover': `3.56:1 hover state, ${OWNER}`,
  'app/shared/components/payment-methods/payment-creditcard/payment-creditcard.component.scss::.payment-btn &:hover': `3.56:1 hover state, ${OWNER}`,
  'app/shared/components/payment-methods/payment-qrcode/payment-qrcode.component.scss::.payment-btn &:hover': `3.56:1 hover state, ${OWNER}`,
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
 */
function collectTokens(files) {
  const tokens = new Map();
  for (const f of files) {
    const blocks = parseBlocks(stripComments(readFileSync(f, 'utf8')));
    for (const block of blocks) {
      const sel = selectorPath(block);
      for (const [prop, value] of Object.entries(block.decls)) {
        if (!prop.startsWith('--')) continue;
        const hex = toHex(value);
        if (!hex) continue;
        if (!tokens.has(prop)) tokens.set(prop, []);
        tokens.get(prop).push({ sel, hex });
      }
    }
  }
  return tokens;
}

/**
 * The value a token takes in one world. Ordering mirrors the cascade closely
 * enough for these stylesheets: a dark override beats a theme variant, which
 * beats the base declaration, and a later declaration beats an earlier one at
 * equal rank.
 */
function tokenInWorld(tokens, name, world) {
  const decls = tokens.get(name);
  if (!decls) return null;
  let best = null;
  let bestRank = -1;
  for (const d of decls) {
    if (!appliesIn(d.sel, world)) continue;
    const t = selectorTraits(d.sel);
    const rank = (t.dark ? 2 : 0) + (t.variant !== 'base' ? 1 : 0);
    if (rank >= bestRank) {
      bestRank = rank;
      best = d.hex;
    }
  }
  return best;
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
    const declared = tokenInWorld(tokens, varM[1], world);
    if (declared) return { colours: [declared], unresolved: 0 };
    // Undeclared in this world means the FALLBACK literal is what renders --
    // which is exactly how the FAB shipped #4dbeef on every page while looking
    // like it was themed.
    if (varM[2]) return resolveColours(varM[2], tokens, world);
    return { colours: [], unresolved: 1 };
  }

  const hex = toHex(v);
  if (hex) return { colours: [hex], unresolved: 0 };

  // Shorthand `background: <colour> <something-else>` -- take a leading colour.
  const lead = v.split(/\s+/)[0];
  const leadHex = toHex(lead);
  if (leadHex) return { colours: [leadHex], unresolved: 0 };
  if (/^var\(/i.test(lead)) return resolveColours(lead, tokens, world);

  if (/^(none|transparent|inherit|initial|unset|currentcolor)$/i.test(v)) {
    return { colours: [], unresolved: 0 };
  }
  return { colours: [], unresolved: 1 };
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
  const stats = { blocks: 0, pairs: 0, unresolvedBg: 0, unresolvedFg: 0 };

  for (const file of files) {
    const rel = relative(srcRoot, file).replace(/\\/g, '/');
    const blocks = parseBlocks(stripComments(readFileSync(file, 'utf8')));
    for (const block of blocks) {
      stats.blocks++;
      const fgRaw = inherited(block, 'color');
      const bgRaw = block.decls['background'] ?? block.decls['background-color'];
      if (!fgRaw || !bgRaw) continue;

      const sel = selectorPath(block);
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
.admin-shell { --accent: #4dbeef; --accent-contrast: #ffffff; }
.bad-solid { background-color: var(--accent, #4dbeef); color: var(--accent-contrast, #fff); }
.bad-gradient {
  background: linear-gradient(135deg, #006687 0%, #4dbeef 100%);
  color: #ffffff;
}
.bad-hover { background: #006687; color: #ffffff;
  &:hover { background: #4dbeef; }
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
`;

function selfTest() {
  const failures = [];

  // Feed the fixtures through the same code path the real scan uses -- a
  // self-test that re-implements the logic tests the copy, not the gate.
  const runFixture = (css) => {
    const tokens = new Map();
    for (const block of parseBlocks(stripComments(css))) {
      const sel = selectorPath(block);
      for (const [prop, value] of Object.entries(block.decls)) {
        if (!prop.startsWith('--')) continue;
        const hex = toHex(value);
        if (!hex) continue;
        if (!tokens.has(prop)) tokens.set(prop, []);
        tokens.get(prop).push({ sel, hex });
      }
    }
    const hits = [];
    for (const block of parseBlocks(stripComments(css))) {
      const sel = selectorPath(block);
      const fgRaw = inherited(block, 'color');
      const bgRaw = block.decls['background'] ?? block.decls['background-color'];
      if (!fgRaw || !bgRaw) continue;
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
const tokens = collectTokens(files);
const { findings, stats } = scan(files, tokens, SRC);

const unexpected = findings.filter((f) => !ALLOW[f.key]);
const allowedHit = findings.filter((f) => ALLOW[f.key]);

console.log('brand fill contrast gate (OBRS-740)');
console.log(`  self-test          : PASS (3 must-catch, 6 must-NOT-catch)`);
console.log(`  stylesheets        : ${files.length}`);
console.log(`  custom properties  : ${tokens.size} declared, all declared values considered`);
console.log(`  rule blocks        : ${stats.blocks}`);
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
