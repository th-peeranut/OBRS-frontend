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
// Object-literal arguments ARE checked (OBRS-1837). alertService.confirm({...}) -- and
// promptText({...}) -- take an options object, and this gate read only the first argument
// as a single message expression, so every string inside that object was invisible to it.
// Done the way the note that stood here demanded: by extending MESSAGE_METHODS-style
// handling with a list of the FIELDS a user reads (MESSAGE_FIELDS), NOT by widening the
// regex until it guesses. Widening was measured and is not viable -- the surviving-literal
// regex run over a whole object literal reports an apostrophe inside a `//` comment, and
// `icon: 'warning'` / `inputType: 'tel'`, none of which a user ever reads.
//
// Named limit: a literal INSIDE a template interpolation is not read --
// `title: `${cond ? 'Owner cancel' : 'Customer cancel'}`` passes. Blanking the whole
// `${...}` span is what keeps the real translate-call-plus-newline templates quiet.
// No call site does this today (0 of 29); if one appears, read the span, do not blank it.
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

// Methods whose first argument is an OPTIONS OBJECT rather than the message itself.
// promptText is listed although no production call site exists yet -- it arrives with
// OBRS-1802, which had not merged when this was written (measured: 0 hits for
// `alertService.promptText` under src/). The self-test fixtures below cover it, so the
// name is exercised on every run instead of sitting here unverified until that lands.
const OBJECT_ARG_METHODS = ['confirm', 'promptText'];

// The fields of that object a user actually reads. Everything else a caller may pass --
// `icon`, `input`, `inputType`, `multiline`, `reverseButtons` -- is a SweetAlert enum or
// flag, never prose, and flagging `icon: 'warning'` is exactly the false positive that
// kept this rule from being written at all.
const MESSAGE_FIELDS = new Set([
  'title',
  'text',
  'inputLabel',
  'confirmButtonText',
  'cancelButtonText',
]);

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

/** Split on top-level separators only -- a comma nested in a call/object/array/string
 *  belongs to a value, not to the property list. Same matcher shape as firstArgument(). */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * `{ title: X, icon: 'warning' }` -> [{key:'title', value:'X'}, {key:'icon', ...}].
 * Spreads and shorthand are skipped: neither carries a literal of its own.
 */
function objectProperties(objText) {
  const open = objText.indexOf('{');
  const close = objText.lastIndexOf('}');
  if (open === -1 || close <= open) return [];
  const out = [];
  for (const raw of splitTopLevel(objText.slice(open + 1, close), ',')) {
    const part = raw.trim();
    if (!part || part.startsWith('...')) continue;
    const pieces = splitTopLevel(part, ':');
    if (pieces.length < 2) continue;
    out.push({
      key: pieces[0].trim().replace(/^['"`]|['"`]$/g, ''),
      value: pieces.slice(1).join(':').trim(),
    });
  }
  return out;
}

/**
 * One file's worth of rule 1. Split out from the file loop ONLY so the self-test at the
 * bottom drives the real code path rather than a copy of it -- a self-test that
 * re-implements the scan proves the copy works, not the gate.
 */
/**
 * Everything a template literal INTERPOLATES is an expression, not prose -- blank the
 * `${...}` spans so only the static text between them is judged.
 */
function stripInterpolations(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      for (; j < text.length; j += 1) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      i = j;
      continue;
    }
    out += text[i];
  }
  return out;
}

/**
 * The literal a user would READ, or null. Applied to options-object fields only.
 *
 * Why the letter test: `text: `${translate.instant('K')}\n${lines}`` is a real and correct
 * call site (expense-batch-page) -- once the translate call is blanked and the
 * interpolations removed, all that is left of that template is a newline. A bare
 * LITERAL match reports the whole template and that is a FALSE positive, which AC-4
 * forbids. A quoted run with no letter in it cannot be a sentence anyone reads.
 */
function untranslatedProse(value) {
  const stripped = stripInterpolations(stripTranslateCalls(value));
  for (const match of stripped.matchAll(LITERAL_ALL)) {
    // Drop escape sequences BEFORE looking for a letter: the 'n' of a newline escape is
    // not prose, and reporting that escape as a hardcoded string is a false positive.
    const body = match[0].slice(1, -1).replace(/\\./g, '');
    if (HAS_LETTER.test(body)) return match[0];
  }
  return null;
}

function scanAlertCalls(source, rel, problems) {
  let plain = 0;
  let objectArg = 0;
  let parsedProps = 0;

  for (const match of source.matchAll(CALL)) {
    const method = match[1];
    const openParen = match.index + match[0].length - 1;
    const argText = readCallArguments(source, openParen);
    if (argText === null) continue;
    const line = source.slice(0, match.index).split('\n').length;

    if (OBJECT_ARG_METHODS.includes(method)) {
      // Comments first: the measured false positive began at an apostrophe inside a prose
      // comment ("the dialog's own close affordance") and ran to the next quote several
      // properties later. stripComments keeps string bodies, which is what this needs --
      // the literals ARE the subject.
      const first = stripComments(firstArgument(argText)).trim();
      // Anything else (a variable holding the options) carries no literal at this site.
      if (!first.startsWith('{')) continue;
      objectArg += 1;
      const props = objectProperties(first);
      // Reaching `{` proves only that the argument LOOKS like an options object. Every real
      // call site carries at least `title` (the type at alert.service.ts makes it required),
      // so zero parsed properties means the scanner lost the text -- an unbalanced paren in a
      // comment (`// ...  :)`) or a regex literal's `//` can do it -- and the call would then
      // sail through inspected-but-unread. Fail loudly instead of going quiet.
      if (props.length === 0) {
        problems.push(
          `${rel}:${line}  alertService.${method}({ ... }) parsed to ZERO properties -- ` +
            'the gate cannot see inside this call site'
        );
        continue;
      }
      parsedProps += props.length;
      for (const { key, value } of props) {
        if (!MESSAGE_FIELDS.has(key)) continue;
        const surviving = untranslatedProse(value);
        if (surviving) {
          problems.push(
            `${rel}:${line}  alertService.${method}({ ${key}: ... }) is handed the literal ${surviving}`
          );
        }
      }
    } else {
      plain += 1;
      const surviving = stripTranslateCalls(firstArgument(argText)).match(LITERAL);
      if (surviving) {
        problems.push(`${rel}:${line}  alertService.${method}(...) is handed the literal ${surviving[0]}`);
      }
    }
  }

  return { plain, objectArg, parsedProps };
}

const LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/;
const LITERAL_ALL = new RegExp(LITERAL.source, 'g');
// Any UNICODE letter, not [A-Za-z]. This app ships th/zh, and inline Thai/Chinese
// prose in .ts is a sanctioned pattern here (auth.interceptor.ts keeps a th/zh map
// feeding alertService.warning). With an ASCII-only test the SAME Thai string was
// reported in error('...') and waved through in confirm({ title: '...' }) -- one gate
// returning opposite verdicts on one literal.
const HAS_LETTER = /\p{L}/u;
const CALL = new RegExp(
  `alertService\\s*\\.\\s*(${[...MESSAGE_METHODS, ...OBJECT_ARG_METHODS].join('|')})\\s*\\(`,
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
let objectCallsChecked = 0;
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
  const counts = scanAlertCalls(source, rel, problems);
  callsChecked += counts.plain;
  objectCallsChecked += counts.objectArg;
}

let failed = false;

if (problems.length > 0) {
  failed = true;
  console.error(
    `hardcoded alert string gate FAILED (${problems.length} of ${callsChecked + objectCallsChecked} call sites):`
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
if (objectCallsChecked === 0 && !process.argv[2]) {
  failed = true;
  console.error(
    '::error::the object-literal half of rule 1 inspected NOTHING. It exists because ' +
      'alertService.confirm({...}) fields were invisible to this gate (OBRS-1837); if no ' +
      'call site parses as an options object any more, OBJECT_ARG_METHODS or the argument ' +
      'shape has moved and this half is passing vacuously.'
  );
}

if (envelopeFilesChecked === 0 || (wireCodeFilesChecked === 0 && !process.argv[2])) {
  failed = true;
  console.error(
    `::error::gate inspected an empty population (files=${envelopeFilesChecked}, ` +
      `wire-code files=${wireCodeFilesChecked}). It cannot pass on nothing -- check ` +
      'SRC_DIR and the helper names this script keys on.'
  );
}

// ---------------------------------------------------------------------------
// Self-test (OBRS-1837). Runs on EVERY invocation, against the real scan.
//
// The object-literal half of rule 1 exists because nobody could say what this gate
// could and could not see -- the fields of alertService.confirm({...}) were invisible
// for as long as the rule existed, and the note at the top of this file recorded that
// as a deliberate exemption rather than a blind spot. A gate whose failure path is
// never exercised is indistinguishable from one that cannot fail, so these fixtures
// pin BOTH directions: what must be caught, and what must stay quiet.
//
// Each fixture also asserts the options object was actually PARSED (objectArg === 1).
// Without that, a fixture that silently failed to parse would sail through the
// must-NOT-catch half and prove nothing at all.
const SELF_TEST = [
  {
    name: 'confirm(): a bare title literal is caught',
    catches: 'title',
    source: [
      "    this.alertService.confirm({",
      "      title: 'Delete this booking?',",
      "      text: this.translate.instant('A'),",
      "      confirmButtonText: this.translate.instant('B'),",
      "      cancelButtonText: this.translate.instant('C'),",
      "    });",
    ].join('\n'),
  },
  {
    // promptText has no production call site yet (it arrives with OBRS-1802), so this
    // fixture is the only thing exercising that name. Delete it and the method is
    // listed but unproven.
    name: 'promptText(): a bare inputLabel literal is caught, while inputType stays out of it',
    catches: 'inputLabel',
    source: [
      "    this.alertService.promptText({",
      "      title: this.translate.instant('A'),",
      "      inputLabel: 'Phone number',",
      "      inputType: 'tel',",
      "      confirmButtonText: this.translate.instant('B'),",
      "    });",
    ].join('\n'),
  },
  {
    name: 'confirm(): a ?? fallback literal is caught',
    catches: 'cancelButtonText',
    source: [
      "    this.alertService.confirm({",
      "      title: this.translate.instant('A'),",
      "      text: this.translate.instant('B'),",
      "      confirmButtonText: this.translate.instant('C'),",
      "      cancelButtonText: this.label ?? 'Cancel',",
      "    });",
    ].join('\n'),
  },
  {
    // icon: 'warning' is a SweetAlert enum. Flagging it is the false positive that kept
    // this rule unwritten.
    name: 'confirm(): fully translated, with Swal enums and flags, stays quiet',
    catches: null,
    source: [
      "    this.alertService.confirm({",
      "      title: this.translate.instant('A'),",
      "      text: this.translate.instant('B'),",
      "      confirmButtonText: this.translate.instant('C'),",
      "      cancelButtonText: this.translate.instant('D'),",
      "      icon: 'warning',",
      "      multiline: true,",
      "    });",
    ].join('\n'),
  },
  {
    // A gate that reads prose as [A-Za-z] is blind in the two languages this app ships.
    // Measured before the fix: this exact string was reported inside error('...') and
    // waved through here -- one gate, opposite verdicts, one literal.
    name: 'confirm(): Thai prose in a title is caught, same as English',
    catches: 'title',
    source: [
      "    this.alertService.confirm({",
      "      title: 'ยืนยันการยกเลิกการจอง?',",
      "      text: this.translate.instant('B'),",
      "      confirmButtonText: this.translate.instant('C'),",
      "      cancelButtonText: this.translate.instant('D'),",
      "    });",
    ].join('\n'),
  },
  {
    // text is the dialog BODY and 34 of 36 parsed sites use it, but no fixture pinned it:
    // deleting only 'text' from MESSAGE_FIELDS left the whole gate green.
    name: 'confirm(): a text field literal is caught',
    catches: 'text',
    source: [
      "    this.alertService.confirm({",
      "      title: this.translate.instant('A'),",
      "      text: 'This cannot be undone.',",
      "      confirmButtonText: this.translate.instant('C'),",
      "      cancelButtonText: this.translate.instant('D'),",
      "    });",
    ].join('\n'),
  },
  {
    // Same hole as the one above: removing a SINGLE field from the list is the realistic
    // regression, and emptying the whole Set was the only mutation the fixtures caught.
    name: 'confirm(): a confirmButtonText literal is caught',
    catches: 'confirmButtonText',
    source: [
      "    this.alertService.confirm({",
      "      title: this.translate.instant('A'),",
      "      text: this.translate.instant('B'),",
      "      confirmButtonText: 'Delete it',",
      "      cancelButtonText: this.translate.instant('D'),",
      "    });",
    ].join('\n'),
  },
  {
    // readCallArguments counts parens only, so the ':)' closes the call early and the object
    // text is lost. Measured before the fix: the site was COUNTED as inspected while zero
    // properties parsed, and the hardcoded title went unreported. Going quiet is the one
    // failure mode a gate must never have.
    name: 'confirm(): a call the scanner cannot read is reported, not passed',
    // The ONE fixture where zero parsed properties is the expected state -- it is the
    // defect being pinned, so the parsedProps guard below must not apply to it.
    unreadable: true,
    catches: 'ZERO properties',
    source: [
      "    this.alertService.confirm({",
      "      // the owner asked for this one :)",
      "      title: 'Delete this booking?',",
      "      text: this.translate.instant('B'),",
      "      confirmButtonText: this.translate.instant('C'),",
      "      cancelButtonText: this.translate.instant('D'),",
      "    });",
    ].join('\n'),
  },
  {
    // The same apostrophe, but now with a REAL literal behind it. Without comment
    // stripping the quote opened at `dialog's` swallows the property boundaries and
    // `title` stops parsing as a key at all -- so the bare literal is MISSED. A gate
    // that goes quiet on a defect is worse than one that shouts at a comment, and the
    // must-NOT-catch twin below cannot detect that direction on its own (measured:
    // removing stripComments leaves it passing).
    name: 'a prose apostrophe in a comment must not HIDE a real literal',
    catches: 'title',
    source: [
      "    this.alertService.confirm({",
      "      // Reuses the dialog's own close affordance, not a new _CANCEL key.",
      "      title: 'Delete this booking?',",
      "      text: this.translate.instant('B'),",
      "      confirmButtonText: this.translate.instant('C'),",
      "      cancelButtonText: this.translate.instant('D'),",
      "    });",
    ].join('\n'),
  },
  {
    // THE measured false positive, verbatim: firstArgument() handed the whole object to a
    // regex, which opened a literal at the apostrophe in `dialog's` and closed it at the
    // next quote -- reporting a string that does not exist. Comments are stripped first.
    name: 'promptText(): an apostrophe in a prose comment does not become a literal',
    catches: null,
    source: [
      "    this.alertService.promptText({",
      "      title: this.translate.instant('A'),",
      "      // Reuses the dialog's own close affordance, not a new _CANCEL key.",
      "      cancelButtonText: this.translate.instant('B'),",
      "      inputType: 'tel',",
      "    });",
    ].join('\n'),
  },
  {
    // The real expense-batch-page call. Once the translate calls are blanked and the
    // interpolations removed, all that survives is an escaped newline -- not prose.
    name: 'confirm(): a template of translate calls, a newline and interpolations stays quiet',
    catches: null,
    source: [
      "    this.alertService.confirm({",
      "      title: saved,",
      "      text: `${this.translate.instant('A', { n: plans.length })}\\n${lines}`,",
      "      confirmButtonText: this.translate.instant('B'),",
      "      cancelButtonText: this.translate.instant('C'),",
      "      icon: 'success',",
      "    });",
    ].join('\n'),
  },
];

for (const fixture of SELF_TEST) {
  const found = [];
  const counts = scanAlertCalls(fixture.source, 'self-test', found);

  // objectArg alone proves only that the argument began with `{`. parsedProps is the real
  // guarantee: without it a fixture whose text the scanner lost would sail through the
  // must-NOT-catch half and pin nothing.
  if (counts.objectArg !== 1 || (!fixture.unreadable && counts.parsedProps < 2)) {
    failed = true;
    console.error(
      `::error::self-test '${fixture.name}': the options object was not parsed ` +
        `(objectArg=${counts.objectArg}, parsedProps=${counts.parsedProps}). ` +
        'The fixture proves nothing in this state.'
    );
    continue;
  }

  if (fixture.catches) {
    if (!found.some((f) => f.includes(fixture.catches))) {
      failed = true;
      console.error(
        `::error::self-test '${fixture.name}': expected a finding on ` +
          `'${fixture.catches}' and got ${found.length}. The gate can no longer go red ` +
          'on the very shape it was written for.'
      );
    }
  } else if (found.length > 0) {
    failed = true;
    console.error(
      `::error::self-test '${fixture.name}': expected NO finding, got ${found.length}: ` +
        found.join('; ')
    );
  }
}
if (failed) {
  process.exit(1);
}

console.log(
  `hardcoded alert string gate OK: all ${callsChecked} AlertService message call sites and ` +
    `${objectCallsChecked} options-object call site(s) are translated.`
);
console.log(
  `envelope message gate OK: no 2xx envelope message is read as user-facing text ` +
    `across ${envelopeFilesChecked} files (${ENVELOPE_ALLOWLIST.length} reviewed exemption(s)).`
);
console.log(
  `wire errorCode form gate OK: ${wireCodeFilesChecked} files compare wire error codes, ` +
    'none against a dotted messageKey literal.'
);
