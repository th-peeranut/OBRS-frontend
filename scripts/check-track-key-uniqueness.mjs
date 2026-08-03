// Duplicate `@for ... track` key gate (OBRS-967).
//
// Why this exists: a duplicated track key does not fail anything. Angular logs
// NG0955 to console.warn and renders on, so the tree carried 39 broken placeholder
// loops while `ng test` reported 4612 of 4612 SUCCESS -- 33 of those specs were
// printing NG0955 the whole time and nobody had to notice (measured on origin/dev
// at ca4e1074, 2026-08-03). Unit tests cannot catch it, a screenshot cannot show
// it, and the AC that finally found it was "read the warning", not "run the suite".
//
// The defect shape: `Array.from({ length: 5 })` is FIVE COPIES OF `undefined`, not
// five distinct placeholder objects. Tracking such a list by the loop variable
// hands @for the same key once per row. Angular renders the first and treats the
// rest as duplicates -- and Angular's own message prints that key as `""`, because
// renderStringify(undefined) returns '', which is why the warning reads
// `key "" at index "0" and "1"` and not `key "undefined"`.
//
// What it flags, under src/**/*.html:
//   Rule A (precise, name-independent): a `@for` over a field that its sibling
//     component .ts assigns `Array.from({ length: N })` with NO mapper function --
//     i.e. an array of `undefined` -- tracked by anything other than `$index`.
//   Rule B (net, for values that arrive as an @Input from elsewhere): a `@for` over
//     a collection whose NAME says placeholder (`skeleton*` / `placeholder*`),
//     tracked by anything other than `$index`. A parent can hand a child its
//     `Array.from({ length: 5 })` across a component boundary, where Rule A's
//     ts/html pairing cannot see it; the name is the only signal left.
//
// What it deliberately does NOT cover: the OTHER half of OBRS-967, a layout built
// from SHARED cell constants (`shared/lib/seat-layout.ts` puts the very same EMPTY
// object at two positions of one row). That duplication is created by object
// identity at runtime, not by any pattern a template scan can see, so it is pinned
// by a runtime must-catch instead -- passenger-seat-van.component.spec.ts, using
// src/app/testing/track-key-warnings.ts. Do not widen this gate to guess at it.
//
// Matcher coverage, stated rather than implied: the header regex requires the
// collection to be an identifier, so 6 of the tree's 173 `@for` headers are outside
// it (measured 2026-08-03) -- 4 inline-literal placeholder rows (`@for (row of [1, 2];
// track row)`, safe only because 1 and 2 are distinct values) and 2 whose collection
// is a function call (`methodEntries(row.byMethod)`), which is real data, not a
// placeholder. None can produce the array-of-undefined shape; if a placeholder loop
// is ever written as a literal of repeated values, this gate will not see it.
//
// Reads .html/.ts with fs -- no Angular/Karma bundling -- so it runs before npm ci.
// Run locally with: npm run test:track-keys
//
// ASCII-only source.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(HERE, '..', 'src');

/** Every `@for (<item> of <collection>; track <expr>)` header in a template.
 * `<expr>` is captured up to the closing paren or the `; let ...` part, so
 * `track row; let i = $index` yields `row`. */
function findForLoops(html) {
  const out = [];
  const RE = /@for\s*\(\s*([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$.]*)\s*;\s*track\s+([^;)]+?)\s*(?:;[^)]*)?\)/g;
  let m;
  while ((m = RE.exec(html))) {
    const before = html.slice(0, m.index);
    out.push({
      item: m[1],
      collection: m[2],
      track: m[3].trim(),
      line: before.split('\n').length,
    });
  }
  return out;
}

/** Field names in a component .ts assigned `Array.from({ length: N })` with NO
 * second argument -- the array-of-undefined shape. `Array.from({length: 3}, (_, i) => i)`
 * is a DIFFERENT thing (distinct values, safe to track by value) and must not match. */
function undefinedFilledFields(ts) {
  const out = new Set();
  const RE = /\b([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*Array\.from\(\s*\{\s*length\s*:\s*\d+\s*\}\s*\)/g;
  let m;
  while ((m = RE.exec(ts))) out.add(m[1]);
  return out;
}

const PLACEHOLDER_NAME_RE = /^(skeleton|placeholder)/i;

/** The whole rule, as a pure function so the self-test can feed it fixtures. */
function violationsFor(html, undefinedFields) {
  const problems = [];
  for (const loop of findForLoops(html)) {
    if (loop.track === '$index') continue;
    const byRuleA = undefinedFields.has(loop.collection);
    const byRuleB = PLACEHOLDER_NAME_RE.test(loop.collection);
    if (!byRuleA && !byRuleB) continue;
    problems.push({
      line: loop.line,
      collection: loop.collection,
      track: loop.track,
      rule: byRuleA ? 'A' : 'B',
    });
  }
  return problems;
}

// SELF-TEST, run on every invocation (same discipline as check-loading-primitives.mjs):
// a gate nobody proved can fire is prose with a shebang.
{
  const errors = [];
  const skeletonField = new Set(['skeletonRows']);

  // must-CATCH: the exact shape this card swept, both rules.
  const ruleA = violationsFor('@for (row of rows; track row) { <tr></tr> }', new Set(['rows']));
  if (ruleA.length !== 1 || ruleA[0].rule !== 'A') {
    errors.push('must-CATCH (rule A): an Array.from({length:n}) field tracked by identity was not flagged.');
  }
  const ruleB = violationsFor('@for (row of skeletonRows; track row) { <tr></tr> }', new Set());
  if (ruleB.length !== 1 || ruleB[0].rule !== 'B') {
    errors.push('must-CATCH (rule B): a `skeleton*` collection tracked by identity was not flagged.');
  }

  // must-CATCH: the same defect wearing `; let i = $index` -- the track expression is
  // still the loop variable, and the trailing clause must not hide it.
  const withLet = violationsFor('@for (row of skeletonRows; track row; let i = $index) { <tr></tr> }', new Set());
  if (withLet.length !== 1) {
    errors.push('must-CATCH: `track row; let i = $index` was missed -- the trailing let clause swallowed the match.');
  }

  // must-NOT-catch: the fix itself.
  if (violationsFor('@for (row of skeletonRows; track $index) { <tr></tr> }', skeletonField).length !== 0) {
    errors.push('must-NOT-catch: the corrected `track $index` form was flagged.');
  }

  // must-NOT-catch: a real data list tracked by identity is normal Angular and is
  // none of this gate's business.
  if (violationsFor('@for (role of roles; track role) { <tr></tr> }', skeletonField).length !== 0) {
    errors.push('must-NOT-catch: an ordinary data collection tracked by identity was flagged.');
  }

  // must-NOT-catch: Array.from WITH a mapper produces distinct values (0,1,2...),
  // so tracking by the loop variable is correct -- flagging it would push callers
  // into a pointless edit.
  if (undefinedFilledFields('readonly idx = Array.from({ length: 3 }, (_, i) => i);').size !== 0) {
    errors.push('must-NOT-catch: `Array.from({length:n}, mapper)` was read as an array of undefined.');
  }
  if (undefinedFilledFields('protected readonly skeletonRows = Array.from({ length: 5 });').size !== 1) {
    errors.push('must-CATCH: a plain `Array.from({length:n})` field assignment was not recognised.');
  }

  if (errors.length > 0) {
    console.error('::error::track-key gate SELF-TEST FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

if (!existsSync(SRC)) {
  console.error(`::error::track-key gate cannot find ${SRC} -- did the tree move?`);
  process.exit(1);
}

const templates = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.html$/.test(entry)) templates.push(p);
  }
})(SRC);

const problems = [];
let loopsScanned = 0;
let guardedLoops = 0; // loops this gate has an opinion about (placeholder-ish), violation or not

for (const file of templates) {
  const rel = relative(SRC, file).split('\\').join('/');
  const html = readFileSync(file, 'utf8');
  const tsPath = file.replace(/\.html$/, '.ts');
  const undefinedFields = existsSync(tsPath)
    ? undefinedFilledFields(readFileSync(tsPath, 'utf8'))
    : new Set();

  for (const loop of findForLoops(html)) {
    loopsScanned++;
    if (undefinedFields.has(loop.collection) || PLACEHOLDER_NAME_RE.test(loop.collection)) {
      guardedLoops++;
    }
  }

  for (const v of violationsFor(html, undefinedFields)) {
    problems.push(
      `${rel}:${v.line} -- @for over "${v.collection}" is tracked by "${v.track}" ` +
        `(rule ${v.rule}: ${v.rule === 'A' ? 'that field is Array.from({length:n}), i.e. n copies of undefined' : 'a placeholder collection by name'}). ` +
        `Every row gets the SAME key, so Angular logs NG0955 on every render. It still ` +
        `paints all n rows -- which is why a row-count assertion stays green and this ` +
        `is invisible without reading the warning. ` +
        `Use \`track $index\` -- a placeholder list is positional, the index IS its identity.`
    );
  }
}

// no-op guard: a gate that checks nothing is worse than a failing one.
if (templates.length === 0 || guardedLoops === 0) {
  console.error(
    `::error::track-key gate FOUND NOTHING TO CHECK (templates=${templates.length}, ` +
      `guardedLoops=${guardedLoops}) -- the gate is a no-op. Either the @for header syntax ` +
      `changed under the matcher, or every placeholder loop was renamed. Verify SRC=${SRC}.`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`track-key gate FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::A `@for` over a placeholder collection is tracked by identity -- ' +
      `${problems.length} problem(s). This is the NG0955 class OBRS-967 swept out of 39 loops; ` +
      'it does not fail a render or a spec, it only warns, which is why it survived for months.'
  );
  process.exit(1);
}

console.log(
  `track-key gate OK: ${loopsScanned} @for loop(s) across ${templates.length} template(s) scanned; ` +
    `${guardedLoops} placeholder loop(s) guarded, all tracking by $index; 0 duplicate-key risk(s).`
);
