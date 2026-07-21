// AdminCollectionStore null-handling gate (OBRS-506).
//
// Why this exists: AdminCollectionStore<T>.data$ (admin/shared/admin-collection-store.ts)
// emits `null` on clear() to DISCARD its cached value -- called on logout via the base
// ctor, and by several stores' own param setters (a tab/page/filter change). A `.data$`
// subscribe callback written as `if (data) { this.rows = data.x; }` KEEPS its stale local
// copy on that null emission, because the guard silently skips the whole body instead of
// resetting anything -- GUARD-COPY. That shipped as a real bug once already: OBRS-467
// (usability-reports-page.component.ts) left a previous page's rows on screen under the
// error banner after a clear()-then-failed-reload, because the null emission was ignored
// instead of clearing `allReports`. OBRS-506 found the SAME shape latent in 19 more
// `.data$` subscribe sites across 17 components -- this gate exists so a 20th can't ship
// the same way a 2nd time.
//
// What it flags: a `.data$` subscribe callback whose body contains an `if` statement
// that (a) tests the callback's own parameter for truthiness/non-null and (b) either has
// no `else` branch (the null path falls through and touches nothing), or is a negative
// guard (`!data` / `data === null` / `data == null`) whose body is a bare early exit
// with no assignment before it. Both shapes skip clearing on null instead of doing it.
// The FIX shape -- honoring null -- looks like `this.rows = data?.content ?? [];` with
// no guard at all, or `if (data) { ... } else { /* reset */ }` with both branches present.
//
// A deliberate exception (sell-page.component.ts's take(1) re-map on language change,
// OBRS-506) is allowed to keep the guard-with-no-else shape via an opt-out comment:
//   // store-null-ok: <reason>
// placed anywhere before the flagged subscribe call in the same file. The reason string
// is REQUIRED -- a bare `store-null-ok` marker with nothing after the colon does not
// suppress the finding, so an opt-out always self-documents why.
//
// Reads .ts files with fs -- no Angular/Karma bundling -- so it is fast and runs before
// `npm ci`. This is a pragmatic regex/brace-balance scan, not a real TypeScript parser --
// it can be fooled by sufficiently unusual formatting, same tradeoff every other check-*
// gate in this directory makes. Run locally with: npm run test:store-null
//
// ASCII-only source.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

// Defaults to src/app; an optional argv[2] override exists only so the gate's own
// before/after proof can be run against a different tree (OBRS-506 verification),
// mirroring check-i18n-parity.mjs / check-alert-i18n.mjs.
const SRC_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

/** Files the rule applies to: page/presentational components, never specs. */
function isCheckedFile(path) {
  return path.endsWith('.component.ts') && !path.endsWith('.spec.ts');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (isCheckedFile(full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Return the source between an opening bracket (index points AT the opening
 * char) and its matching close, tracking nesting. `open`/`close` are single
 * characters, e.g. '(' / ')' or '{' / '}'. Returns null if they never
 * balance (a truncated/odd file) rather than guessing at a boundary. Ignores
 * bracket-like characters inside string/template literals so a stray `{` or
 * `(` in a message string cannot desync the count.
 */
function readBalanced(source, openIndex, open, close) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { text: source.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produce a same-length copy of `source` with every character inside a
 * `//`/`/* *\/` comment or a string/template literal replaced by a space
 * (newlines kept as newlines, so line numbers computed from either string
 * still agree). All STRUCTURAL scanning (finding `.data$`/`.subscribe(`,
 * matching parens/braces, locating `if` statements) runs against this
 * masked text -- otherwise a comment merely MENTIONING `.data$` or
 * `if (data)` (several exist in this very codebase, documenting the OBRS-467
 * fix) is indistinguishable from real code and desyncs both the brace
 * matching and the guard detection. The one thing that deliberately still
 * reads the ORIGINAL source is the `store-null-ok:` opt-out marker, which
 * lives inside a real comment on purpose.
 */
function maskCommentsAndStrings(source) {
  const out = Array.from(source);
  let i = 0;
  while (i < out.length) {
    const two = source[i] + (source[i + 1] ?? '');
    if (two === '//') {
      let j = i;
      while (j < out.length && source[j] !== '\n') {
        out[j] = ' ';
        j += 1;
      }
      i = j;
      continue;
    }
    if (two === '/*') {
      let j = i;
      while (j < out.length && source.slice(j, j + 2) !== '*/') {
        if (out[j] !== '\n') out[j] = ' ';
        j += 1;
      }
      if (j < out.length) {
        out[j] = ' ';
        out[j + 1] = ' ';
        j += 2;
      }
      i = j;
      continue;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out[i] = ' ';
      i += 1;
      while (i < out.length && source[i] !== quote) {
        if (source[i] === '\\') {
          out[i] = ' ';
          i += 1;
          if (i < out.length && out[i] !== '\n') out[i] = ' ';
          i += 1;
          continue;
        }
        if (out[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < out.length) out[i] = ' ';
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** Skip whitespace and `//`/`/* *\/` comments starting at index i; return the
 * index of the next meaningful character. */
function skipTrivia(source, i) {
  for (;;) {
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source.startsWith('//', i)) {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    return i;
  }
}

/** Find every `if (...) { ... }` (optionally followed by `else`) inside `body`,
 * at any nesting depth -- a simple linear scan is enough since we only need
 * the condition text, the then-block text, and whether an else follows. */
function findIfStatements(body) {
  const results = [];
  const IF_RE = /\bif\s*\(/g;
  let m;
  while ((m = IF_RE.exec(body))) {
    const openParen = m.index + m[0].length - 1;
    const cond = readBalanced(body, openParen, '(', ')');
    if (!cond) continue;
    let i = skipTrivia(body, cond.end + 1);
    if (body[i] !== '{') {
      // A brace-less single-statement if -- read up to the next top-level `;`.
      const semi = body.indexOf(';', i);
      if (semi === -1) continue;
      const thenText = body.slice(i, semi + 1);
      const after = skipTrivia(body, semi + 1);
      const hasElse = body.startsWith('else', after);
      results.push({ cond: cond.text, thenText, hasElse });
      IF_RE.lastIndex = semi + 1;
      continue;
    }
    const thenBlock = readBalanced(body, i, '{', '}');
    if (!thenBlock) continue;
    const after = skipTrivia(body, thenBlock.end + 1);
    const hasElse = body.startsWith('else', after);
    results.push({ cond: cond.text, thenText: thenBlock.text, hasElse });
    IF_RE.lastIndex = thenBlock.end + 1;
  }
  return results;
}

/** True if `text` performs an assignment (`x = y`, `x.y = z`, `x?.y = z`) --
 * used to tell "the null branch already resets state" apart from a bare
 * early exit. Deliberately excludes `==`, `===`, `<=`, `>=`, `=>` via the
 * negative lookaheads/behinds. */
function hasAssignment(text) {
  return /[^=!<>+\-*/%&|^]=(?!=)(?!>)/.test(text);
}

const DATA_DOLLAR = /\.data\$(?!\w)/g;
const OPT_OUT = /store-null-ok\s*:\s*\S/;

const problems = [];
let sitesChecked = 0;

for (const file of walk(SRC_DIR)) {
  const source = readFileSync(file, 'utf8');
  const masked = maskCommentsAndStrings(source);
  const rel = relative(join(SRC_DIR, '..', '..'), file).replace(/\\/g, '/');

  DATA_DOLLAR.lastIndex = 0;
  let dm;
  while ((dm = DATA_DOLLAR.exec(masked))) {
    const dataDollarIndex = dm.index;

    // Find the next .subscribe( within a short window -- allows an
    // intervening .pipe(...) but not an unrelated later subscribe call.
    const window = masked.slice(dataDollarIndex, dataDollarIndex + 600);
    const subMatch = /\.subscribe\s*\(/.exec(window);
    if (!subMatch) continue;
    const subOpenParen = dataDollarIndex + subMatch.index + subMatch[0].length - 1;
    const argSpan = readBalanced(masked, subOpenParen, '(', ')');
    if (!argSpan) continue;

    const argText = argSpan.text;

    // Extract the callback's parameter name -- `(data) => ...`, `data => ...`,
    // `(data: T | null) => ...`. Falls back to the `next: (data) => ...`
    // observer-object shape.
    let paramMatch = /^\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^=)]+)?\)?\s*=>/.exec(argText);
    if (!paramMatch) {
      paramMatch = /\bnext\s*:\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^=)]+)?\)?\s*=>/.exec(argText);
    }
    if (!paramMatch) continue;
    const paramName = paramMatch[1];

    // Locate the arrow function's `{ ... }` body. No braces means a single
    // implicit-return expression -- no `if` is possible there, nothing to check.
    const arrowIdx = argText.indexOf('=>', paramMatch.index);
    if (arrowIdx === -1) continue;
    const braceIdx = skipTrivia(argText, arrowIdx + 2);
    if (argText[braceIdx] !== '{') continue;
    const bodySpan = readBalanced(argText, braceIdx, '{', '}');
    if (!bodySpan) continue;
    const body = bodySpan.text;

    sitesChecked += 1;

    const paramRe = new RegExp(`\\b${escapeRegExp(paramName)}\\b`);
    const negativeRe = new RegExp(
      `(!\\s*${escapeRegExp(paramName)}\\b)|(\\b${escapeRegExp(paramName)}\\s*(===|==)\\s*(null|undefined)\\b)`
    );

    for (const ifStmt of findIfStatements(body)) {
      if (!paramRe.test(ifStmt.cond)) continue;

      const isNegative = negativeRe.test(ifStmt.cond);
      let flagged;
      let reason;
      if (!isNegative) {
        // Positive/truthy guard (`if (data)`, `if (data && ...)`, `if (data !== null)`):
        // safe only if an else branch handles the null path.
        flagged = !ifStmt.hasElse;
        reason = 'truthy guard on the emitted value with no else branch -- the null path falls through and touches nothing';
      } else {
        // Negative guard (`if (!data)`, `if (data === null)`): safe only if it
        // already resets state before bailing out.
        flagged = !hasAssignment(ifStmt.thenText);
        reason = 'early-exits on a null/falsy check without assigning any reset value first';
      }
      if (!flagged) continue;

      // Opt-out: a `store-null-ok: <reason>` comment anywhere from a bit before
      // the .data$ occurrence through the end of the captured subscribe call.
      // Read from the RAW (unmasked) source -- the marker lives inside a real
      // comment, which the masked text used for structural scanning erases.
      const lookback = source.slice(Math.max(0, dataDollarIndex - 1500), dataDollarIndex);
      const lookforward = source.slice(subOpenParen + 1, argSpan.end);
      if (OPT_OUT.test(lookback) || OPT_OUT.test(lookforward)) continue;

      const line = source.slice(0, dataDollarIndex).split('\n').length;
      problems.push(`${rel}:${line}  .data$ subscribe (param "${paramName}") -- ${reason}`);
    }
  }
}

if (sitesChecked === 0) {
  console.error(
    `::error::store null-handling gate FOUND NOTHING TO CHECK under ${SRC_DIR} -- the gate is a no-op, which is worse than a failure. Verify the path and the .data$/.subscribe( pattern (OBRS-506).`
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(
    `store null-handling gate FAILED (${problems.length} of ${sitesChecked} .data$ subscribe site(s)):`
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::A .data$ subscribe callback guards on the emitted value without honoring a null ' +
      'emission (AdminCollectionStore.clear() semantics) -- ' +
      `${problems.length} site(s) would keep stale local state on screen after a cache clear, the ` +
      'exact shape of OBRS-467. Reset every local property the callback writes on null, or add a ' +
      '`// store-null-ok: <reason>` comment for a deliberate exception (OBRS-506).'
  );
  process.exit(1);
}

console.log(
  `store null-handling gate OK: all ${sitesChecked} .data$ subscribe site(s) honor a null emission.`
);
