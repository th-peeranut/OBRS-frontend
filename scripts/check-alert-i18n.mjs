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

// ---------------------------------------------------------------------------
// Rule 2: the success envelope's `message` is not a message (OBRS-843).
//
// The rule above checks the SHAPE of an argument -- is there a bare literal in
// it -- and that is precisely why it could not see the defect it was built to
// stop. `alertService.success(response?.message || translate.instant('KEY'))`
// contains no literal at all, so it passed; the string the user actually read
// was `"OK"`, hardcoded on the other side of the wire in
// `ApiSuccessRespDto` (`HttpStatus.OK.getReasonPhrase()`), where a gate that
// reads .ts files structurally cannot look. The left side of the `||` was never
// empty, so the translated key was dead code on the counter cancel dialog, the
// owner override dialog and three my-bookings failure paths -- five sites, all
// shipped, one photographed by the owner showing a dialog titled "OK".
//
// So this rule checks the SOURCE of the argument instead of its shape: reading
// `.message` off an API response envelope is banned outright, wherever it
// happens -- not only at an AlertService call. That width is deliberate. Three
// of the five sites put the string into an NgRx action payload that a *different
// file* later toasts, and no argument-level check can follow it there.
//
// It is NOT `error.message`: `extractApiErrorMessage()` (shared/lib/api-error.ts)
// reads the backend's real, localized `ApiErrorResponse.message` on the ERROR
// path, which is text meant for a human. Only the 2xx envelope carries the
// reason phrase.
const ENVELOPE_MESSAGE = /\b(response|resp|res|apiResponse)\s*\??\s*\.\s*message\b/g;

/**
 * Blank out comments (and string bodies) before rule 2 scans, replacing each
 * character with a space and keeping newlines, so reported line numbers still
 * point at the real line.
 *
 * Written because the first run of this rule flagged the doc comments that
 * EXPLAIN the defect -- four of them, in the very commit that fixes it. A gate
 * that cannot tell code from prose teaches people to stop naming the bug in
 * comments, which is the opposite of what this rule is for.
 */
function blankCommentsAndStrings(source, { blankStrings = true } = {}) {
  const out = source.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (source[i] === "'" || source[i] === '"' || source[i] === '`') {
      const quote = source[i];
      let k = i + 1;
      while (k < source.length && source[k] !== quote) {
        if (source[k] === '\\') k += 1;
        k += 1;
      }
      if (blankStrings) {
        blank(i + 1, k);
      }
      i = k + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** Comments gone, string literals kept — rule 3 needs to read the literals. */
function stripComments(source) {
  return blankCommentsAndStrings(source, { blankStrings: false });
}

// Sites that read an envelope `message` deliberately and correctly. Kept here
// rather than as a comment marker in the source so the whole list is visible in
// one place at review time. A stale entry FAILS the gate (see below): an
// allowlist that silently stops matching is how a rule quietly narrows to
// nothing.
const ENVELOPE_ALLOWLIST = [
  {
    // Guards on `response?.code === 200` FIRST and yields '' on success, so the
    // reason phrase can never reach this field on a 2xx -- the one shape where
    // reading it is not the defect above.
    suffix: 'shared/stores/schedule-list/schedule-list.effect.ts',
    reason: 'OBRS-843 census: guarded by code !== 200, never reads the 2xx phrase',
  },
];

// ---------------------------------------------------------------------------
// Rule 3: a wire errorCode never carries dots (OBRS-839).
//
// `DomainException.getErrorCode()` returns an explicit errorCode when the call
// site passed one, and otherwise DERIVES it:
//
//     messageKey.toUpperCase(Locale.ROOT).replace('.', '_').replace('-', '_')
//
// so `cancel.error.refund-destination-required` reaches the browser as
// `CANCEL_ERROR_REFUND_DESTINATION_REQUIRED`. Three shipped surfaces compared
// `extractApiErrorCode(error, ...)` -- which reads the real wire field --
// against the DOTTED messageKey form. Those comparisons could never be true:
// the customer cancel flow, the owner override dialog and the parcel booking
// quote/submit maps all fell through to a generic message, and the specific
// error copy each card had written was never once rendered. Unit tests could
// not see it, because the mocked responses used the same dotted form the
// component compared against -- test and code agreed with each other and both
// disagreed with the backend (OBRS-766 found it only by calling a real one).
//
// The fix is `errorCodeFromMessageKey()` (shared/lib/api-error-code.ts), which
// COMPUTES the wire form from the readable messageKey, so the two cannot drift.
// This rule keeps the dotted form from coming back: in any file that reads wire
// error codes, a dotted lowercase literal is either that mistake or a value
// that belongs somewhere else. Literals inside `errorCodeFromMessageKey(...)`
// are the point of the helper and are blanked before the scan.
const DOTTED_CODE_LITERAL = /'[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+'|"[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+"/g;
const READS_WIRE_CODES = /\bextractApiErrorCode\b|\bmapApiErrorCode\b/;
const FROM_MESSAGE_KEY = /\berrorCodeFromMessageKey\s*\(\s*(?:'[^']*'|"[^"]*")\s*\)/g;

const problems = [];
const envelopeProblems = [];
const dottedProblems = [];
const allowlistHits = new Map(ENVELOPE_ALLOWLIST.map((e) => [e.suffix, 0]));
let callsChecked = 0;
let envelopeFilesChecked = 0;
let wireCodeFilesChecked = 0;

const FILES = walk(SRC_DIR);

for (const file of FILES) {
  const posix = file.replace(/\\/g, '/');
  const allowed = ENVELOPE_ALLOWLIST.find((e) => posix.endsWith(e.suffix));
  const source = blankCommentsAndStrings(readFileSync(file, 'utf8'));
  envelopeFilesChecked += 1;

  for (const match of source.matchAll(ENVELOPE_MESSAGE)) {
    if (allowed) {
      allowlistHits.set(allowed.suffix, allowlistHits.get(allowed.suffix) + 1);
      continue;
    }
    const rel = relative(join(SRC_DIR, '..', '..'), file).replace(/\\/g, '/');
    const line = source.slice(0, match.index).split('\n').length;
    envelopeProblems.push(`${rel}:${line}  reads ${match[0]} -- the 2xx envelope message is "OK", not copy`);
  }

  // Rule 3 needs comments gone but STRING BODIES INTACT (the literal is the
  // evidence), so it re-reads the file with its own preparation.
  const raw = readFileSync(file, 'utf8');
  if (!READS_WIRE_CODES.test(raw)) {
    continue;
  }
  wireCodeFilesChecked += 1;
  const codeOnly = stripComments(raw).replace(FROM_MESSAGE_KEY, (m) => ' '.repeat(m.length));
  for (const match of codeOnly.matchAll(DOTTED_CODE_LITERAL)) {
    const rel = relative(join(SRC_DIR, '..', '..'), file).replace(/\\/g, '/');
    const line = codeOnly.slice(0, match.index).split('\n').length;
    dottedProblems.push(
      `${rel}:${line}  ${match[0]} is a messageKey, but this file compares WIRE errorCodes`
    );
  }
}

// A allowlist entry that no longer matches anything means the code moved and the
// exemption is now unexamined -- report it as loudly as a violation rather than
// carrying a rule that exempts nothing. Only meaningful against the real tree;
// a fixture run (argv[2]) deliberately holds a subset of files.
const staleAllowlist = process.argv[2]
  ? []
  : ENVELOPE_ALLOWLIST.filter((e) => allowlistHits.get(e.suffix) === 0).map(
      (e) => `${e.suffix}  (allowlisted "${e.reason}" but it no longer reads an envelope message)`
    );

for (const file of FILES) {
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

let failed = false;

if (problems.length > 0) {
  failed = true;
  console.error(
    `hardcoded alert string gate FAILED (${problems.length} of ${callsChecked} call sites):`
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::User-facing AlertService messages must come from translate.instant(' +
      "'KEY'), with the key present in all three of public/i18n/{en,th,zh}.json in the " +
      'SAME commit (design-system.md Sec.9, OBRS-569).'
  );
}

if (envelopeProblems.length > 0) {
  failed = true;
  console.error(
    `envelope message gate FAILED (${envelopeProblems.length} site(s) in ${envelopeFilesChecked} files):`
  );
  for (const p of envelopeProblems) console.error(`  - ${p}`);
  console.error(
    '::error::A 2xx response envelope carries `message` from ' +
      'HttpStatus.getReasonPhrase() -- the literal "OK" -- so it must never be ' +
      'shown to a user or used as a `||` fallback ahead of a translated string. ' +
      'Read the outcome from `response.data`, and the error text from ' +
      'extractApiErrorMessage(error) (OBRS-843).'
  );
}

if (dottedProblems.length > 0) {
  failed = true;
  console.error(`wire errorCode form gate FAILED (${dottedProblems.length} site(s)):`);
  for (const p of dottedProblems) console.error(`  - ${p}`);
  console.error(
    '::error::The wire `errorCode` is the messageKey UPPER-CASED with . and - ' +
      'turned into _ (DomainException.getErrorCode). Comparing against the dotted ' +
      'messageKey can never match. Wrap the messageKey in errorCodeFromMessageKey() ' +
      'instead of hand-typing either form (OBRS-839).'
  );
}

if (staleAllowlist.length > 0) {
  failed = true;
  console.error(`envelope message gate FAILED (${staleAllowlist.length} stale allowlist entr(ies)):`);
  for (const s of staleAllowlist) console.error(`  - ${s}`);
  console.error(
    '::error::An allowlisted site no longer matches. Delete the entry rather ' +
      'than leaving an exemption nobody has looked at (OBRS-843).'
  );
}

// A rule that inspected nothing reports the same "OK" as a rule that inspected
// everything and found nothing. Rules 2 and 3 both scope themselves (rule 3 to
// files that read wire error codes), so an import rename or a moved directory
// could empty the population and leave a gate that passes vacuously. Count the
// POSITIVE side and fail if it is zero.
if (envelopeFilesChecked === 0 || (wireCodeFilesChecked === 0 && !process.argv[2])) {
  failed = true;
  console.error(
    `::error::gate inspected an empty population (files=${envelopeFilesChecked}, ` +
      `wire-code files=${wireCodeFilesChecked}). It cannot pass on nothing -- check ` +
      'SRC_DIR and the helper names this script keys on.'
  );
}

if (failed) {
  process.exit(1);
}

console.log(
  `hardcoded alert string gate OK: all ${callsChecked} AlertService message call sites are translated.`
);
console.log(
  `envelope message gate OK: no 2xx envelope message is read as user-facing text ` +
    `across ${envelopeFilesChecked} files (${ENVELOPE_ALLOWLIST.length} reviewed exemption(s)).`
);
console.log(
  `wire errorCode form gate OK: ${wireCodeFilesChecked} files compare wire error codes, ` +
    'none against a dotted messageKey literal.'
);
