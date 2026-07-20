// Hardcoded-alert-string gate (OBRS-569).
//
// Why this exists: design-system.md Sec.9 has said "no hardcoded user-facing strings"
// since long before this gate, and the rule still leaked in 22 places -- including
// alertService.error('error') and alertService.success('succ') on the OTP LOGIN path,
// placeholders that shipped to users, and the ENTIRE payment flow in English only.
// Prose in a doc is not a gate; nothing failed, so nothing stopped it (OBRS-569).
//
// AlertService takes a plain string, so translation is the CALLER's job and there is no
// chokepoint to fix once. That is exactly the shape a lint-style gate is for: the rule
// has to be checked at every call site because it can only be broken at every call site.
//
// What it flags: a string literal reaching a user-facing AlertService method. A literal
// is allowed only inside translate.instant()/get()/stream(), which is what a translated
// message looks like. This catches the `?? 'Payment failed'` fallback form too -- two of
// those were live and neither was in the original defect report.
//
// Deliberately NOT checked: alertService.confirm({...}) object fields. Every confirm()
// call site today already translates, but the argument is an object literal rather than
// a message expression, so folding it in here would mean parsing object properties for
// no live defect. If a raw confirm() title ever ships, extend MESSAGE_METHODS-style
// handling to it rather than widening the regex until it guesses.
//
// Reads .ts files with fs -- no Angular/Karma bundling -- so it is fast and runs before
// `npm ci`, adding no GitHub Actions minutes beyond the step itself (OBRS-474/507 keep
// the runner budget tight). Run locally with: npm run test:alert-i18n
//
// ASCII-only source; the Thai/Chinese values it protects live in public/i18n and are
// never read by this file.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

// Defaults to src/app; an optional argv[2] override exists only so the gate's own
// failure path can be exercised against a fixture (mirrors check-i18n-parity.mjs).
const SRC_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

// Methods whose argument is rendered verbatim as the dialog/toast the user reads.
// showLoading() is here because its default title ('Loading...') is English and its
// only production caller -- the global error interceptor -- passes nothing, so every
// HTTP request in the app flashed an English word at Thai and Chinese users.
const MESSAGE_METHODS = [
  'error',
  'success',
  'info',
  'warning',
  'toast',
  'permissionDenied',
  'showLoading',
];

/** Files the rule does not apply to: tests assert on literals by design. */
function isCheckedFile(path) {
  return (
    path.endsWith('.ts') &&
    !path.endsWith('.spec.ts') &&
    !path.endsWith('alert.service.ts')
  );
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
 * Return the source between the call's opening paren and its matching close paren,
 * tracking nesting so a translate.instant(...) inside does not end the slice early.
 * Returns null if the parens never balance (a truncated/odd file) rather than
 * guessing at a boundary.
 */
function readCallArguments(source, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

/**
 * The message is always the FIRST argument; toast()'s second is a SweetAlertIcon
 * ('warning'/'error'/...), which is an API enum the user never reads. Checking the
 * whole argument list flagged 12 correct toast() calls -- so split on top-level
 * commas only, ignoring commas nested in calls, objects, arrays or strings.
 */
function firstArgument(argText) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < argText.length; i += 1) {
    const ch = argText[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) return argText.slice(0, i);
  }
  return argText;
}

// Receiver names vary (`translate`, `translateService`, `this.translate`), so match on
// the method rather than a fixed property name -- keyed to a receiver whose name
// contains "translate" so an unrelated .get() is not waved through. Anchoring this to
// the literal `translate.` missed `translateService.instant(...)` and produced 3 false
// positives on correctly-translated code.
//
// Known and deliberate: a receiver named something else -- `this.t.instant('K')` --
// IS reported, verified against a fixture. All 197 call sites in the app name the
// field `translate` or `translateService`, so the cost today is zero and the rule
// buys a naming convention. If you hit this, rename the field; do not relax the
// pattern to any `.instant(` , which would wave through a lookup on an unrelated
// object that happens to have that method.
const TRANSLATE_CALL = /\b\w*[Tt]ranslate\w*\s*\.\s*(instant|get|stream)\s*\(/g;

/**
 * Blank out every translate.instant('KEY') / .get() / .stream() call. Whatever quoted
 * literal survives is a string the user reads untranslated -- including one hiding
 * behind `??` or `||` as a fallback, two of which were live and unreported.
 * Spans are read with the same paren matcher as the outer call so a nested argument
 * (e.g. instant('KEY', { n: count() })) does not end the span early.
 */
function stripTranslateCalls(argText) {
  let out = argText;
  for (;;) {
    TRANSLATE_CALL.lastIndex = 0;
    const match = TRANSLATE_CALL.exec(out);
    if (!match) return out;
    const openParen = match.index + match[0].length - 1;
    const inner = readCallArguments(out, openParen);
    if (inner === null) return out;
    const end = openParen + inner.length + 2;
    out = `${out.slice(0, match.index)}TRANSLATED${out.slice(end)}`;
  }
}

const LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/;
const CALL = new RegExp(
  `alertService\\s*\\.\\s*(${MESSAGE_METHODS.join('|')})\\s*\\(`,
  'g'
);

const problems = [];
let callsChecked = 0;

for (const file of walk(SRC_DIR)) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(join(SRC_DIR, '..', '..'), file).replace(/\\/g, '/');

  for (const match of source.matchAll(CALL)) {
    const openParen = match.index + match[0].length - 1;
    const argText = readCallArguments(source, openParen);
    if (argText === null) continue;
    callsChecked += 1;

    const surviving = stripTranslateCalls(firstArgument(argText)).match(LITERAL);
    if (surviving) {
      const line = source.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${line}  alertService.${match[1]}(...) is handed the literal ${surviving[0]}`
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `hardcoded alert string gate FAILED (${problems.length} of ${callsChecked} call sites):`
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::User-facing AlertService messages must come from translate.instant(' +
      "'KEY'), with the key present in all three of public/i18n/{en,th,zh}.json in the " +
      'SAME commit (design-system.md Sec.9, OBRS-569).'
  );
  process.exit(1);
}

console.log(
  `hardcoded alert string gate OK: all ${callsChecked} AlertService message call sites are translated.`
);
