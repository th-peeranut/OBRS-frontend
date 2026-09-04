// Loading-primitive duplication gate (OBRS-907).
//
// Why this exists: 14 stylesheets in this repo each hand-rolled their own rotate/shimmer
// `@keyframes` for a loading spinner/skeleton before OBRS-907 introduced ONE shared
// primitive (`shared/components/loading-state` + `src/styles/_loading.scss`). That card
// consolidated two of the fourteen and deliberately left the other twelve (plus
// `admin-theme.scss`'s pre-existing `admin-loading-spin`) for a later sweep -- but
// nothing stopped a FIFTEENTH hand-rolled copy from being added the same way the first
// fourteen were: one component at a time, each one looking like a small, local, harmless
// addition. Prose in design-system.md cannot catch that; this gate does.
//
// What it flags: any `@keyframes` block anywhere under src/ whose body animates a
// rotation -- `transform: rotate()`/`rotate3d()`/`rotateX/Y/Z()`, or the standalone
// CSS "individual transform property" `rotate: <angle>;` -- or a shimmer sweep
// (`background-position: ...`), UNLESS it is either
//   (a) in an ALLOWED_FILE (the two files OBRS-907 designated as where these keyframes
//       are meant to live), or
//   (b) an EXACT (file, keyframe-name) pair already present in DEBT_REGISTER below.
//
// The register is registered debt, not an exemption list, and it is held to BOTH
// directions, the same shape as `e2e/support/dark-override-allow.ts`:
//   * a qualifying keyframe that is NOT in the register (a new file, OR a SECOND new
//     keyframe added to an already-registered file) fails the build -- new debt cannot
//     be added silently, and an already-registered file is not a free pass to add more;
//   * a register entry whose keyframe no longer exists in that file ALSO fails the build
//     -- so migrating a site and forgetting to shrink the register doesn't quietly leave
//     a stale row that reads as "still debt" forever.
//
// The DEBT_REGISTER is 12 entries, not 13: `admin-theme.scss`'s own `admin-loading-spin`
// is real pre-existing debt too (it predates this gate and is still used directly by
// `export-button`/`vehicle-inspection-panel`'s sibling `.spin` pattern), but it lives in
// ALLOWED_FILES rather than the register, because OBRS-907 designated admin-theme.scss
// as one of the two places a shared keyframe is allowed to live (the other being
// `_loading.scss`) -- it is not tracked as a site waiting to be migrated onto something
// else, it already IS the canonical admin-side icon spinner.
//
// Sweeping the 12 registered files onto `<app-loading-state>` is OBRS-909/910, not this
// gate's job -- this gate's only job is making sure the number can go DOWN (by deleting
// register rows as sites migrate) and never back UP.
//
// Reads .scss files with fs -- no Angular/Karma bundling -- so it is fast and runs even
// before `npm ci`. Run locally with: npm run test:loading-primitives
//
// ASCII-only source.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(HERE, '..', 'src');

/** Strip SCSS/CSS comments so a comment merely MENTIONING "@keyframes ...-spin" (this
 * file has several, and so does loading-state.component.scss) is never read as a real
 * keyframe block. `//` is only a comment when not preceded by `:`, so `url(https://...)`
 * survives -- same rule as check-admin-theme-tokens.mjs. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every `@keyframes <name> { ... }` block in `src`, brace-balanced (a keyframe body can
 * itself contain nested `{ 0% { ... } }` blocks, so a naive first-`}` match would truncate
 * it). Returns [{ name, body }]. */
function findKeyframes(src) {
  const out = [];
  const RE = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;
  let m;
  while ((m = RE.exec(src))) {
    const name = m[1];
    let i = RE.lastIndex - 1; // index of the opening '{'
    let depth = 0;
    let end = i;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ name, body: src.slice(i + 1, end) });
    RE.lastIndex = end + 1;
  }
  return out;
}

// A rotate-family TRANSFORM FUNCTION inside a `transform:` declaration -- covers
// rotate(), rotate3d(), rotateX()/rotateY()/rotateZ(). `[^;]*` lets it appear after
// another function in the same value (`transform: scale(1) rotate(45deg)`), which a
// bare `transform:\s*rotate\(` (the original, narrower version of this regex) missed.
const ROTATE_FUNCTION_RE = /transform\s*:\s*[^;]*\brotate(?:3d|[xyz])?\s*\(/i;
// The standalone CSS "individual transform property" `rotate:` (CSS Transforms
// Level 2, e.g. `rotate: 360deg;`) -- the exact same spin, spelled without a
// `transform:` wrapper at all. `(?:^|[;{}])` anchors on "rotate" being the property
// NAME (immediately after a declaration/block boundary), not a substring inside some
// other property's name or value -- see the self-test fixtures below for both the
// must-catch and the must-NOT-catch this is built to tell apart.
const ROTATE_PROPERTY_RE = /(?:^|[;{}])\s*rotate\s*:\s*\S/i;
const SHIMMER_RE = /background-position\s*:/;

/** True if a keyframe body is the shape this gate cares about -- a spin (any
 * rotate-family transform, function or standalone property) or a shimmer sweep
 * (background-position) -- and false for an unrelated animation (a fade, a scale,
 * an opacity pulse, an SVG stroke-dashoffset sweep) that happens to share the file
 * with one of those. Deliberately does NOT widen to those other families: they are
 * a different technique, not more instances of this one (per OBRS-907 scrutinize
 * follow-up scope). */
function isQualifying(body) {
  return ROTATE_FUNCTION_RE.test(body) || ROTATE_PROPERTY_RE.test(body) || SHIMMER_RE.test(body);
}

/**
 * Scan one stylesheet's already-comment-stripped source for qualifying keyframe names.
 * Pure function of (relPath, text) so the self-test below can feed it fixtures without
 * touching disk -- same shape as check-admin-theme-tokens.mjs's findStandaloneChipUses.
 */
function qualifyingKeyframeNames(text) {
  return findKeyframes(text)
    .filter((k) => isQualifying(k.body))
    .map((k) => k.name);
}

// --- ALLOWED_FILES: the two places OBRS-907 designated for these keyframes to live ----
// Paths relative to SRC, forward slashes.
const ALLOWED_FILES = new Set([
  'styles/_loading.scss', // the shared canonical loading-state-spin / loading-state-shimmer
  'styles/admin-theme.scss', // the pre-existing admin-loading-spin, still used directly
]);

// --- DEBT_REGISTER: the hand-rolled duplicates OBRS-907 deliberately left in place -----
// Owner: OBRS-909/910. Each entry is EXACTLY the keyframe name(s) present in that file
// today. Migrating a site onto <app-loading-state> means deleting its row here in the
// SAME commit that deletes the keyframe -- see the OBRS-907 commit for the worked
// example (my-booking-ticket-modal.component.scss's `ticket-modal-spin` row was removed
// when the keyframe was).
//
// 16 rows, not 12: OBRS-907's own baseline census (`grep -i "spin|rotate"`) only ever
// matched keyframe NAMES containing those substrings, so it missed 4 pre-existing
// shimmer-only duplicates whose names don't -- `business-policy-shimmer`,
// `my-parcels-shimmer`, `my-reports-shimmer`, and a SECOND, separate keyframe inside
// my-bookings.component.scss (which already had `my-bookings-spin` registered, plus this
// one the census never saw). This gate's first real run against the tree found all four
// immediately, which is exactly the reason to key detection off the keyframe BODY
// (rotate()/background-position) rather than off name substrings the way the original
// census did. All four are confirmed pre-existing (zero diff against origin/dev at
// OBRS-907's branch point) -- registered here, not fixed here; OBRS-909/910 still owns
// the sweep, this card only had to stop it from growing a 17th.
const DEBT_REGISTER = {
  'app/modules/account/components/close-account-dialog/close-account-dialog.component.scss': [
    'close-account-spin',
  ],
  'app/modules/admin/pages/vehicles/vehicle-inspection/vehicle-inspection-panel.component.scss': [
    'vehicle-inspection-spin',
  ],
  'app/modules/business-policy/business-policy.component.scss': ['business-policy-shimmer'],
  'app/modules/home/components/route-map/route-map-panel/route-map-panel.component.scss': [
    'locate-spin',
  ],
  'app/modules/my-bookings/components/change-seat-dialog/change-seat-dialog.component.scss': [
    'change-seat-spin',
  ],
  'app/modules/my-bookings/components/reschedule-dialog/reschedule-estimate-summary/reschedule-estimate-summary.component.scss':
    ['reschedule-estimate-spin'],
  'app/modules/my-bookings/components/reschedule-dialog/reschedule-options-list/reschedule-options-list.component.scss':
    ['reschedule-options-spin'],
  'app/modules/my-bookings/components/trip-track-panel/trip-track-panel.component.scss': [
    'trip-track-spin',
  ],
  // Two SEPARATE keyframes in the same file -- a rotate spinner and an unrelated
  // shimmer skeleton, added independently. Proof the per-name (not per-file) ledger
  // matters: a file already in the register is not a free pass for a second copy.
  'app/modules/my-bookings/my-bookings.component.scss': ['my-bookings-spin', 'my-bookings-shimmer'],
  'app/modules/my-parcels/my-parcels.component.scss': ['my-parcels-shimmer'],
  'app/modules/my-reports/my-reports.component.scss': ['my-reports-shimmer'],
  'app/modules/payment/components/payment-result/payment-result.component.scss': ['spin'],
  'app/shared/components/usability-report-follow-up-timeline/usability-report-follow-up-timeline.component.scss':
    ['ur-follow-up-spin'],
};

// SELF-TEST, run on every invocation before the real scan (same discipline as
// check-admin-theme-tokens.mjs invariant 4 / check-no-card-data-inputs.mjs): a gate
// nobody proved can fire is prose with a shebang.
{
  const selfTestErrors = [];

  // must-CATCH: a brand new rotate keyframe in an unregistered file.
  const newRotate = qualifyingKeyframeNames('@keyframes fake-thing-spin { to { transform: rotate(360deg); } }');
  if (!newRotate.includes('fake-thing-spin')) {
    selfTestErrors.push('must-CATCH: a fresh `transform: rotate()` keyframe was not detected as qualifying.');
  }

  // must-CATCH: a brand new shimmer keyframe (the OTHER half of the duplication family).
  const newShimmer = qualifyingKeyframeNames(
    '@keyframes fake-thing-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }'
  );
  if (!newShimmer.includes('fake-thing-shimmer')) {
    selfTestErrors.push('must-CATCH: a fresh `background-position` shimmer keyframe was not detected as qualifying.');
  }

  // must-NOT-catch: an unrelated animation (a fade) sharing a file with a real spinner
  // must not itself be flagged, and must not hide the real one either.
  const mixed = qualifyingKeyframeNames(
    '@keyframes modal-fade { from { opacity: 0; } to { opacity: 1; } } ' +
      '@keyframes real-spin { to { transform: rotate(360deg); } }'
  );
  if (mixed.includes('modal-fade')) {
    selfTestErrors.push('must-NOT-catch: an unrelated fade keyframe was flagged as a rotate/shimmer duplicate.');
  }
  if (!mixed.includes('real-spin')) {
    selfTestErrors.push('must-CATCH: a real rotate keyframe sharing a file with an unrelated fade was missed.');
  }

  // must-NOT-catch: a comment merely MENTIONING "@keyframes xxx-spin" (this file's own
  // header does exactly that) must never be parsed as a real block. Comments are
  // stripped by the caller (stripComments), not by qualifyingKeyframeNames itself, so
  // this fixture proves stripComments actually removes the false lead.
  const commentOnly = qualifyingKeyframeNames(
    stripComments('// see the `@keyframes xxx-spin` pattern this replaces\n.foo { color: red; }')
  );
  if (commentOnly.length !== 0) {
    selfTestErrors.push(
      'must-NOT-catch: a comment merely mentioning "@keyframes ...-spin" was parsed as a real keyframe block.'
    );
  }

  // must-NOT-catch: a keyframe with neither rotate() nor background-position (a scale,
  // a slide, an opacity fade already covered above) is not this gate's business.
  const scaleOnly = qualifyingKeyframeNames('@keyframes pop { from { transform: scale(0.9); } to { transform: scale(1); } }');
  if (scaleOnly.length !== 0) {
    selfTestErrors.push('must-NOT-catch: a scale-only keyframe (no rotate/shimmer) was incorrectly flagged as qualifying.');
  }

  // must-CATCH (OBRS-907 scrutinize follow-up): the same spinner FAMILY written with
  // rotate3d()/rotateZ() instead of the plain rotate() the original regex required --
  // a narrower matcher here would have silently let a 17th hand-rolled spinner through
  // just for spelling its transform differently.
  const rotate3d = qualifyingKeyframeNames(
    '@keyframes fake-3d-spin { to { transform: rotate3d(0, 0, 1, 360deg); } }'
  );
  if (!rotate3d.includes('fake-3d-spin')) {
    selfTestErrors.push('must-CATCH: a `transform: rotate3d(...)` keyframe was not detected as qualifying.');
  }
  const rotateZ = qualifyingKeyframeNames('@keyframes fake-z-spin { to { transform: rotateZ(360deg); } }');
  if (!rotateZ.includes('fake-z-spin')) {
    selfTestErrors.push('must-CATCH: a `transform: rotateZ(...)` keyframe was not detected as qualifying.');
  }
  const rotateAfterScale = qualifyingKeyframeNames(
    '@keyframes fake-combo-spin { to { transform: scale(1) rotateX(360deg); } }'
  );
  if (!rotateAfterScale.includes('fake-combo-spin')) {
    selfTestErrors.push(
      'must-CATCH: a `transform:` value where rotate is not the FIRST function (e.g. `scale(1) rotateX(...)`) was missed.'
    );
  }

  // must-CATCH: the standalone CSS "individual transform property" spelling
  // (`rotate: 360deg;`, no `transform:` wrapper) -- the same spin, written the OTHER
  // legal way per CSS Transforms Level 2.
  const standaloneRotate = qualifyingKeyframeNames('@keyframes fake-standalone-spin { to { rotate: 360deg; } }');
  if (!standaloneRotate.includes('fake-standalone-spin')) {
    selfTestErrors.push('must-CATCH: a standalone `rotate: <angle>;` property (no `transform:`) was not detected as qualifying.');
  }

  // must-NOT-catch: the standalone-property matcher keys on "rotate" being the
  // declaration's own NAME, not a substring inside a different property's name or
  // value -- `border-radius` contains neither "rotate" nor a false match for it, and
  // an `animation`/`transform-origin` value merely MENTIONING a rotate-ish identifier
  // must not trip the standalone-property branch either.
  const notARotateProperty = qualifyingKeyframeNames(
    '@keyframes fake-not-rotate { from { border-radius: 4px; } to { transform-origin: center; animation-name: my-rotate-thing; } }'
  );
  if (notARotateProperty.length !== 0) {
    selfTestErrors.push(
      'must-NOT-catch: `border-radius`/`transform-origin`/an animation-name merely containing "rotate" as a substring was flagged as a standalone rotate property.'
    );
  }

  // must-NOT-catch (explicit scope boundary, OBRS-907 scrutinize follow-up): an
  // opacity pulse and an SVG stroke-dashoffset sweep are a DIFFERENT animation
  // technique from this gate's spin/shimmer family, not more instances of it -- do
  // not widen to catch them.
  const differentFamily = qualifyingKeyframeNames(
    '@keyframes fake-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } ' +
      '@keyframes fake-dash { to { stroke-dashoffset: 0; } }'
  );
  if (differentFamily.length !== 0) {
    selfTestErrors.push(
      'must-NOT-catch: an opacity-pulse or stroke-dashoffset keyframe (a different animation family) was incorrectly flagged.'
    );
  }

  if (selfTestErrors.length > 0) {
    console.error('::error::loading-primitives gate SELF-TEST FAILED:');
    for (const e of selfTestErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

if (!existsSync(SRC)) {
  console.error(`::error::loading-primitives gate cannot find ${SRC} -- did the tree move?`);
  process.exit(1);
}

const styleFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.scss$/.test(entry)) styleFiles.push(p);
  }
})(SRC);

const problems = [];
const foundByFile = new Map(); // relPath -> Set(qualifying keyframe names actually present)
let totalQualifying = 0;

for (const file of styleFiles) {
  const rel = relative(SRC, file).split('\\').join('/');
  const names = qualifyingKeyframeNames(stripComments(readFileSync(file, 'utf8')));
  if (names.length === 0) continue;
  foundByFile.set(rel, new Set(names));
  totalQualifying += names.length;

  if (ALLOWED_FILES.has(rel)) continue; // designated home, no per-name ledger needed

  const registered = new Set(DEBT_REGISTER[rel] ?? []);
  for (const name of names) {
    if (registered.has(name)) continue;
    if (DEBT_REGISTER[rel]) {
      problems.push(
        `${rel} defines a NEW rotate/shimmer keyframe "${name}" not in DEBT_REGISTER for this ` +
          `file (registered: [${[...registered].join(', ') || 'none'}]). An already-registered ` +
          `file is not a free pass for a SECOND hand-rolled copy -- reuse ` +
          `shared/components/loading-state instead, or add this exact name to the register with ` +
          `a card key if it is genuinely more debt of the same shape.`
      );
    } else {
      problems.push(
        `${rel} defines a NEW rotate/shimmer keyframe "${name}" -- this is the class of duplication ` +
          `OBRS-907 introduced <app-loading-state> to stop. Use ` +
          `\`<app-loading-state variant="spinner">\` (ring graphic) or \`variant="skeleton"\` ` +
          `instead of hand-rolling a 15th copy. If this is genuinely pre-existing debt this gate ` +
          `mis-scanned, add "${rel}": ["${name}"] to DEBT_REGISTER in scripts/check-loading-primitives.mjs.`
      );
    }
  }
}

// --- stale-entry check: a register row for a keyframe that no longer exists ----------
for (const [rel, names] of Object.entries(DEBT_REGISTER)) {
  const file = join(SRC, ...rel.split('/'));
  if (!existsSync(file)) {
    problems.push(`DEBT_REGISTER has an entry for "${rel}" but that file no longer exists -- delete the row.`);
    continue;
  }
  const present = foundByFile.get(rel) ?? new Set();
  for (const name of names) {
    if (!present.has(name)) {
      problems.push(
        `DEBT_REGISTER lists "${name}" for ${rel} but that keyframe is no longer a qualifying ` +
          `rotate/shimmer block in that file -- it was migrated (good!) and the register row is ` +
          `now stale. Delete "${name}" from that entry (and the entry itself if it's the only ` +
          `name left), the same way OBRS-907's own commit removed my-booking-ticket-modal's row.`
      );
    }
  }
}

// --- no-op guard: a gate that checks nothing is worse than a failing one -------------
if (styleFiles.length === 0 || totalQualifying === 0) {
  console.error(
    `::error::loading-primitives gate FOUND NOTHING TO CHECK (styleFiles=${styleFiles.length}, ` +
      `qualifyingKeyframes=${totalQualifying}) -- the gate is a no-op. Verify SRC=${SRC} and that ` +
      `_loading.scss / admin-theme.scss still define their rotate/shimmer keyframes.`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`loading-primitives gate FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::A new hand-rolled rotate/shimmer @keyframes was added outside DEBT_REGISTER, or a ' +
      `register row went stale -- ${problems.length} problem(s). This is exactly the pattern that ` +
      'produced 14 duplicate spinner/skeleton stylesheets before OBRS-907. Reuse ' +
      '<app-loading-state> instead of hand-rolling another one.'
  );
  process.exit(1);
}

const registeredTotal = Object.values(DEBT_REGISTER).reduce((a, b) => a + b.length, 0);
console.log(
  `loading-primitives gate OK: ${totalQualifying} qualifying rotate/shimmer keyframe(s) across ` +
    `${styleFiles.length} stylesheet(s) scanned; ${registeredTotal} known-debt keyframe(s) in ` +
    `${Object.keys(DEBT_REGISTER).length} registered file(s) (OBRS-909/910 to clear), ` +
    `${ALLOWED_FILES.size} designated shared-home file(s), 0 new duplicate(s).`
);
