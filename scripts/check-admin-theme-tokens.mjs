// Admin theme dark-mode token gate (OBRS-520).
//
// Why this exists: OBRS keeps shipping admin/staff surfaces that are correct in
// light mode and broken in dark mode, and NOTHING catches it. Unit tests do not
// evaluate colour, dark mode is rarely toggled during development, and a rule
// that references a themed token *looks* theme-aware whether or not that token
// is actually themed. That last point is the trap: design-system.md said
// `.admin-btn-danger` "composes the existing tokens (no new hex)" and it was
// read as "safe in dark mode" -- but --admin-danger-text is declared only in the
// light block, so the button rendered #93000a on the #1d2226 dark card at
// 1.71:1 and shipped invisible. `.admin-required` (19 admin forms), the
// usability-reports "notified" pill (1.84:1) and --admin-delayed-* went the same
// way. Three separate cards wrote the lesson down as prose; prose did not hold.
//
// Two mechanical invariants, both of which the shipped bugs violated:
//
//   1. Every --admin-* custom property declared in the light `.admin-shell`
//      block either has a dark override in an `.admin-shell.is-dark` block, or
//      is listed in DARK_EXEMPT below WITH a written reason. Adding a token and
//      forgetting dark mode now fails; deciding a token does not need dark mode
//      is still allowed, but has to be said out loud and reviewed.
//
//   2. Every `var(--admin-*)` reference anywhere under src/ resolves to a token
//      that is actually declared. A reference to a token nobody declared is not
//      an error in CSS -- it silently falls through to the `var(--x, #hex)`
//      fallback, or to nothing. `--admin-success-soft` sat like that from
//      OBRS-115 until this card.
//
// Reads files with fs -- no Angular/Karma bundling -- so it is fast and runs
// even before `npm ci`. Run locally with: npm run test:theme-tokens
//
// ASCII-only source.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

/**
 * Strip SCSS/CSS comments before scanning.
 *
 * Not cosmetic: without this the gate reads its own paper trail as code. The
 * OBRS-520 fix for `--admin-surface-muted` replaced the bad reference with a
 * comment explaining what it used to be -- and the gate then re-reported the
 * token it had just caused to be fixed. A rule you cannot write a comment about
 * is a rule people route around.
 *
 * `//` is only treated as a comment when it is not preceded by `:` so that
 * `url(https://...)` survives.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(HERE, '..', 'src');
const THEME = join(SRC, 'styles', 'admin-theme.scss');

// Tokens that are deliberately light-only. A token may live here ONLY with a
// reason a reviewer can disagree with -- "we forgot" is not one.
const DARK_EXEMPT = {
  '--admin-primary':
    'brand constant, not a surface colour; used for accents that keep their hue in both themes',
  '--admin-secondary': 'as --admin-primary',
  '--admin-accepted-bg':
    'saturated green pastel chip, measured 9.77:1 on the dark shell -- reads as a chip, not a white block (OBRS-520)',
  '--admin-accepted-text':
    'pairs with --admin-accepted-bg above; the standalone-text role was split out to --admin-accepted-fg, which IS themed (OBRS-726)',
  '--admin-success-bg':
    'pastel chip, measured 6.75:1 on the dark shell (OBRS-520); the standalone-text role was split out to --admin-success-fg, which IS themed',
  '--admin-success-text': 'pairs with --admin-success-bg above',
  '--admin-success-soft': 'pairs with --admin-success-bg above; light chip fill in both themes',
  '--admin-warning-bg': 'pastel chip, measured 7.44:1 on the dark shell (OBRS-520)',
  '--admin-warning-text':
    'pairs with --admin-warning-bg above; the standalone-text role was split out to --admin-warning-fg, which IS themed (OBRS-726)',
  '--admin-danger-bg':
    'pastel chip, measured 7.24:1 on the dark shell (OBRS-520); the standalone-text and hover-fill roles were split out to --admin-danger-fg / --admin-danger-surface, which ARE themed',
  '--admin-danger-text':
    'pairs with --admin-danger-bg above, and is also the solid fill of .admin-nav-badge -- flipping it for dark mode would turn that badge light-on-light (OBRS-520)',
  '--admin-primary-bright':
    'the bright stop of the brand button gradient, always paired with --admin-primary in the SAME gradient -- like --admin-primary it keeps its hue in both themes; the button is a solid brand fill, not a surface that has to recede in dark mode (OBRS-734)',
  '--admin-on-primary':
    'text sitting ON that brand gradient, which is identical in both themes -- so the text on it must be too; measured white-on-gradient, not white-on-surface (OBRS-734)',
};

if (!existsSync(THEME)) {
  console.error(`::error::admin theme token gate cannot find ${THEME} -- did the file move?`);
  process.exit(1);
}
const theme = stripComments(readFileSync(THEME, 'utf8'));

/** Collect `--token: value;` declarations inside each brace block we care about. */
function declarationsIn(source, selectorRe) {
  const found = new Map();
  for (const m of source.matchAll(selectorRe)) {
    // Walk braces from the selector to find the matching close.
    let i = source.indexOf('{', m.index);
    if (i < 0) continue;
    let depth = 0;
    let end = i;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = source.slice(i + 1, end);
    for (const d of body.matchAll(/(--admin-[a-z0-9-]+)\s*:/g)) {
      if (!found.has(d[1])) found.set(d[1], m[0].trim());
    }
  }
  return found;
}

// The light block is `.admin-shell {` -- NOT `.admin-shell.is-dark {` and not
// `.admin-shell.theme-* {`. Anchor on the brace to keep the distinction exact.
const lightTokens = declarationsIn(theme, /^\.admin-shell\s*\{/gm);
const darkTokens = declarationsIn(theme, /^\.admin-shell\.is-dark\s*\{/gm);

const problems = [];

// --- invariant 1: light token without a dark override or a stated exemption ---
for (const token of lightTokens.keys()) {
  if (darkTokens.has(token)) continue;
  if (Object.prototype.hasOwnProperty.call(DARK_EXEMPT, token)) continue;
  problems.push(
    `${token} is declared in the light .admin-shell block but has NO .admin-shell.is-dark ` +
      `override and no entry in DARK_EXEMPT. Either add the dark value, or add it to ` +
      `DARK_EXEMPT in ${relative(SRC, fileURLToPath(import.meta.url)) || 'this gate'} with a reason.`
  );
}

// --- an exemption for a token that no longer exists is stale bookkeeping ---
for (const token of Object.keys(DARK_EXEMPT)) {
  if (!lightTokens.has(token)) {
    problems.push(
      `${token} is listed in DARK_EXEMPT but is not declared in the light .admin-shell block ` +
        `-- the exemption is stale, remove it.`
    );
  } else if (darkTokens.has(token)) {
    problems.push(
      `${token} is listed in DARK_EXEMPT but DOES have a dark override -- the exemption ` +
        `contradicts the stylesheet, remove it.`
    );
  }
}

// --- invariant 2: every var(--admin-*) reference resolves to a declared token ---
const styleFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(scss|css)$/.test(entry)) styleFiles.push(p);
  }
})(SRC);

// A component stylesheet may re-declare the tokens locally (several
// customer-facing pages do, since --admin-* only exists inside .admin-shell).
// Count those as declarations too, per file.
const referenced = new Map(); // token -> Set(file)
for (const file of styleFiles) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const localDecls = new Set([...src.matchAll(/(--admin-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  for (const m of src.matchAll(/var\(\s*(--admin-[a-z0-9-]+)/g)) {
    if (localDecls.has(m[1])) continue;
    if (!referenced.has(m[1])) referenced.set(m[1], new Set());
    referenced.get(m[1]).add(relative(SRC, file));
  }
}
for (const [token, files] of referenced) {
  if (lightTokens.has(token) || darkTokens.has(token)) continue;
  problems.push(
    `${token} is referenced by var() in [${[...files].slice(0, 4).join(', ')}] but is NEVER ` +
      `declared -- the rule silently falls through to its fallback (or to nothing).`
  );
}

// --- invariant 3: no NEW opaque colour literal in an admin stylesheet ---------
//
// Why (OBRS-734): invariants 1 and 2 only see identifiers that start with
// `--admin-`. A component can bypass the whole token system by declaring its own
// private, light-only variables -- `--text: #191c1e; --muted: #3e484e;` plus a
// hardcoded `background: rgba(255,255,255,.88)` panel -- and this gate stays
// green while the component ships broken. That is exactly what happened: the
// user-form and role-form modals kept a near-white panel in dark mode while the
// global theme flipped their label text to #e7edf1, so every field label
// rendered light-on-light at 1.03-1.08:1. A user reported it as "I cannot see
// the words at all". The gate written to prevent that class of bug did not fire.
//
// Two things are allowed and are NOT bookkeeping debt:
//   * a translucent literal (alpha <= TRANSLUCENT_MAX). It composites over
//     whatever themed surface is behind it, so it carries no fixed light/dark
//     assumption. The cap matters: rgba(255,255,255,0.88) is 88% white, i.e.
//     effectively an opaque light panel, and IS the bug this invariant exists
//     for -- so anything above the cap is treated as opaque.
//   * `var(--token, #fallback)`. The token leads; the literal is the fallback.
//
// Everything else is a per-file COUNT ratchet. Existing debt is frozen at its
// exact number so nothing new can slip in, and fixing some of it FAILS the gate
// until the number is lowered -- a ratchet that only tightens.
const LITERAL_SCOPE = join(SRC, 'app', 'modules', 'admin');
const TRANSLUCENT_MAX = 0.8;
const COLOUR_DECL =
  /(?:^|[;{}\s])(color|background|background-color|border(?:-(?:top|right|bottom|left))?-color|caret-color|outline-color|fill|stroke)\s*:\s*([^;}]+)/g;
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;
const RGBA_ALPHA = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/g;

// path (relative to LITERAL_SCOPE, forward slashes) -> exact number of opaque
// literals still present. Lower the number when you migrate some; delete the
// entry when it reaches 0. Adding an entry needs a reason a reviewer can argue with.
const LITERAL_PENDING = {
  // Tab bar, focus banner and dropdown accents. These already have a deliberate
  // `:host-context(.is-dark)` override block from OBRS-209/230 -- a different,
  // documented mechanism -- so they are not broken today; they are simply not on
  // tokens yet. Migrating them means deleting those override blocks too, which is
  // a wider change than the modal-panel defect OBRS-734 was raised for.
  'pages/schedules/schedules-page.component.scss': 10,
  'pages/vehicles/vehicles-page.component.scss': 7,
  // admin-dropdown is deliberately NOT here any more: it started at 6 and went to 0 in this
  // same card, because the live probe showed its open/selected rows measured 1.91:1 in dark.
  // The ratchet is what forced this line to be deleted rather than quietly left at 6.
};

const literalFiles = styleFiles.filter((f) => f.startsWith(LITERAL_SCOPE));
const opaqueCounts = new Map();
const opaqueSamples = new Map();
for (const file of literalFiles) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const rel = relative(LITERAL_SCOPE, file).split('\\').join('/');
  for (const m of src.matchAll(COLOUR_DECL)) {
    const value = m[2].trim();
    if (!COLOUR_LITERAL.test(value)) continue;
    if (value.includes('var(')) continue; // token-first, literal is only a fallback
    // Translucent-only values are fine; a hex or a high-alpha rgba is not.
    const alphas = [...value.matchAll(RGBA_ALPHA)].map((a) => Number(a[1]));
    const hasHexOrOpaqueRgb = /#[0-9a-fA-F]{3,8}\b|rgb\(/.test(value);
    const allTranslucent =
      !hasHexOrOpaqueRgb && alphas.length > 0 && alphas.every((a) => a <= TRANSLUCENT_MAX);
    if (allTranslucent) continue;
    opaqueCounts.set(rel, (opaqueCounts.get(rel) || 0) + 1);
    if (!opaqueSamples.has(rel)) opaqueSamples.set(rel, `${m[1]}: ${value}`);
  }
}
for (const [rel, count] of opaqueCounts) {
  const allowed = LITERAL_PENDING[rel];
  if (allowed === undefined) {
    problems.push(
      `${rel} declares ${count} opaque colour literal(s) (e.g. \`${opaqueSamples.get(rel)}\`) but has ` +
        `no LITERAL_PENDING entry. Use a --admin-* token so the rule follows the theme; a private ` +
        `literal is how OBRS-734 shipped light-on-light labels in dark mode.`
    );
  } else if (count > allowed) {
    problems.push(
      `${rel} now declares ${count} opaque colour literal(s), up from the ${allowed} recorded in ` +
        `LITERAL_PENDING (e.g. \`${opaqueSamples.get(rel)}\`). The ratchet only tightens -- use a token.`
    );
  }
}
for (const [rel, allowed] of Object.entries(LITERAL_PENDING)) {
  const count = opaqueCounts.get(rel) || 0;
  if (count < allowed) {
    problems.push(
      `${rel} is down to ${count} opaque colour literal(s) from the ${allowed} in LITERAL_PENDING -- ` +
        `good, now lower (or delete) that entry so the ratchet holds the new floor.`
    );
  }
}

// --- invariant 4: a chip-half token used as a STANDALONE text/icon colour -----
//
// Why (OBRS-726, the 4th occurrence in the OBRS-520 family): invariants 1-3 can
// only ask "is this token declared?", and the chip-half tokens ARE declared and
// ARE deliberately in DARK_EXEMPT above -- so they pass every time. The defect
// is a token used in the WRONG ROLE: `--admin-danger-text` is the dark half of a
// pastel chip PAIR and is only ever legible on its own light `--admin-danger-bg`.
// Put it on an element with no fill of its own and it lands on the themed card
// surface, which in dark mode is #1d2226. Measured from the declared values:
//
//   --admin-accepted-text #0a3d1d standalone = 1.30:1 on --admin-surface-card
//   --admin-warning-text  #673a00 standalone = 1.67:1
//   --admin-danger-text   #93000a standalone = 1.71:1   <- the OBRS-520 ratio
//
// This had already happened four times (.admin-btn-danger + .admin-required in
// OBRS-520, the "notified" pill, .override-cancel-window.is-violation in
// OBRS-721, and three more sites in OBRS-726) and three cards wrote the rule
// down as prose. One of those prose notes even recorded the dead end -- "no
// warning-fg token exists yet" -- in the same file whose icon then used
// `--admin-accepted-text` bare anyway. Prose does not resolve to a colour.
//
// THE MATCHER, and why it is this one. The honest question is "does this text
// have a background of its own?", which no single-line regex can answer: the
// fill may be declared on the same rule, on an ancestor rule (SCSS nesting), or
// nowhere. So this walks a real brace tree and checks the declaration's own rule
// AND every ancestor rule. That makes the chip pairs -- which declare
// `background: var(--admin-*-bg)` right next to the `color:` -- invisible to it
// by construction, which is the point: measured on the tree this was written
// against (2026-07-26), 18 of the 21 chip-half foreground uses in src/ are
// correct chip pairs, and a matcher that flagged all 21 would be switched off
// within a week.
//
// Population reconciliation, because the raw grep number disagrees and the
// difference is not noise. `grep -E 'color:\s*var\(--admin-*-text'` reports 27
// on that tree; 6 of those are `border-color:`, which the substring `color:`
// also matches. 27 = 21 `color:`/`fill:` + 6 `border-color:`. Border colour is
// deliberately NOT in scope here: its WCAG target is 3:1 against the ADJACENT
// colour, not 4.5:1 against a background, and every one of those 6 sits in a
// dark-mode block that paints the same token as the fill on the same rule.
//
// KNOWN BLIND SPOTS, stated rather than papered over. A fill that arrives from a
// SIBLING rule (`.chip { background: x }` + `.chip { color: y }` written apart)
// or from an inline style is not visible here and would be reported. There is no
// such site today; if one appears, the fix is to pair the declarations or use
// the `*-fg` token, not to widen this rule until it sees nothing.
const CHIP_HALF_TOKENS = Object.keys(DARK_EXEMPT).filter((t) => /-text$/.test(t));
const FOREGROUND_DECL = /(?:^|[;{}\s])(color|fill)\s*:\s*var\(\s*(--admin-[a-z0-9-]+)/g;
const FILL_DECL = /(?:^|[;{}\s])(background|background-color|background-image)\s*:/;

/**
 * Parse a stylesheet into a brace tree. Comments must already be stripped.
 * At-rules (`@media`, `@supports`) become nodes too -- they declare no fill, so
 * they are transparent to the ancestor walk, which is what we want.
 */
function ruleTree(src) {
  const roots = [];
  const stack = [];
  let preludeStart = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      const node = {
        selector: src.slice(preludeStart, i).trim().replace(/\s+/g, ' '),
        bodyStart: i + 1,
        bodyEnd: src.length,
        parent: stack[stack.length - 1] || null,
        children: [],
      };
      if (node.parent) node.parent.children.push(node);
      else roots.push(node);
      stack.push(node);
      preludeStart = i + 1;
    } else if (ch === '}') {
      const node = stack.pop();
      if (node) node.bodyEnd = i;
      preludeStart = i + 1;
    } else if (ch === ';') {
      preludeStart = i + 1;
    }
  }
  return roots;
}

/** The node's own declarations -- its body with every nested block body removed. */
function ownText(src, node) {
  let out = '';
  let pos = node.bodyStart;
  for (const child of node.children) {
    out += src.slice(pos, child.bodyStart);
    pos = child.bodyEnd;
  }
  return out + src.slice(pos, node.bodyEnd);
}

/** Full selector chain, outermost first -- what a developer greps for. */
function selectorPath(node) {
  const parts = [];
  for (let n = node; n; n = n.parent) parts.unshift(n.selector);
  return parts.join(' > ');
}

// Sites that are standalone chip-half uses AND are deliberately staying that
// way, keyed "<path relative to src, forward slashes>::<selector path>". An
// entry needs a card key and the MEASURED reason, because "we decided it is
// fine" is not reviewable. A key that stops matching fails the gate (see
// staleAllow below), so this list cannot outlive the situation it describes.
const STANDALONE_CHIP_ALLOW = {
  'app/modules/staff/components/parcel-intake-result-panel/parcel-intake-result-panel.component.scss::.parcel-intake-result-icon':
    'OBRS-747 -- measured in ChromeHeadless: the surface painted behind this 48px glyph is ' +
    '#ffffff in BOTH themes, because parcel-consign-page wraps the panel in a raw Bootstrap ' +
    '`.card` that nothing repaints for dark mode. The chip token ships at 12.37:1 there; the ' +
    'themed --admin-accepted-fg would ship at 1.67:1. Fixing the SURFACE is OBRS-747, and this ' +
    'entry is deleted as part of it. Pinned by the `contrast of .parcel-intake-result-icon` ' +
    'block in parcel-intake-result-panel.component.spec.ts.',
};

/**
 * @param sources [{ rel, text }] with comments already stripped
 * @param allow   map of "rel::selector" -> reason, exempted from the violation list
 * @returns { violations, pairedCount, totalCount, allowedKeys }
 */
function findStandaloneChipUses(sources, allow = {}) {
  const violations = [];
  const allowedKeys = new Set();
  let pairedCount = 0;
  let totalCount = 0;
  for (const { rel, text } of sources) {
    const visit = (node) => {
      const own = ownText(text, node);
      for (const m of own.matchAll(FOREGROUND_DECL)) {
        const [, property, token] = m;
        if (!CHIP_HALF_TOKENS.includes(token)) continue;
        totalCount++;
        let filled = false;
        for (let n = node; n; n = n.parent) {
          if (FILL_DECL.test(ownText(text, n))) {
            filled = true;
            break;
          }
        }
        if (filled) {
          pairedCount++;
          continue;
        }
        const allowKey = `${rel}::${selectorPath(node)}`;
        if (Object.prototype.hasOwnProperty.call(allow, allowKey)) {
          allowedKeys.add(allowKey);
          continue;
        }
        violations.push(
          `${rel} -> \`${selectorPath(node)}\` sets \`${property}: var(${token})\` with NO ` +
            `background on that rule or any rule containing it. ${token} is the dark half of a ` +
            `pastel CHIP pair (see DARK_EXEMPT) and is only legible on its own ` +
            `${token.replace(/-text$/, '-bg')} -- standing alone it lands on the themed card ` +
            `surface and measures 1.3-1.7:1 in dark mode. Use ${token.replace(/-text$/, '-fg')}, ` +
            `which is themed in both modes (design-system.md §2.4.0).`
        );
      }
      node.children.forEach(visit);
    };
    ruleTree(text).forEach(visit);
  }
  return { violations, pairedCount, totalCount, allowedKeys };
}

// SELF-TEST, run on every invocation before the real scan. A gate nobody proved
// can fire is prose with a shebang -- and a gate nobody proved STAYS QUIET on
// the correct 22 sites is a gate that gets deleted. Both directions, in-process.
const MUST_CATCH = [
  { rel: 'catch/bare.scss', text: '.x { color: var(--admin-danger-text); }' },
  {
    rel: 'catch/fill-is-in-a-child-not-an-ancestor.scss',
    text: '.x { color: var(--admin-warning-text); &:hover { background: #fff; } }',
  },
  { rel: 'catch/icon-fill.scss', text: '.i { fill: var(--admin-accepted-text); }' },
  {
    rel: 'catch/nested-under-a-fill-less-ancestor.scss',
    text: '.card { padding: 8px; .label { color: var(--admin-success-text); } }',
  },
];
const MUST_NOT_CATCH = [
  {
    rel: 'nocatch/chip-pair-same-rule.scss',
    text: '.chip { background: var(--admin-danger-bg); color: var(--admin-danger-text); }',
  },
  {
    rel: 'nocatch/fill-on-the-ancestor.scss',
    text: '.card { background: #fff; .label { color: var(--admin-warning-text); } }',
  },
  {
    rel: 'nocatch/opaque-literal-fill-same-rule.scss',
    text: '.badge { color: var(--admin-danger-text); background: #fff; }',
  },
  {
    rel: 'nocatch/themed-surface-token.scss',
    text: '.x { color: var(--admin-danger-fg); } .y { color: var(--admin-warning-fg); }',
  },
  {
    rel: 'nocatch/chip-token-used-as-a-fill.scss',
    text: '.dark .btn { background: var(--admin-success-text); border-color: var(--admin-success-text); }',
  },
  {
    rel: 'nocatch/fill-on-an-at-rule-ancestors-parent.scss',
    text: '.card { background: #fff; @media (min-width: 40em) { .label { color: var(--admin-accepted-text); } } }',
  },
];
// One fixture proves the ALLOW path itself: same bad shape as MUST_CATCH[0],
// silenced only by an entry. Without this, the ALLOW branch would be the one
// piece of this invariant nothing ever executes -- and it is the piece that
// carries a deliberate exception, i.e. the piece most worth getting wrong.
const ALLOW_FIXTURE = [{ rel: 'allow/exempted.scss', text: '.x { color: var(--admin-danger-text); }' }];
const ALLOW_FIXTURE_MAP = { 'allow/exempted.scss::.x': 'fixture -- exercises the ALLOW branch' };

{
  const caught = findStandaloneChipUses(MUST_CATCH);
  const quiet = findStandaloneChipUses(MUST_NOT_CATCH);
  const allowed = findStandaloneChipUses(ALLOW_FIXTURE, ALLOW_FIXTURE_MAP);
  const unallowed = findStandaloneChipUses(ALLOW_FIXTURE);
  const selfTestErrors = [];
  if (allowed.violations.length !== 0 || allowed.allowedKeys.size !== 1) {
    selfTestErrors.push(
      `ALLOW branch: expected 0 violation(s) and 1 recorded key, got ` +
        `${allowed.violations.length} and ${allowed.allowedKeys.size} -- an exemption that does ` +
        `not silence, or does not record itself, breaks the stale-entry check too.`
    );
  }
  if (unallowed.violations.length !== 1) {
    selfTestErrors.push(
      `ALLOW branch: the SAME fixture with no entry produced ${unallowed.violations.length} ` +
        `violation(s), expected 1 -- so the previous check proved nothing about the exemption.`
    );
  }
  if (caught.violations.length !== MUST_CATCH.length) {
    selfTestErrors.push(
      `must-CATCH: expected ${MUST_CATCH.length} violation(s), got ${caught.violations.length} ` +
        `-- the standalone-chip-token matcher has stopped seeing the bug it exists for.`
    );
  }
  if (quiet.violations.length !== 0) {
    selfTestErrors.push(
      `must-NOT-catch: expected 0, got ${quiet.violations.length}: ${quiet.violations.join(' | ')} ` +
        `-- a false positive here is how a gate earns the reputation that gets it deleted.`
    );
  }
  if (quiet.pairedCount < 4) {
    selfTestErrors.push(
      `must-NOT-catch fixtures only produced ${quiet.pairedCount} PAIRED use(s) -- the fixtures ` +
        `themselves stopped exercising the pairing path, so "0 false positives" proves nothing.`
    );
  }
  if (selfTestErrors.length > 0) {
    console.error('::error::admin theme token gate SELF-TEST FAILED (invariant 4):');
    for (const e of selfTestErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

// Population floor. Measured on 2026-07-26 (OBRS-726): 21 chip-half foreground
// uses across src/ before the fix (18 chip-paired + 3 standalone), 18 after. If
// this count collapses, the matcher has stopped matching and "0 violations"
// becomes a vacuous pass rather than a clean repo -- the exact failure mode
// OBRS-734's "0 elements below AA" already demonstrated once.
//
// The floor is set BELOW today's 18 on purpose. Pinning it at 18 would fail the
// gate every time somebody legitimately deletes a status chip, which trains
// people to edit the number without reading it. 14 still catches the failure
// this guard is for (a rename or a property change that drops the count to ~0)
// while tolerating ordinary churn.
const MIN_CHIP_HALF_USES = 14;
const chipScan = findStandaloneChipUses(
  styleFiles.map((f) => ({
    rel: relative(SRC, f).split('\\').join('/'),
    text: stripComments(readFileSync(f, 'utf8')),
  })),
  STANDALONE_CHIP_ALLOW
);
problems.push(...chipScan.violations);

// A stale exemption is worse than no exemption: it reads as "reviewed and
// accepted" for a site that no longer exists, and it is how a debt list quietly
// outlives the debt.
for (const key of Object.keys(STANDALONE_CHIP_ALLOW)) {
  if (!chipScan.allowedKeys.has(key)) {
    problems.push(
      `STANDALONE_CHIP_ALLOW has an entry for \`${key}\` but nothing in src/ matches it any more ` +
        `-- either the rule/selector was renamed (update the key) or the site was fixed (delete ` +
        `the entry). Reason on file: ${STANDALONE_CHIP_ALLOW[key]}`
    );
  }
}
if (chipScan.totalCount < MIN_CHIP_HALF_USES) {
  console.error(
    `::error::admin theme token gate invariant 4 found only ${chipScan.totalCount} chip-half ` +
      `foreground use(s), below the floor of ${MIN_CHIP_HALF_USES} (18 present, all chip-paired, ` +
      `when this was written). Either a refactor renamed the tokens/properties this rule keys ` +
      `on -- in which case fix the rule -- or the population really shrank, in which case lower ` +
      `the floor deliberately. Do not leave it silently matching nothing.`
  );
  process.exit(1);
}

// --- no-op guard: a gate that checks nothing is worse than a failing one ------
if (lightTokens.size === 0 || styleFiles.length === 0 || literalFiles.length === 0) {
  console.error(
    `::error::admin theme token gate FOUND NOTHING TO CHECK ` +
      `(lightTokens=${lightTokens.size}, styleFiles=${styleFiles.length}, ` +
      `adminStylesheets=${literalFiles.length}) -- the gate is a no-op. Verify SRC=${SRC}, the ` +
      `.admin-shell selectors in admin-theme.scss (OBRS-520), and LITERAL_SCOPE (OBRS-734).`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`admin theme token gate FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `::error::An --admin-* token is unthemed or undeclared -- ${problems.length} problem(s). ` +
      `This is how .admin-btn-danger shipped at 1.71:1 in dark mode (OBRS-520).`
  );
  process.exit(1);
}

const pendingTotal = Object.values(LITERAL_PENDING).reduce((a, b) => a + b, 0);
console.log(
  `admin theme token gate OK: ${lightTokens.size} light token(s), ${darkTokens.size} with a dark ` +
    `override, ${Object.keys(DARK_EXEMPT).length} deliberately exempt; ` +
    `${referenced.size} var(--admin-*) reference(s) across ${styleFiles.length} stylesheet(s) all resolve; ` +
    `${literalFiles.length} admin stylesheet(s) scanned for opaque colour literals, ` +
    `${pendingTotal} still pending migration in ${Object.keys(LITERAL_PENDING).length} file(s); ` +
    `${chipScan.totalCount} chip-half foreground use(s), ${chipScan.pairedCount} chip-paired and ` +
    `${chipScan.allowedKeys.size} deliberately exempt (floor ${MIN_CHIP_HALF_USES}).`
);
