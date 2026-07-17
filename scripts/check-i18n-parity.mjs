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

const counts = LANGS.map((l) => `${l}=${keysByLang[l].size}`).join(' ');

if (problems.length > 0) {
  console.error(`i18n parity gate FAILED (${counts}):`);
  for (const p of problems) console.error(`  - ${p}`);
  // GitHub Actions surfaces ::error:: lines in the PR checks summary.
  console.error(`::error::i18n key-set drift across public/i18n/{en,th,zh}.json -- ${problems.length} problem(s). Fix so all three files share the exact same key set (see OBRS-469).`);
  process.exit(1);
}

console.log(`i18n parity gate OK: all three files share the same key set (${counts}).`);
