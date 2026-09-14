// i18n code-to-catalogue gate (OBRS-974).
//
// Why this exists: check-i18n-parity.mjs (OBRS-469) compares the three locale files
// AGAINST EACH OTHER, so it only sees a key that ONE language is missing. A key the
// code calls that is missing from ALL THREE is perfectly symmetric -- parity stays
// green (measured 2026-08-02: en=2660 th=2660 zh=2660, gate passing) while every user
// in every language reads the raw key off the screen, because ngx-translate echoes the
// key back when it cannot resolve it. That is how ADMIN.MESSAGES.DELETE_CONFIRM_TITLE
// sat as the modal title of two staff pages from 3b4b977e until OBRS-974: the real
// translation lives under ADMIN.COMMON, and nothing compared the code to the files.
//
// So this gate runs the other axis: every key LITERAL the code hands to `| translate`
// or `translate.instant(...)` must exist in en.json. en.json is the reference side --
// parity already guarantees th/zh carry the same key set, so checking one file here
// keeps the two gates from overlapping.
//
// Reads files directly with fs -- no Angular/Karma bundling -- so it is fast and runs
// before `npm ci`. Run locally with: npm run test:i18n-keys
//
// Source is ASCII.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// An optional argv[2] dir override exists only so the gate's own failure path can be
// exercised against a fixture, the same way check-i18n-parity.mjs takes one.
const SRC_DIR = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'src');
const EN_JSON = process.argv[3] ? resolve(process.argv[3]) : join(ROOT, 'public', 'i18n', 'en.json');

/** Flatten a nested translation object into dotted leaf keys. */
function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out.add(key);
    }
  }
  return out;
}

/** Every .html/.ts file under src/, spec files included -- a spec calling a dead key is still a dead key. */
function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectFiles(path, out);
    } else if (path.endsWith('.html') || path.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

// A key LITERAL: dotted, upper-snake segments. This shape is what makes the scan safe
// on expressions rather than on single tokens -- a key assembled at runtime
// ('ADMIN.STATUS.' + row.status) leaves only the prefix as a literal, and a trailing
// dot fails this pattern, so a dynamic key is skipped instead of falsely reported.
const KEY_LITERAL = /^[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+$/;

/** Pull every quoted string out of an expression, whatever the quote style. */
function stringLiterals(expr) {
  return [...expr.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n$]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/**
 * The expression the `| translate` pipe is applied to, read RIGHT to LEFT from the pipe.
 * When it ends in `)` the whole balanced group is the expression -- that is the shape
 * this gate exists for: `(mode === 'delete' ? 'A.B' : 'C.D') | translate` holds TWO keys
 * and a scan that only grabbed the nearest literal would have missed the failing arm.
 */
function expressionBeforePipe(text, pipeIndex) {
  let i = pipeIndex - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return '';
  if (text[i] === ')') {
    let depth = 0;
    const end = i;
    for (; i >= 0; i--) {
      if (text[i] === ')') depth++;
      else if (text[i] === '(') {
        depth--;
        if (depth === 0) return text.slice(i, end + 1);
      }
    }
    return text.slice(0, end + 1);
  }
  // Otherwise the operand is a single literal or identifier: take the run back to the
  // nearest delimiter that cannot appear inside one.
  const start = Math.max(...['{{', '"', '[', '(', ';', '\n'].map((d) => text.lastIndexOf(d, i)));
  return text.slice(start + 1, i + 1);
}

const used = new Map(); // key -> Set of "file:line"

for (const file of collectFiles(SRC_DIR)) {
  const text = readFileSync(file, 'utf8');
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const record = (expr, index) => {
    for (const literal of stringLiterals(expr)) {
      if (!KEY_LITERAL.test(literal)) continue;
      if (!used.has(literal)) used.set(literal, new Set());
      used.get(literal).add(`${relative(ROOT, file).replace(/\\/g, '/')}:${lineOf(index)}`);
    }
  };

  for (const m of text.matchAll(/\|\s*translate\b/g)) {
    record(expressionBeforePipe(text, m.index), m.index);
  }
  // translate.instant('KEY') / this.translate.instant('KEY', params) -- and .get(), which
  // is the same lookup through the observable API and fails the same way.
  for (const m of text.matchAll(/\.(?:instant|get)\s*\(([^)]*)\)/g)) {
    record(m[1], m.index);
  }
}

// Offenders that already existed when this gate was written and CANNOT be fixed by
// pointing the caller at a key that exists -- they need new copy in all three locales,
// which is a decision for the card that owns the page, not for the card that added the
// gate. Each entry names the card that closes it; closing that card means deleting the
// entry, and the gate's own failure is what proves it was really fixed.
const KNOWN_MISSING = new Map([
  ['ADMIN.MESSAGES.LOAD_FAILED', 'OBRS-1884'], // maintenance-parts registry, first-load error
]);

const catalogue = flatten(JSON.parse(readFileSync(EN_JSON, 'utf8')));
const problems = [];
for (const key of [...used.keys()].sort()) {
  if (KNOWN_MISSING.has(key)) {
    console.log(`  NOTE: "${key}" is a known hole, still open on ${KNOWN_MISSING.get(key)}.`);
    continue;
  }
  if (!catalogue.has(key)) {
    problems.push(`key "${key}" is called by the code but MISSING from en.json\n    at ${[...used.get(key)].sort().join('\n    at ')}`);
  }
}

if (problems.length > 0) {
  console.error(`i18n code-to-catalogue gate FAILED (${problems.length} problem(s)):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nThe code calls a key no locale file defines, so ngx-translate renders the raw');
  console.error('key to the user in every language. Point the caller at the key that exists');
  console.error('(check the neighbouring namespace first) rather than adding a second copy.');
  process.exit(1);
}

console.log(`i18n code-to-catalogue gate PASSED: ${used.size} key literals called by src/, all present in en.json.`);
