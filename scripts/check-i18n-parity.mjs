// i18n key-set parity gate (OBRS-469).
//
// Why this exists: public/i18n/{en,th,zh}.json are hand-edited and drift silently.
// A key present in one file but missing in another makes ngx-translate emit the RAW
// key onto the screen for that language (e.g. a Chinese user sees "REGISTER.VERIFY_OTP")
// with no error and no warning. A key with a SPACE in its path ("REGISTER.VERIFY OTP")
// is worse: the code's key and the file's key silently disagree. Both were shipped
// (OBRS-409) and only found by hand months later (OBRS-403 scrutinize -> OBRS-469).
//
// This gate fails CI the moment the three files stop having the exact same key set,
// so the drift is caught at push time instead of on a user's screen. It reads the
// files directly with fs -- no Angular/Karma bundling -- so it is fast and runs even
// before `npm ci`. Run locally with: npm run test:i18n
//
// ASCII-only source; the JSON values it validates are UTF-8 and untouched by this file.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Defaults to public/i18n; an optional argv[1] dir override exists only so the gate's
// own failure path can be exercised against a fixture (see OBRS-469 verification).
const I18N_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'i18n');
const LANGS = ['en', 'th', 'zh'];

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

const keysByLang = {};
for (const lang of LANGS) {
  const path = join(I18N_DIR, `${lang}.json`);
  keysByLang[lang] = flatten(JSON.parse(readFileSync(path, 'utf8')));
}

const problems = [];

// 1) No key path may contain whitespace -- that is always a typo, and it desyncs the
//    key the code calls from the key the file holds.
for (const lang of LANGS) {
  for (const key of keysByLang[lang]) {
    if (/\s/.test(key)) {
      problems.push(`[${lang}] key contains whitespace: "${key}"`);
    }
  }
}

// 2) The three files must have the EXACT same key set. Report, per pair, what one
//    language has that another is missing -- both directions, so nothing hides.
const union = new Set(LANGS.flatMap((l) => [...keysByLang[l]]));
for (const key of [...union].sort()) {
  const present = LANGS.filter((l) => keysByLang[l].has(key));
  if (present.length !== LANGS.length) {
    const missing = LANGS.filter((l) => !keysByLang[l].has(key));
    problems.push(`key "${key}" present in [${present.join(', ')}] but MISSING in [${missing.join(', ')}]`);
  }
}

// 3) OBRS-564 regression guard: POLICY.BUSINESS.SALES_CHANNELS renders the
//    two booking-policy numbers (advance-booking cap, cutoff) LIVE from the
//    public /api/booking-policy config -- the original defect on this card
//    was these numbers hardcoded here as a wrong "60 days / 12 hours". This
//    key must never again contain that old hardcoded copy in any language.
//
//    A denylist of today's wrong numbers is NOT enough, and testing proved it:
//    mutating the key to a hardcoded "45 days / 20 minutes" -- the numbers that
//    happen to be correct right now -- passed a denylist gate green. That is the
//    exact shape of this defect (a number correct on the day it was typed, drifting
//    silently afterwards), so the load-bearing check is the POSITIVE one below:
//    both placeholders must be present in every language. The denylist is kept
//    only as an extra guard against the two specific strings we know were wrong.
const REQUIRED_POLICY_PLACEHOLDERS = ['{{maxAdvanceDays}}', '{{cutoffMinutes}}'];
const OLD_HARDCODED_POLICY_STRINGS = ['60 days', '60 วัน', '60天', '12 hours', '12 ชั่วโมง', '12小时'];
for (const lang of LANGS) {
  const raw = readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8');
  const json = JSON.parse(raw);
  const salesChannels = json?.POLICY?.BUSINESS?.SALES_CHANNELS;
  // A missing or non-string key is a FAILURE, never a skip: `continue` here would let
  // someone delete the key outright and still get a green gate.
  if (typeof salesChannels !== 'string') {
    problems.push(
      `[${lang}] POLICY.BUSINESS.SALES_CHANNELS is missing or not a string -- the booking policy page renders this key from live config and cannot fall back (OBRS-564)`
    );
    continue;
  }
  for (const placeholder of REQUIRED_POLICY_PLACEHOLDERS) {
    if (!salesChannels.includes(placeholder)) {
      problems.push(
        `[${lang}] POLICY.BUSINESS.SALES_CHANNELS is missing the ${placeholder} placeholder -- the advance-cap and cutoff numbers must interpolate from the live /api/booking-policy config, never be typed in as literals (OBRS-564)`
      );
    }
  }
  for (const oldString of OLD_HARDCODED_POLICY_STRINGS) {
    if (salesChannels.includes(oldString)) {
      problems.push(
        `[${lang}] POLICY.BUSINESS.SALES_CHANNELS still contains the old hardcoded "${oldString}" -- must render from the live booking-policy config instead (OBRS-564)`
      );
    }
  }
}

const counts = LANGS.map((l) => `${l}=${keysByLang[l].size}`).join(' ');

if (problems.length > 0) {
  console.error(`i18n parity gate FAILED (${counts}):`);
  for (const p of problems) console.error(`  - ${p}`);
  // GitHub Actions surfaces ::error:: lines in the PR checks summary.
  console.error(`::error::i18n key-set drift across public/i18n/{en,th,zh}.json -- ${problems.length} problem(s). Fix so all three files share the exact same key set (see OBRS-469).`);
  process.exit(1);
}

console.log(`i18n parity gate OK: all three files share the same key set (${counts}).`);
