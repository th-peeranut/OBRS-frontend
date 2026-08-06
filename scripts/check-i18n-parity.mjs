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
// Source is ASCII EXCEPT for the small set of historical Thai/Chinese literals named in
// OLD_HARDCODED_POLICY_STRINGS below (gate 3) -- those must be spelled out verbatim to be
// matchable. Node reads .mjs as UTF-8, so this is safe; the JSON values this script
// validates are UTF-8 and untouched by it either way.

import { createHash } from 'node:crypto';
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

// 4) OBRS-628 AC-3: the privacy notice must stay tied to a published version.
//
//    Consent is only meaningful against a specific text, and this page carried
//    neither a version nor a date -- nothing could answer "which wording did
//    this customer agree to?". A version constant alone would not have fixed
//    that: nobody would remember to bump it, exactly the failure this repo has
//    already paid for elsewhere. So the ledger below is append-only and the
//    Thai text is fingerprinted. Editing POLICY.PRIVACY.{TITLE,CONTENT_1,
//    CONTENT_2} without adding a ledger entry FAILS here; re-using an existing
//    version number for different text collides with that version's own entry.
//    Thai is the source language for this notice (en/zh are translations of it),
//    so it is the one that defines the version.
//
//    To publish new wording: add an entry to the END of the ledger with a new
//    version, today's date and the hash this gate prints, and set the same
//    version/date in src/app/modules/privacy-policy/privacy-policy.version.ts.
const PRIVACY_VERSION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'app',
  'modules',
  'privacy-policy',
  'privacy-policy.version.ts'
);
const PRIVACY_LEDGER = [
  {
    version: '1.0',
    effectiveDate: '2026-07-22',
    fingerprint: '617bea18d7fe1952bf74fb67feead72bb4e22ff40d48a86d014cb13c0e9e1c57',
  },
  {
    // OBRS-631. The first rewrite of this notice since the site was built: 1.0
    // named no data-subject right, no processor, no retention period and no way
    // to reach us. 2.0 covers PDPA sections 30-36 and 19, the categories of
    // recipient and the transfers out of Thailand, the measured cookie list, and
    // retention as dates rather than as "as long as necessary".
    version: '2.0',
    effectiveDate: '2026-08-01',
    fingerprint: 'ca341e732b1d6797680b6ee2000c48b077736a60f5845d90634310d7333c8120',
  },
  {
    // OBRS-1095. One sentence changed: the telephone number in section 1. 2.0
    // told a data subject to call 09 0562 2019 to reach the managing partner
    // about a section 30-36 request; the owner confirmed that number is the Nong
    // Chak ticket counter. A counter clerk can neither grant nor refuse such a
    // request, so the only telephone channel the notice offered could not
    // deliver the 30-day answer the same notice promises. 08 1428 4492 reaches
    // the managing partner.
    //
    // Nothing else moved: no right, purpose, recipient, retention period or
    // transfer changed, and no new category of data is collected. It is still a
    // new version because a version identifies one text forever — and because
    // the channel for exercising a right is a term of the notice, not a
    // typographical detail (section 23(6)).
    version: '2.1',
    effectiveDate: '2026-08-06',
    fingerprint: 'f0972cfb0f91ec852fced0806f3f7cd81232cdf326a1297adb005d8ad7da0e2e',
  },
];

function privacyFingerprint(json) {
  const p = json?.POLICY?.PRIVACY;
  if (!p || typeof p.TITLE !== 'string' || typeof p.CONTENT_1 !== 'string' || typeof p.CONTENT_2 !== 'string') {
    return null;
  }
  return createHash('sha256')
    .update(JSON.stringify([p.TITLE, p.CONTENT_1, p.CONTENT_2]), 'utf8')
    .digest('hex');
}

{
  // The ledger is history, so it has to be self-consistent before it can judge anything.
  const seenVersions = new Set();
  const seenFingerprints = new Set();
  let previousDate = '';
  for (const entry of PRIVACY_LEDGER) {
    if (seenVersions.has(entry.version)) {
      problems.push(`privacy-policy ledger lists version ${entry.version} twice -- a version number identifies one text forever (OBRS-628)`);
    }
    if (seenFingerprints.has(entry.fingerprint)) {
      problems.push(`privacy-policy ledger lists the same fingerprint under two versions -- unchanged text must not be re-published as a new version (OBRS-628)`);
    }
    if (entry.effectiveDate <= previousDate) {
      problems.push(`privacy-policy ledger entry ${entry.version} has effectiveDate ${entry.effectiveDate}, which does not come after the previous entry's ${previousDate} (OBRS-628)`);
    }
    seenVersions.add(entry.version);
    seenFingerprints.add(entry.fingerprint);
    previousDate = entry.effectiveDate;
  }

  const published = PRIVACY_LEDGER[PRIVACY_LEDGER.length - 1];
  const declared = readFileSync(PRIVACY_VERSION_FILE, 'utf8');
  const declaredVersion = /PRIVACY_POLICY_VERSION\s*=\s*'([^']*)'/.exec(declared)?.[1];
  const declaredDate = /PRIVACY_POLICY_EFFECTIVE_DATE\s*=\s*'([^']*)'/.exec(declared)?.[1];
  if (declaredVersion !== published.version || declaredDate !== published.effectiveDate) {
    problems.push(
      `privacy-policy.version.ts declares ${declaredVersion} / ${declaredDate} but the newest ledger entry is ${published.version} / ${published.effectiveDate} -- the page renders the .ts values, so they are what customers see (OBRS-628)`
    );
  }

  // Same rule as OBRS-564 above, same reason: the version and date render from
  // privacy-policy.version.ts, so the sentence around them must interpolate. A
  // translator who drops or renames a placeholder produces a version line that
  // silently omits the very thing it exists to state.
  for (const lang of LANGS) {
    const line = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8'))?.POLICY?.PRIVACY?.VERSION_LINE;
    if (typeof line !== 'string') {
      problems.push(`[${lang}] POLICY.PRIVACY.VERSION_LINE is missing or not a string -- the privacy page states its version through this key (OBRS-628)`);
      continue;
    }
    for (const placeholder of ['{{version}}', '{{effectiveDate}}']) {
      if (!line.includes(placeholder)) {
        problems.push(`[${lang}] POLICY.PRIVACY.VERSION_LINE is missing the ${placeholder} placeholder -- both values come from privacy-policy.version.ts and must never be typed into a translation file (OBRS-628)`);
      }
    }
  }

  const actual = privacyFingerprint(JSON.parse(readFileSync(join(I18N_DIR, 'th.json'), 'utf8')));
  if (actual === null) {
    problems.push(`[th] POLICY.PRIVACY.{TITLE,CONTENT_1,CONTENT_2} is missing or not a string -- the privacy notice cannot be versioned if its text is not there (OBRS-628)`);
  } else if (actual !== published.fingerprint) {
    problems.push(
      `[th] POLICY.PRIVACY text no longer matches published version ${published.version}. Its fingerprint is now ${actual}. Publish it: append {version, effectiveDate, fingerprint} to PRIVACY_LEDGER in this file and set the same version/date in privacy-policy.version.ts (OBRS-628)`
    );
  }
}

// 4b) OBRS-631: the notice must still SAY the things it exists to say.
//
//     The ledger above proves the text changed and was published. It cannot
//     prove the new text is still compliant -- a rewrite that dropped the right
//     to withdraw, or the contact address, would bump a version and pass. That
//     is not hypothetical: 1.0 was a real published notice that named no right,
//     no processor, no retention period and no way to reach us, and it survived
//     for as long as it did precisely because nothing read its prose.
//
//     So this checks the load-bearing elements are present, and nothing about
//     style. It is deliberately a POSITIVE list: a denylist here would have to
//     guess the wrong wordings in advance, and the failure mode being guarded is
//     omission, not a bad phrase.
//
//     Any of these disappearing should be a decision someone argues for in a
//     card, not a diff nobody notices.
const PRIVACY_REQUIRED_TH = [
  // Every right the notice grants, by section number. Section 25 is not here:
  // the third-party notice duty is met by SMS/e-ticket wording, not by this page.
  ['มาตรา 19', 'the right to withdraw consent'],
  ['มาตรา 30', 'the right of access / to a copy'],
  ['มาตรา 31', 'the right to portability'],
  ['มาตรา 32', 'the right to object'],
  ['มาตรา 33', 'the right to erasure'],
  ['มาตรา 34', 'the right to restrict processing'],
  ['มาตรา 35', 'the right to rectification'],
  ['มาตรา 73', 'the right to complain to the PDPC'],
  // A right with no reachable channel is not a right (section 23(6)).
  ['contact@nj-phuyaipu.com', 'the contact address for exercising rights'],
  // OBRS-1095 changed this number, and the change is the point rather than a
  // rewording. It used to be 09 0562 2019, which the owner confirmed is the
  // Nong Chak TICKET COUNTER. A counter clerk can neither grant nor refuse a
  // section 30-36 request, so the channel this notice named could not deliver
  // the 30-day answer the same notice promises. 08 1428 4492 reaches the
  // managing partner, who is the person the sentence has always claimed it
  // reaches. The footer still lists the counter number and should — that is the
  // general "contact us" line, and the counter is the right destination for it.
  ['08 1428 4492', 'the contact telephone number'],
  ['0203557004978', 'the legal identity of the controller'],
  // The response time we bind ourselves to, and its lawful extension.
  ['30 วัน', 'the response deadline'],
  // Retention as a date rule, not as "as long as necessary" -- the 1.0 defect.
  ['วันสิ้นรอบบัญชี', 'the accounting-retention start point'],
];
{
  const th = JSON.parse(readFileSync(join(I18N_DIR, 'th.json'), 'utf8'))?.POLICY?.PRIVACY;
  const published = `${th?.CONTENT_1 ?? ''}${th?.CONTENT_2 ?? ''}`;
  for (const [needle, what] of PRIVACY_REQUIRED_TH) {
    if (!published.includes(needle)) {
      problems.push(
        `[th] the published privacy notice no longer contains "${needle}" -- ${what}. Restore it, or change this list in the same commit and say in the card why the notice may stop saying it (OBRS-631)`
      );
    }
  }
}

// 4c) OBRS-627: the same rule as gate 3, for the refund half of the policy.
//
//     /refund-policy stated its terms as prose typed into these files, and the
//     prose was never true -- it demanded an original paper ticket and an
//     in-person cash pickup while the app self-cancels and auto-refunds, and it
//     never named a refund rate at all. The rates, the cancellation window and
//     the early/late boundary now render from GET /api/cancellation-policy,
//     which reads the very config keys CancellationService multiplies by.
//
//     Positive check, for the reason gate 3 spells out at length: a denylist of
//     "80%" and "2 hours" would go green the moment someone typed today's
//     correct numbers as literals, which is the defect, not the fix. What must
//     be true is that the four values arrive as placeholders.
//
//     RATES_ERROR is checked too: it is what a customer sees INSTEAD of a rate
//     when the config cannot be read, and AC-3 forbids falling back to a
//     hardcoded number. If that key went missing the page would render a raw
//     "POLICY.REFUND.RATES_ERROR" where the terms should be.
const REQUIRED_REFUND_PLACEHOLDERS = [
  '{{earlyWindowHours}}',
  '{{cancelWindowHours}}',
  '{{refundRateEarlyPercent}}',
  '{{refundRateLatePercent}}',
];
for (const lang of LANGS) {
  const refund = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8'))?.POLICY?.REFUND;
  const rates = refund?.RATES;
  if (typeof rates !== 'string') {
    problems.push(
      `[${lang}] POLICY.REFUND.RATES is missing or not a string -- the refund policy page renders this key from the live cancellation-policy config and cannot fall back (OBRS-627)`
    );
  } else {
    for (const placeholder of REQUIRED_REFUND_PLACEHOLDERS) {
      if (!rates.includes(placeholder)) {
        problems.push(
          `[${lang}] POLICY.REFUND.RATES is missing the ${placeholder} placeholder -- the refund rates and cancellation windows must interpolate from GET /api/cancellation-policy, never be typed in as literals (OBRS-627)`
        );
      }
    }
  }
  if (typeof refund?.RATES_ERROR !== 'string') {
    problems.push(
      `[${lang}] POLICY.REFUND.RATES_ERROR is missing or not a string -- it is what the page shows in place of the rates when the config cannot be read, and AC-3 forbids a hardcoded fallback (OBRS-627)`
    );
  }
}

// 5) OBRS-628 AC-9: a translation that exists but stops halfway.
//
//    Gate 2 above compares KEY SETS, so a zh value holding the first two
//    paragraphs of a fourteen-paragraph notice passes it green -- which is
//    exactly what shipped: zh POLICY.PRIVACY.CONTENT_2 held 14% of the Thai
//    text and zh POLICY.BUSINESS.CONTENT held 8%, both invisible to every gate
//    and every test in the repo.
//
//    The thresholds are measured, not guessed. Across the whole bundle only six
//    keys are long enough to compare, and they split cleanly: translations that
//    are COMPLETE sit at zh 0.30-0.42 and en 0.90-1.20 of the longest language,
//    while the two truncated ones sit at 0.08 and 0.14. Chinese is genuinely far
//    more compact than Thai, which is why it gets its own floor -- a single
//    shared ratio would either miss the truncation or fail every honest zh
//    translation. Ratios are taken against the LONGEST language rather than
//    against Thai, so a truncated Thai value is caught too.
const LENGTH_COMPARE_MIN_CHARS = 200;
const LENGTH_FLOOR_BY_LANG = { en: 0.55, th: 0.55, zh: 0.22 };
// Known debt, each owned by a card. New drift fails immediately; these two are
// listed so the gate can go green today WITHOUT hiding them. An entry that
// starts passing is itself a failure -- otherwise this list would quietly
// outlive the problem and go on excusing a key nobody is watching any more.
//
// OBRS-631 changed what the POLICY.PRIVACY entries MEAN. They were opened as
// debt -- a Chinese rendering that had been cut short, listed so the gate could
// stay green without hiding it. They are not that any more: the owner decided on
// 2026-07-23 that the privacy notice is published in Thai and English ONLY,
// because no native speaker has reviewed a Chinese rendering of a legal text and
// a half-translated notice is worse than an honest pointer. The zh values are
// now a deliberate STUB naming the two published languages and the contact
// route, and they will never pass the length floor by design.
// POLICY.BUSINESS.CONTENT is still debt and still belongs to OBRS-623/629 --
// these are two different kinds of entry sharing one list.
const KNOWN_SHORT_TRANSLATIONS = [
  {
    key: 'POLICY.PRIVACY.CONTENT_1',
    lang: 'zh',
    owner: 'OBRS-631 (deliberate stub: notice is th/en only, owner 2026-07-23)',
  },
  {
    key: 'POLICY.PRIVACY.CONTENT_2',
    lang: 'zh',
    owner: 'OBRS-631 (deliberate stub: notice is th/en only, owner 2026-07-23)',
  },
  { key: 'POLICY.BUSINESS.CONTENT', lang: 'zh', owner: 'OBRS-623 / OBRS-629' },
];

/** Characters a reader actually sees: no markup, no entities, no whitespace. */
function visibleLength(value) {
  if (typeof value !== 'string') return 0;
  return value
    .replace(/&emsp;|&nbsp;|&thinsp;/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '').length;
}

{
  const valuesByLang = {};
  for (const lang of LANGS) {
    const json = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8'));
    const out = {};
    (function walk(obj, prefix) {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
        else out[key] = v;
      }
    })(json, '');
    valuesByLang[lang] = out;
  }

  const excused = new Set(KNOWN_SHORT_TRANSLATIONS.map((e) => `${e.key}|${e.lang}`));
  const stillShort = new Set();

  // Only keys present in every language are considered -- a missing key is gate 2's
  // job to report, and comparing against a zero would double-report it here.
  const sharedKeys = Object.keys(valuesByLang.th).filter((k) =>
    LANGS.every((l) => typeof valuesByLang[l][k] === 'string')
  );
  for (const key of sharedKeys.sort()) {
    const lengths = Object.fromEntries(LANGS.map((l) => [l, visibleLength(valuesByLang[l][key])]));
    const longest = Math.max(...Object.values(lengths));
    if (longest < LENGTH_COMPARE_MIN_CHARS) continue;
    const longestLang = LANGS.find((l) => lengths[l] === longest);
    for (const lang of LANGS) {
      const ratio = lengths[lang] / longest;
      if (ratio >= LENGTH_FLOOR_BY_LANG[lang]) continue;
      stillShort.add(`${key}|${lang}`);
      if (excused.has(`${key}|${lang}`)) continue;
      problems.push(
        `[${lang}] "${key}" is ${lengths[lang]} visible chars against ${longest} in ${longestLang} (${ratio.toFixed(2)}, floor ${LENGTH_FLOOR_BY_LANG[lang]}) -- the translation looks truncated, not merely more compact. Finish it, or add it to KNOWN_SHORT_TRANSLATIONS with the card that owns it (gate from OBRS-628; entries owned by OBRS-631 / OBRS-623)`
      );
    }
  }

  for (const entry of KNOWN_SHORT_TRANSLATIONS) {
    if (!stillShort.has(`${entry.key}|${entry.lang}`)) {
      problems.push(
        `KNOWN_SHORT_TRANSLATIONS still excuses [${entry.lang}] "${entry.key}" (${entry.owner}), but that translation now passes the length floor -- delete the entry so the key is guarded again (gate from OBRS-628; entries owned by OBRS-631 / OBRS-623)`
      );
    }
  }
}

const counts = LANGS.map((l) => `${l}=${keysByLang[l].size}`).join(' ');

if (problems.length > 0) {
  console.error(`i18n parity gate FAILED (${counts}):`);
  for (const p of problems) console.error(`  - ${p}`);
  // GitHub Actions surfaces ::error:: lines in the PR checks summary.
  console.error(`::error::i18n gate: ${problems.length} problem(s) in public/i18n/{en,th,zh}.json -- key-set drift (OBRS-469), hardcoded booking-policy numbers (OBRS-564), or an unpublished/truncated privacy notice (OBRS-628). Each line above says which.`);
  process.exit(1);
}

console.log(`i18n parity gate OK: all three files share the same key set (${counts}).`);
