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
  // OBRS-703 AC-10: HOW_TO_BOOK.TIP_1's no-show grace period must interpolate
  // {{noShowCutoffMinutes}} from GET /api/operations-policy, never be typed
  // back as a literal (the OBRS-620 defect this card removed). Its sibling
  // POLICY.BUSINESS.TRAVEL_CONDITIONS is guarded by the business-policy
  // fingerprint (BUSINESS_POLICY_FINGERPRINT_KEYS below); TIP_1 lives outside
  // that ledger, so without its own gate re-hardcoding "10 minutes" here would
  // pass every other check -- exactly the silent regression AC-10 forbids.
  const tip1 = json?.HOW_TO_BOOK?.TIP_1;
  if (typeof tip1 !== 'string') {
    problems.push(
      `[${lang}] HOW_TO_BOOK.TIP_1 is missing or not a string -- the how-to-book page renders the no-show cutoff from live config and cannot fall back (OBRS-703)`
    );
  } else if (!tip1.includes('{{noShowCutoffMinutes}}')) {
    problems.push(
      `[${lang}] HOW_TO_BOOK.TIP_1 is missing the {{noShowCutoffMinutes}} placeholder -- the no-show cutoff must interpolate from GET /api/operations-policy, never be typed in as a literal (OBRS-703 AC-10)`
    );
  }
}

// 3b) OBRS-658 AC 2 + AC 6 (ADR-0125): the booking terms must stay tied to a published version,
//     and a change that makes them WORSE must be announced before it bites.
//
//     Gate 3 above keeps two numbers honest. This keeps the wording itself honest. The text on
//     /business-policy is a contract with a consumer: it carried no version and no date, so nothing
//     on the site could say which wording a ticket was sold under, and because the prose is under no
//     test that reads it, it could be reworded with no trace. Same failure the privacy notice had in
//     OBRS-628, so this is deliberately the same machine (gate 4), not a second design.
//
//     The AC 6 half is the `worsensTerms` flag, and it exists because OBRS-656 is about to need it:
//     that card starts charging the reschedule fee on every change, which is worse for someone
//     already holding a ticket, and ADR-0125 decided enforcement stays live-from-config with the
//     announced effective date as the ONLY protection for that customer. An announcement that lands
//     the same day the change bites is not an announcement. So an entry flagged worsensTerms must
//     have publishedOn strictly BEFORE effectiveDate. How many days' notice is the owner's call and
//     belongs on OBRS-656; what this refuses is zero.
//
//     To publish new wording: append an entry with a new version, the date it goes on the site
//     (publishedOn), the date it takes effect (effectiveDate), an honest worsensTerms, and the hash
//     this gate prints -- then set the same version/effectiveDate in business-policy.version.ts.
const BUSINESS_POLICY_VERSION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'app',
  'modules',
  'business-policy',
  'business-policy.version.ts'
);
const BUSINESS_POLICY_LEDGER = [
  {
    // OBRS-658. The wording as it stood on this date, published for the first time under an
    // identifier. Nothing about the terms changed, so there is nothing to give notice OF and
    // publishedOn == effectiveDate is correct here -- which is exactly why worsensTerms is false
    // and why the next entry will not have that luxury.
    version: '1.0',
    publishedOn: '2026-08-12',
    effectiveDate: '2026-08-12',
    worsensTerms: false,
    fingerprint: '6d21ca462ceb4be9e5a1cfe78816f1abb087b254c3ddc5872412e9d15e690903',
  },
  {
    // OBRS-629 AC-5. Items 4 and 5 refuse liquids, fragile goods and oversized items. Read
    // literally they said this operator cannot carry parcels at all -- on a site that was already
    // selling parcel carriage and taking money for it. They now state their own scope (baggage a
    // passenger carries on board) and the parcel terms are linked from the page.
    //
    // worsensTerms: false, and not as a convenience. Nothing a ticket holder may do became
    // narrower: the same items are refused in their hands as before. What changed is that text
    // which never governed parcels stopped appearing to.
    version: '1.1',
    publishedOn: '2026-08-16',
    effectiveDate: '2026-08-16',
    worsensTerms: false,
    fingerprint: '60971f342f0be0d4c8ca8ccf08367ec34956f665a0989186b219c5450d594dbc',
  },
  {
    // OBRS-623 + OBRS-659, published together because they rewrite the same single string and
    // shipping them apart would mean two versions and two notices for one edit.
    //
    // What the old text said and the system never did: it named ANOTHER OPERATOR as the place to
    // go ("จุดจำหน่ายตั๋วโดยสารของกรีนบัส"); it carried a COVID-19 annex dated 30 April 2564
    // "until further notice" whose numbers contradicted the main body five paragraphs above it;
    // it granted an open-date ticket the system has no mechanism for; it said a cancellation was
    // possible only for force majeure or with a medical certificate, while the app has always let
    // a customer cancel from My Bookings for any reason; and it advertised statutory fare
    // reductions for monks and for soldiers and police in uniform, of which the system implements
    // none (measured 2026-08-20: the only fare discount that reaches production is the child
    // category at 50%, plus the automatic round-trip promotion, and neither was mentioned).
    //
    // The reschedule and cancellation numbers no longer appear as text at all. They interpolate
    // from GET /api/reschedule-policy and GET /api/cancellation-policy, which is why the numbers
    // in the paragraph above are absent from this note: after this version the ledger records the
    // WORDING, and the values are whatever the owner has set (ADR-0125 "Consequence").
    //
    // worsensTerms: true, on three counts, none of which is close enough to argue about:
    //   - the annex granted an open-date change and the new text withdraws it;
    //   - "one change, no fee" becomes free only above the early window and
    //     reschedule_fee_late_thb per seat below it — worse for a late change;
    //   - the published fare reductions for monks and for soldiers/police are removed.
    // That the last two were never honoured in code does not make withdrawing them costless: what
    // a ticket holder relied on is what the page said, which is the whole reason this ledger
    // exists. The notice period below is the owner's, not a default this file chose.
    version: '1.2',
    publishedOn: '2026-08-20',
    effectiveDate: '2026-08-27',
    worsensTerms: true,
    fingerprint: 'e0f2eb098fb34e0e8dcd9cdf6b1747d5493700e0c8507f118bd4912a00df6d3c',
  },
  {
    // OBRS-656. One bullet in item 2. The change fee no longer depends on when the change is made:
    // it is reschedule_fee_late_thb per seat on every change, and the sentence that offered it free
    // above early_window_hours is withdrawn.
    //
    // worsensTerms: true, and there is nothing to weigh. This is the only card in Epic OBRS-654
    // that takes something away — a customer who could change a far-off trip for nothing now pays
    // per seat for it. The field describes the TEXT, not how many people it reaches; the owner's
    // position that nobody holds a ticket under 1.2 yet is a reason the notice can be short, not a
    // reason to record this as neutral.
    //
    // ⚠️ The dates are NOT the "publish today, effective tomorrow" the owner approved on
    // 2026-08-19, and the difference is the ledger's doing, not a change of mind. Entry 1.2
    // (OBRS-623/659) merged on 08-20 with an effective date of 08-27, and the ordering rule above
    // (`effectiveDate <= previousDate` is an error) means this entry cannot take effect until
    // 08-28 at the earliest — a version cannot come into force before the one ahead of it. So the
    // notice period here is seven days because 1.2 is still pending, not because anyone chose
    // seven. Moving it earlier is not available without moving 1.2.
    //
    // ⚠️ If the frontend PR is merged after 2026-08-27, publishedOn is no longer true and BOTH
    // dates move: publishedOn to the real merge date, effectiveDate to the day after. The backend
    // PR that drops the free branch merges ON effectiveDate, so that the page and the money agree
    // from the first minute the new rule is enforced (ADR-0125: enforcement reads live config, so
    // the announced date is the only protection an existing ticket holder has).
    version: '1.3',
    publishedOn: '2026-08-21',
    effectiveDate: '2026-08-28',
    worsensTerms: true,
    fingerprint: '0003a80bd49694ca0475cba3225c4641c4c4ca0571b6c6f7b8a5db5d48cb299c',
  },
  {
    // OBRS-703 AC-10. Item 3 of TRAVEL_CONDITIONS ("...more than 10 minutes
    // after that departure time...") stopped being a literal "10" and now
    // interpolates {{noShowCutoffMinutes}} from the PUBLIC
    // GET /api/operations-policy endpoint -- the strictest (lowest) no-show
    // cutoff across every owner. Same defect shape gate 3 above already
    // guards for SALES_CHANNELS (OBRS-564): the number was typed into i18n
    // and could silently go wrong the moment an owner's real cutoff diverged
    // from the literal "10" this page had quoted since 1.0.
    //
    // worsensTerms: false. The number itself is unchanged today (an owner who
    // has never overridden noShowCutoffMinutes still gets 10), and going
    // forward the page can only ever UNDERSTATE the grace period relative to
    // any individual owner's true cutoff (it renders the STRICTEST value
    // platform-wide, never the platform default) -- so the worst case for a
    // customer is arriving earlier than strictly necessary, not losing a
    // ticket the old hardcoded "10" would have told them they still had time
    // to catch. A wording fix that can only make the promise MORE
    // conservative is not a worsening of what a ticket holder relied on.
    //
    // ⚠️ effectiveDate is NOT publishedOn, even though worsensTerms is false --
    // same forced gap as 1.3's own comment above: the ordering rule
    // (`effectiveDate` must come strictly after the PREVIOUS entry's) is
    // unconditional, and 1.3 is not itself in force until 2026-08-28. 1.4
    // cannot take effect before the version ahead of it does, so 2026-08-29
    // is the earliest date available while 1.3 stands, not a chosen notice
    // period.
    version: '1.4',
    publishedOn: '2026-08-21',
    effectiveDate: '2026-08-29',
    worsensTerms: false,
    fingerprint: '07a4da3484a127787b275070d4e85298242869b68ae182dbc1954356620fabe1',
  },
];

// OBRS-623/659 widened this from three keys to six. The terms did not grow — they were split, and
// the split had to be matched here or half of them would have fallen outside the version they are
// published under. CONTENT gave up the passenger travel conditions (TRAVEL_CONDITIONS, so an
// outage cannot blank them: they hold no config value and the rest of the page now does), and the
// reschedule cap became a pair of sentences the component picks between (RESCHEDULE_COUNT_*,
// because `reschedule_max_count = 0` means UNLIMITED and cannot be interpolated as a number).
// Every one of the six is published policy text; a key that is policy text and not in this hash is
// text that can be reworded with no version and no notice, which is the hole OBRS-658 closed.
//
// ⚠️ Consequence, stated rather than hidden: the fingerprints stored for 1.0 and 1.1 were computed
// over the THREE-key list and cannot be reproduced by this function. They stay in the ledger as the
// historical record they are — the gate only ever recomputes the CURRENT text against the NEWEST
// entry, and the older entries are read for uniqueness and date ordering, neither of which needs
// the hash to be recomputable.
const BUSINESS_POLICY_FINGERPRINT_KEYS = [
  'TITLE',
  'SALES_CHANNELS',
  'CONTENT',
  'TRAVEL_CONDITIONS',
  'RESCHEDULE_COUNT_UNLIMITED',
  'RESCHEDULE_COUNT_LIMITED',
];

function businessPolicyFingerprint(json) {
  const b = json?.POLICY?.BUSINESS;
  if (!b || BUSINESS_POLICY_FINGERPRINT_KEYS.some((k) => typeof b[k] !== 'string')) {
    return null;
  }
  return createHash('sha256')
    .update(JSON.stringify(BUSINESS_POLICY_FINGERPRINT_KEYS.map((k) => b[k])), 'utf8')
    .digest('hex');
}

{
  // The ledger is history, so it has to be self-consistent before it can judge anything.
  const seenVersions = new Set();
  const seenFingerprints = new Set();
  let previousDate = '';
  for (const entry of BUSINESS_POLICY_LEDGER) {
    if (seenVersions.has(entry.version)) {
      problems.push(`business-policy ledger lists version ${entry.version} twice -- a version number identifies one text forever (OBRS-658)`);
    }
    if (seenFingerprints.has(entry.fingerprint)) {
      problems.push(`business-policy ledger lists the same fingerprint under two versions -- unchanged text must not be re-published as a new version (OBRS-658)`);
    }
    if (entry.effectiveDate <= previousDate) {
      problems.push(`business-policy ledger entry ${entry.version} has effectiveDate ${entry.effectiveDate}, which does not come after the previous entry's ${previousDate} (OBRS-658)`);
    }
    if (typeof entry.worsensTerms !== 'boolean') {
      problems.push(`business-policy ledger entry ${entry.version} has no worsensTerms boolean -- whether a change makes an existing ticket holder worse off is the fact AC 6 turns on, and it cannot be left unstated (OBRS-658)`);
    }
    if (entry.publishedOn > entry.effectiveDate) {
      problems.push(`business-policy ledger entry ${entry.version} is published on ${entry.publishedOn} but effective from ${entry.effectiveDate} -- terms cannot take effect before the page states them (OBRS-658)`);
    }
    // AC 6, the load-bearing check: enforcement reads live config (ADR-0125), so the announced
    // effective date is the ONLY thing standing between a worse rule and a ticket already sold.
    if (entry.worsensTerms === true && !(entry.publishedOn < entry.effectiveDate)) {
      problems.push(
        `business-policy ledger entry ${entry.version} worsens the terms but is published on ${entry.publishedOn} and effective ${entry.effectiveDate} -- a change that makes an existing ticket holder worse off must be announced BEFORE it takes effect (OBRS-658 AC 6, ADR-0125)`
      );
    }
    seenVersions.add(entry.version);
    seenFingerprints.add(entry.fingerprint);
    previousDate = entry.effectiveDate;
  }

  const published = BUSINESS_POLICY_LEDGER[BUSINESS_POLICY_LEDGER.length - 1];
  const declared = readFileSync(BUSINESS_POLICY_VERSION_FILE, 'utf8');
  const declaredVersion = /BUSINESS_POLICY_VERSION\s*=\s*'([^']*)'/.exec(declared)?.[1];
  const declaredDate = /BUSINESS_POLICY_EFFECTIVE_DATE\s*=\s*'([^']*)'/.exec(declared)?.[1];
  if (declaredVersion !== published.version || declaredDate !== published.effectiveDate) {
    problems.push(
      `business-policy.version.ts declares ${declaredVersion} / ${declaredDate} but the newest ledger entry is ${published.version} / ${published.effectiveDate} -- the page renders the .ts values, so they are what customers see (OBRS-658)`
    );
  }

  // Same rule as gate 3 and gate 4, same reason: the version and date render from
  // business-policy.version.ts, so the sentence around them must interpolate. A translator who
  // drops a placeholder produces a version line that silently omits the very thing it states.
  for (const lang of LANGS) {
    const line = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8'))?.POLICY?.BUSINESS?.VERSION_LINE;
    if (typeof line !== 'string') {
      problems.push(`[${lang}] POLICY.BUSINESS.VERSION_LINE is missing or not a string -- the booking-terms page states its version through this key (OBRS-658)`);
      continue;
    }
    for (const placeholder of ['{{version}}', '{{effectiveDate}}']) {
      if (!line.includes(placeholder)) {
        problems.push(`[${lang}] POLICY.BUSINESS.VERSION_LINE is missing the ${placeholder} placeholder -- both values come from business-policy.version.ts and must never be typed into a translation file (OBRS-658)`);
      }
    }
  }

  // Thai is the source language for these terms (en/zh are translations of it), so it is the one
  // that defines the version -- same call gate 4 makes for the privacy notice.
  const actual = businessPolicyFingerprint(JSON.parse(readFileSync(join(I18N_DIR, 'th.json'), 'utf8')));
  if (actual === null) {
    problems.push(`[th] POLICY.BUSINESS.{${BUSINESS_POLICY_FINGERPRINT_KEYS.join(',')}} -- one is missing or not a string, and the booking terms cannot be versioned if their text is not there (OBRS-658)`);
  } else if (actual !== published.fingerprint) {
    problems.push(
      `[th] POLICY.BUSINESS text no longer matches published version ${published.version}. Its fingerprint is now ${actual}. Publish it: append {version, publishedOn, effectiveDate, worsensTerms, fingerprint} to BUSINESS_POLICY_LEDGER in this file and set the same version/effectiveDate in business-policy.version.ts (OBRS-658)`
    );
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
  {
    // OBRS-1140 AC#3. One bullet added to section 6: the export-audit trail.
    //
    // 2.1 listed retention for every category of personal data the notice knew
    // about, and that list was complete for the data a customer gives us. It was
    // silent about a record we keep ABOUT that data -- export_audit_log, which
    // stores which member of staff exported which dataset, when, and the search
    // filters they used. The filters are personal data (a phone number typed in
    // to find one booking is a phone number), and until this card nothing deleted
    // any of it. Section 6 now states both periods: the filters are erased after
    // 90 days, the rest of the audit row after a year.
    //
    // A new version rather than a correction: the notice's retention section is
    // the promise a data subject reads to learn how long we hold what, and it now
    // names a category it did not name before. Nothing was removed and no right,
    // recipient, purpose or transfer changed.
    version: '2.2',
    effectiveDate: '2026-08-09',
    fingerprint: 'f501c8d66bf52ac63e488cb1f979c78d6521b4639d06e93b5e4a275543b70f66',
  },
  {
    // OBRS-1140 AC#4, same day as 2.2 and for the mirror-image reason. 2.2 added
    // the record we keep ABOUT a customer's data; this adds the one category the
    // customer supplies directly that section 6 had never covered at all.
    //
    // Section 2 has always said we collect "ภาพที่ท่านแนบมา" -- the screenshots a
    // member of the public attaches to a usability report, which is anonymous and
    // needs no account. Section 6 listed six categories and this was not one of
    // them, so the notice declared the collection and declared no limit on it,
    // while the code deleted an attachment only as compensation for a failed
    // upload. Section 6 now says: kept until the report is closed, then 90 days,
    // with a two-year backstop for a report nobody ever triaged.
    //
    // A new version rather than an amendment to 2.2 even though it is the same
    // day: 2.2 was published in its own commit and a version identifier that
    // covers two different texts is the one thing this ledger exists to prevent.
    //
    // Dated the 10th and not the 9th because this gate requires the dates to
    // increase strictly, and it is right to: two versions sharing a date cannot be
    // ordered by the only field a data subject can see. So the 10th is the first
    // date on which 2.3 can be in force, which is what an effective date means.
    // Nobody loses anything by the day: prod serves no site yet (it answers 404),
    // and the scheduled dev->sit promote does not run until Monday night.
    version: '2.3',
    effectiveDate: '2026-08-10',
    fingerprint: '3e3ae981343e8237641c11b49535e2ded6f9e1e51c85ea30c217eac1f2335c73',
  },
  {
    // OBRS-1528 + OBRS-1366, published together on the owner's decision of
    // 2026-08-22 precisely BECAUSE this ledger refuses to let one version cover
    // two texts: fixed separately they would have cost two bumps, and every bump
    // re-asks every existing account for consent (OBRS-632). Three sentences that
    // described something the code does not do:
    //
    // 1. The withdraw button (OBRS-1528). The notice pointed at it twice as plain
    //    fact — "the button at the end of this page" — and OBRS-1179 correctly
    //    stopped rendering it wherever no measurement ID is configured, which is
    //    every build prod runs. A declared right with no mechanism is the OBRS-627
    //    defect. Both sentences are now conditional on the site actually
    //    collecting, which is true in both builds instead of neither.
    //
    // 2. The cookie paragraph (the half OBRS-1179 did not cause). It said consent
    //    alone makes the analytics providers set _ga/_clck/_clsk; consent alone
    //    does not, because `loadGa4()` returns early with no ID. It now states
    //    both conditions and says plainly that without analytics switched on
    //    nothing is collected whatever the visitor answers.
    //
    // 3. Passenger type (OBRS-1366). Section 2 said it is used "to arrange seating
    //    and to apply the correct fare"; measured on the code prod runs, seat
    //    assignment never reads it and no discount service reads it either. It is
    //    display-only, so the notice now says display-only. The list also gains
    //    "nun" (OBRS-1365 shipped that option) and records that the field is
    //    optional (OBRS-1357 stopped requiring it).
    //
    // Deliberately NOT written: the gender-aware seating rules of OBRS-1364, which
    // would make sentence 3 true again. A notice describes what the system does on
    // its effective date, not what a card plans.
    version: '2.4',
    effectiveDate: '2026-08-22',
    fingerprint: '88913a6ed309150e206ac58d55f7dced2b147a5a11540a9af71d3d22dc3591c1',
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
  // OBRS-623 AC-4 (2026-08-20): the [zh] POLICY.BUSINESS.CONTENT exemption is GONE, not moved.
  // zh was 13.5% of the Thai and stopped mid-document at item 7 — no fare-discount block and no
  // passenger travel conditions at all, so a Chinese reader was agreeing to terms whose second
  // half they had never been shown. The rewrite covers every item in all three languages and the
  // key clears the floor on its own, which is why this line can be deleted rather than reworded.
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

// 6) OBRS-629: the parcel carriage terms must stay tied to a published version, and the two
//    numbers a sender reads must keep coming from the live config.
//
//    Why this gate and not just gate 3's shape: the parcel service was selling and taking money
//    with NO published terms at all, so there was never a wording to drift -- this is the first
//    one. Two distinct things are guarded here and they are guarded differently on purpose.
//
//    The weight/carry-on limits are ENFORCED by ParcelIntakeService, so a page repeating them can
//    silently disagree with the code. They must interpolate from GET /api/parcel-policy, exactly
//    as gate 3 requires for the booking-policy numbers (OBRS-564). carryOnFreeSizeMinInch is
//    explicitly rejected: PublicParcelPolicyRespDto refuses to serve it because no main-source
//    line reads it, and the draft wording had it published as a floor that applies to nothing.
//
//    The 500-baht liability ceiling is NOT enforced anywhere -- claims are settled at a counter in
//    cash (clause 9) and there is no claims engine to disagree with. It is a contract term, so the
//    protection it gets is the fingerprint below: change the number and this gate refuses until a
//    new version is published. STAFF.PARCEL_WAYBILL.TERMS_SUMMARY is fingerprinted with the page
//    because the printed waybill states the same ceiling; they are one published contract on two
//    surfaces, and letting one move without the other is how they end up saying different numbers.
const PARCEL_POLICY_VERSION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'app',
  'modules',
  'parcel-policy',
  'parcel-policy.version.ts'
);
const PARCEL_POLICY_FINGERPRINTED_KEYS = [
  'TITLE',
  'SCOPE',
  'PROHIBITED_INTRO',
  'PROHIBITED_EXTRA',
  'FALSE_DECLARATION',
  'LIMITS',
  'FREIGHT',
  'COLLECTION',
  'LEFT_AT_STOP',
  'CANCELLATION',
  'LIABILITY',
  'LIABILITY_TIERS',
  'CLAIMS',
  'CONSENT',
  'NOT_PASSENGER_BAGGAGE',
  'AMENDMENT',
];
const PARCEL_POLICY_LEDGER = [
  {
    // The first published wording. It replaces no earlier text -- before it there was no parcel
    // terms page at all -- so there is nothing to give notice OF and publishedOn == effectiveDate.
    //
    // The fingerprint was CORRECTED IN PLACE once, same day, rather than opening a 1.1: clause 3's
    // last sentence said an over-size item "must buy a seat of its own", and the owner's account of
    // the operation (2026-08-16) showed why that reads wrong -- there is no luggage hold, every
    // item rides in the saloon, and an over-size one is charged because it occupies a seat's worth
    // of floor. Amending is legitimate ONLY because 1.0 had never reached a reader: it lives on
    // branch obrs-629-parcel-terms-fe, PR #233 is unmerged, and no deploy carries it. A version
    // somebody has read is append-only and stays that way.
    version: '1.0',
    publishedOn: '2026-08-16',
    effectiveDate: '2026-08-16',
    fingerprint: 'c9822e1c0667efb36af3c55935c1945b8aa8d92d5948515d693d4db934a2616d',
  },
];

function parcelPolicyFingerprint(json) {
  const p = json?.POLICY?.PARCEL;
  const waybillSummary = json?.STAFF?.PARCEL_WAYBILL?.TERMS_SUMMARY;
  if (!p || typeof waybillSummary !== 'string') {
    return null;
  }
  const values = PARCEL_POLICY_FINGERPRINTED_KEYS.map((k) => p[k]);
  if (values.some((v) => typeof v !== 'string')) {
    return null;
  }
  return createHash('sha256')
    .update(JSON.stringify([...values, waybillSummary]), 'utf8')
    .digest('hex');
}

{
  const seenVersions = new Set();
  const seenFingerprints = new Set();
  let previousDate = '';
  for (const entry of PARCEL_POLICY_LEDGER) {
    if (seenVersions.has(entry.version)) {
      problems.push(`parcel-policy ledger lists version ${entry.version} twice -- a version number identifies one text forever (OBRS-629)`);
    }
    if (seenFingerprints.has(entry.fingerprint)) {
      problems.push(`parcel-policy ledger lists the same fingerprint under two versions -- unchanged text must not be re-published as a new version (OBRS-629)`);
    }
    if (entry.effectiveDate <= previousDate) {
      problems.push(`parcel-policy ledger entry ${entry.version} has effectiveDate ${entry.effectiveDate}, which does not come after the previous entry's ${previousDate} (OBRS-629)`);
    }
    if (entry.publishedOn > entry.effectiveDate) {
      problems.push(`parcel-policy ledger entry ${entry.version} is published on ${entry.publishedOn} but effective from ${entry.effectiveDate} -- terms cannot take effect before the page states them (OBRS-629)`);
    }
    seenVersions.add(entry.version);
    seenFingerprints.add(entry.fingerprint);
    previousDate = entry.effectiveDate;
  }

  const published = PARCEL_POLICY_LEDGER[PARCEL_POLICY_LEDGER.length - 1];
  const declared = readFileSync(PARCEL_POLICY_VERSION_FILE, 'utf8');
  const declaredVersion = /PARCEL_POLICY_VERSION\s*=\s*'([^']*)'/.exec(declared)?.[1];
  const declaredDate = /PARCEL_POLICY_EFFECTIVE_DATE\s*=\s*'([^']*)'/.exec(declared)?.[1];
  if (declaredVersion !== published.version || declaredDate !== published.effectiveDate) {
    problems.push(
      `parcel-policy.version.ts declares ${declaredVersion} / ${declaredDate} but the newest ledger entry is ${published.version} / ${published.effectiveDate} -- the page renders the .ts values, so they are what senders see (OBRS-629)`
    );
  }

  for (const lang of LANGS) {
    const parcel = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8'))?.POLICY?.PARCEL;

    const line = parcel?.VERSION_LINE;
    if (typeof line !== 'string') {
      problems.push(`[${lang}] POLICY.PARCEL.VERSION_LINE is missing or not a string -- the parcel terms page states its version through this key (OBRS-629)`);
    } else {
      for (const placeholder of ['{{version}}', '{{effectiveDate}}']) {
        if (!line.includes(placeholder)) {
          problems.push(`[${lang}] POLICY.PARCEL.VERSION_LINE is missing the ${placeholder} placeholder -- both values come from parcel-policy.version.ts and must never be typed into a translation file (OBRS-629)`);
        }
      }
    }

    // AC-3, the same rule gate 3 enforces for the booking-policy numbers.
    const limits = parcel?.LIMITS;
    if (typeof limits !== 'string') {
      problems.push(`[${lang}] POLICY.PARCEL.LIMITS is missing or not a string -- the parcel terms page renders this key from live config and cannot fall back (OBRS-629 AC-3)`);
    } else {
      for (const placeholder of ['{{maxWeightKg}}', '{{carryOnFreeSizeMaxInch}}', '{{carryOnFreeAisleMaxPerTrip}}']) {
        if (!limits.includes(placeholder)) {
          problems.push(`[${lang}] POLICY.PARCEL.LIMITS is missing the ${placeholder} placeholder -- the weight and carry-on limits must interpolate from GET /api/parcel-policy, never be typed in as literals (OBRS-629 AC-3)`);
        }
      }
      // Not served, and not enforced: classifyOnSeat compares against the MAX only, so a "from 16
      // inches" floor on this page would be a limit in front of a customer that nothing applies.
      if (limits.includes('carryOnFreeSizeMinInch')) {
        problems.push(`[${lang}] POLICY.PARCEL.LIMITS references carryOnFreeSizeMinInch, which GET /api/parcel-policy deliberately does not serve because no code reads it -- publishing it states a limit nothing enforces (OBRS-629 AC-3)`);
      }
    }

    if (typeof parcel?.LIMITS_ERROR !== 'string') {
      problems.push(`[${lang}] POLICY.PARCEL.LIMITS_ERROR is missing or not a string -- it is what the page shows in place of the limits when the config cannot be read, and AC-3 forbids a hardcoded fallback (OBRS-629)`);
    }
  }

  // Thai is the source language for these terms; en/zh are translations of it.
  const actual = parcelPolicyFingerprint(JSON.parse(readFileSync(join(I18N_DIR, 'th.json'), 'utf8')));
  if (actual === null) {
    problems.push(`[th] POLICY.PARCEL.* or STAFF.PARCEL_WAYBILL.TERMS_SUMMARY is missing or not a string -- the parcel terms cannot be versioned if their text is not there (OBRS-629)`);
  } else if (actual !== published.fingerprint) {
    problems.push(
      `[th] parcel terms text no longer matches published version ${published.version}. Its fingerprint is now ${actual}. Publish it: append {version, publishedOn, effectiveDate, fingerprint} to PARCEL_POLICY_LEDGER in this file and set the same version/effectiveDate in parcel-policy.version.ts (OBRS-629)`
    );
  }
}

const counts = LANGS.map((l) => `${l}=${keysByLang[l].size}`).join(' ');

if (problems.length > 0) {
  console.error(`i18n parity gate FAILED (${counts}):`);
  for (const p of problems) console.error(`  - ${p}`);
  // GitHub Actions surfaces ::error:: lines in the PR checks summary.
  console.error(`::error::i18n gate: ${problems.length} problem(s) in public/i18n/{en,th,zh}.json -- key-set drift (OBRS-469), hardcoded booking-policy numbers (OBRS-564), unpublished booking terms (OBRS-658), or an unpublished/truncated privacy notice (OBRS-628). Each line above says which.`);
  process.exit(1);
}

console.log(`i18n parity gate OK: all three files share the same key set (${counts}).`);
