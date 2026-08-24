#!/usr/bin/env node
/**
 * OBRS-1592 - pure-node gate: `formatMoney()` in `shared/lib/money-display.ts`
 * is the ONLY thing allowed to turn an amount into a string a user reads.
 *
 * WHY A GATE. The four formats this card consolidated did not arrive as one bad
 * decision - they arrived as one line copied into the next component, twenty-four
 * times over two years, each copy locally reasonable. Measured on `dev`
 * 2026-08-24, one fare of 200 baht rendered as `฿200.00` on the reschedule
 * dialog, `THB 200.00` on the settlement report, `200 บาท` (no thousand
 * separator) on the search page, and `200.00 บาท` in the confirmation email the
 * customer got a minute later. Nothing went red at any point, because every copy
 * was self-consistent. Only a scanner that reads the whole tree can see the
 * divergence, so only a scanner can stop the twenty-fifth copy.
 *
 * WHAT IS BANNED, AND WHY EACH ONE.
 *   `style: 'currency'`             - the CLDR currency form is exactly what the
 *                                    product decided against: it prints `฿` for
 *                                    `th-TH` and pads `.00` onto every whole
 *                                    fare (OBRS-240 settled the Thai unit as
 *                                    the word "บาท"; OBRS-1592 settled satang).
 *   `| currency` (Angular pipe)     - same renderer, different spelling. The
 *                                    walk-in checkout reached `฿200.00` this
 *                                    way while every sibling screen used
 *                                    `Intl` directly, which is why banning only
 *                                    one of the two would leave the hole open.
 *   a bare `BAHT_UNIT`-style unit   - composing a raw number with a unit word
 *                                    cannot express that English puts a code
 *                                    BEFORE the number and Chinese takes no
 *                                    space, and every screen that did it also
 *                                    lost its thousand separator.
 *   ANY i18n value that IS a        - the first version of this gate banned the
 *   currency word                     NAME `BAHT_UNIT` rather than the mechanism,
 *                                    and scrutinize walked straight through it:
 *                                    `PAYMENT.SUMMARY.TOTAL_UNIT`,
 *                                    `REVIEW_SCHEDULE_BOOKING.TOTAL.TOTAL_UNIT`,
 *                                    `E_TICKET.LABEL.TOTAL_UNIT` and two
 *                                    `TICKET_UNIT`s were all the word `บาท` under
 *                                    another name, live across the whole booking
 *                                    flow. So a currency word cannot be a
 *                                    translation value at all now, whatever the
 *                                    key is called - a rename cannot evade that.
 *                                    A per-unit SUFFIX that is not itself money
 *                                    (`/คน`, `/seat`) stays legal: that is what
 *                                    goes AFTER formatMoney()'s output.
 *
 * `Intl.NumberFormat` WITHOUT `style: 'currency'` stays legal on purpose: five
 * call sites format plain counts and percentages, which are not money and must
 * not be routed through a money formatter.
 *
 * Self-tests its own matchers before trusting them with the real tree - a
 * scanner that has quietly stopped matching reports "one format everywhere",
 * which is the exact green-and-worthless result this file exists to prevent.
 *
 * Exit 0 = pass, 1 = fail. No dependencies, so this runs before `npm ci`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(root, 'src', 'app');
const I18N_DIR = join(root, 'public', 'i18n');

/** The one file allowed to hold a money-rendering decision. */
const HOME = join('src', 'app', 'shared', 'lib', 'money-display.ts');

/** `Intl.NumberFormat(..., { style: 'currency' ... })` in any spelling/indentation. */
const INTL_CURRENCY_RE = /style\s*:\s*['"]currency['"]/g;
/** The Angular currency pipe: `{{ x | currency:'THB':'symbol' }}`. */
const CURRENCY_PIPE_RE = /\|\s*currency\s*[:}]/g;
/** A unit word composed onto a bare number by the template. */
const BARE_UNIT_KEY_RE = /\bBAHT_UNIT\b/g;
/**
 * An i18n VALUE that IS a currency word — the whole value, not a mention.
 * This is the mechanism `BAHT_UNIT` was only one instance of; see the header
 * for the five keys that got past the name-based ban.
 */
const MONEY_WORD_VALUE_RE = /"[A-Za-z0-9_]+"\s*:\s*"(?:฿|THB|บาท|baht|泰铢)[^"]*"/gi;
/** A `{{x}}`/`{0}` placeholder, either interpolation dialect. */
const PLACEHOLDER = String.raw`(?:\{\{[^{}]*\}\}|\{\d+\})`;
/** The unit words, in every language this product ships. */
const UNIT = String.raw`(?:฿|THB|บาท|baht|泰铢)`;
/**
 * A currency word sitting NEXT TO an interpolated amount, anywhere in a value.
 *
 * This is the second correction to the same mistake. The name-ban missed five
 * keys called `*_UNIT`; the value-ban that replaced it was anchored to the START
 * of the value, and scrutinize walked through THAT too - `"ราคา: {{amount}} บาท"`,
 * `"Refunded {{amount}} THB."`, `"Paid — ฿{{amount}} collected"` and the parcel
 * reject dialog were all live, on customer and staff screens, while this file
 * printed OK. Position was never the mechanism. Adjacency is: a unit word
 * touching a placeholder is a number being given a unit by hand, which is the
 * one thing only formatMoney() may do.
 *
 * Prose that merely CONTAINS a unit word is untouched, which matters more in Thai
 * than it looks: `บาท` is a substring of `บทบาท` ("role"), which appears in 15
 * legitimate keys. Requiring a placeholder beside it is what keeps those green.
 */
const MONEY_WORD_NEAR_PLACEHOLDER_RE = new RegExp(
  `"[A-Za-z0-9_]+"\\s*:\\s*"[^"]*(?:${PLACEHOLDER}\\s*${UNIT}|${UNIT}\\s*${PLACEHOLDER})[^"]*"`,
  'gi'
);

/**
 * The ONE key this gate knowingly does not enforce, and why.
 *
 * `POLICY.BUSINESS.CONTENT` says "the change fee is {{rescheduleFeeLateThb}} THB
 * per seat". By the rule above that is a hand-composed unit, and it should go
 * through formatMoney() like everything else. It does not, because it is not
 * ordinary copy: OBRS-658 / ADR-0125 make this paragraph a PUBLISHED CONSUMER
 * CONTRACT under a version ledger, and check-i18n-parity.mjs refuses any edit to
 * it that does not also append {version, publishedOn, effectiveDate,
 * worsensTerms, fingerprint} and bump business-policy.version.ts. Re-wording it
 * therefore means republishing the terms with an effective date and an honest
 * worsensTerms judgement - the owner's call, on its own card, not a side effect
 * of a formatting change. This exemption is PRINTED on every run rather than
 * skipped silently, so it stays a decision someone can revisit and not a hole.
 */
const KNOWN_UNENFORCED = [
  {
    key: 'POLICY.BUSINESS.CONTENT',
    match: /"CONTENT"\s*:\s*"[^"]*rescheduleFeeLateThb[^"]*"/,
    why: 'published consumer terms under the OBRS-658 version ledger — re-wording needs a new published version',
  },
];

/**
 * true when `index` sits inside a comment - `//`, `/* *​/` or `<!-- -->`.
 * Prose is not a render site, and a gate that fails on the comment explaining
 * WHY a form is banned teaches people to delete the explanation.
 */
export function inComment(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const line = text.slice(lineStart, index);
  if (line.includes('//') || line.trimStart().startsWith('*')) return true;
  for (const [open, close] of [['/*', '*/'], ['<!--', '-->']]) {
    const o = text.lastIndexOf(open, index);
    if (o === -1) continue;
    const c = text.indexOf(close, o);
    if (c === -1 || c > index) return true;
  }
  return false;
}

/** Occurrences of `re` in `text` outside comments, as 1-based line numbers. */
export function hits(text, re) {
  const found = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!inComment(text, m.index)) {
      found.push(text.slice(0, m.index).split('\n').length);
    }
  }
  return found;
}

// --- self-test ---------------------------------------------------------------
const SELF_TEST = [
  // [sample, regex, expected hit count]
  ["new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })", INTL_CURRENCY_RE, 1],
  ['new Intl.NumberFormat(lang, {\n  style: "currency",\n  currency,\n})', INTL_CURRENCY_RE, 1],
  // MUST-NOT-CATCH: a plain number/percent formatter is not money.
  ["new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })", INTL_CURRENCY_RE, 0],
  ["new Intl.NumberFormat(lang, { style: 'percent' })", INTL_CURRENCY_RE, 0],

  ["{{ total | currency:'THB':'symbol' }}", CURRENCY_PIPE_RE, 1],
  ['{{ total | currency }}', CURRENCY_PIPE_RE, 1],
  // MUST-NOT-CATCH: an identifier that merely contains the word.
  ['{{ row.currency }}', CURRENCY_PIPE_RE, 0],
  ['{{ formatMoney(row.amount) }}', CURRENCY_PIPE_RE, 0],
  ['const currency = row.currency;', CURRENCY_PIPE_RE, 0],

  ['{{ "SCHEDULE_BOOKING.BAHT_UNIT" | translate }}', BARE_UNIT_KEY_RE, 1],
  // MUST-NOT-CATCH: naming a banned form while explaining why it is banned.
  ['// replaces the BAHT_UNIT pair this template used to compose', BARE_UNIT_KEY_RE, 0],
  ['   * `BAHT_UNIT`-key pair this template used to compose', BARE_UNIT_KEY_RE, 0],
  ['<!-- was {{ "X.BAHT_UNIT" | translate }} -->', BARE_UNIT_KEY_RE, 0],
  ["/* was style: 'currency' */", INTL_CURRENCY_RE, 0],
  ['// was {{ total | currency:"THB" }}', CURRENCY_PIPE_RE, 0],

  // The MECHANISM, not the name: any key whose VALUE opens with a unit word.
  ['"TOTAL_UNIT": "บาท",', MONEY_WORD_VALUE_RE, 1],
  ['"TICKET_UNIT": "baht/person",', MONEY_WORD_VALUE_RE, 1],
  ['"ANYTHING_AT_ALL": "泰铢/人",', MONEY_WORD_VALUE_RE, 1],
  ['"CURRENCY_FORMAT": "฿{0}",', MONEY_WORD_VALUE_RE, 1],
  // MUST-NOT-CATCH: the per-unit SUFFIX that follows formatMoney()'s output.
  ['"TICKET_UNIT": "/คน",', MONEY_WORD_VALUE_RE, 0],
  ['"SEAT_PER_PASSENGER": "/seat",', MONEY_WORD_VALUE_RE, 0],
  // MUST-NOT-CATCH: prose that merely mentions the unit somewhere inside it.
  ['"CAP": "สูงสุด 500 บาทต่อพัสดุ",', MONEY_WORD_VALUE_RE, 0],

  // Adjacency, at any position — the four shapes that were live past the value-ban.
  ['"QUOTE_AMOUNT": "ราคา: {{amount}} บาท",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 1],
  ['"REJECTED": "Parcel rejected. Refunded {{amount}} THB.",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 1],
  ['"PAID": "Paid — ฿{{amount}} collected",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 1],
  ['"FEE": "改签手续费每座位 {{fee}} 泰铢，每次改签均收取。",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 1],
  ['"CURRENCY_FORMAT": "{0} บาท",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 1],
  // MUST-NOT-CATCH: the amount already formatted, unit removed from the sentence.
  ['"QUOTE_AMOUNT": "ราคา: {{amount}}",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 0],
  ['"PAID": "Paid — {{amount}} collected",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 0],
  // MUST-NOT-CATCH: `บาท` is a substring of `บทบาท` ("role") — 15 real keys.
  ['"ROLE_COUNT": "{{count}} บทบาท",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 0],
  // MUST-NOT-CATCH: a unit named in a column HEADER, with no amount beside it.
  ['"FARE_FOR_VEHICLE_TYPE": "{{vehicleType}} fare (THB)",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 0],
  // MUST-NOT-CATCH: prose with a placeholder and a unit word far apart.
  ['"CAP": "{{n}} รายการ สูงสุด 500 บาทต่อพัสดุ",', MONEY_WORD_NEAR_PLACEHOLDER_RE, 0],
];
for (const [sample, re, expected] of SELF_TEST) {
  const got = hits(sample, re).length;
  if (got !== expected) {
    console.error('check-money-format: a matcher is broken.');
    console.error(`  expected ${expected} hit(s), got ${got} for: ${JSON.stringify(sample)}`);
    console.error('  Fix the matcher - do NOT relax this self-test to make it pass.');
    process.exit(1);
  }
}

// --- the real tree -----------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(APP_DIR);
const failures = [];
/** Sites this gate knowingly does not enforce. Printed, never silent. */
const exempted = [];

for (const file of files) {
  const rel = relative(root, file);
  if (rel === HOME) continue;
  const isSpec = file.endsWith('.spec.ts');
  const isSource = file.endsWith('.ts') && !isSpec;
  const isTemplate = file.endsWith('.html');
  if (!isSource && !isTemplate) continue;

  const text = readFileSync(file, 'utf8');

  for (const line of hits(text, INTL_CURRENCY_RE)) {
    failures.push(`${rel}:${line}  Intl currency formatter - call formatMoney() instead`);
  }
  for (const line of hits(text, CURRENCY_PIPE_RE)) {
    failures.push(`${rel}:${line}  Angular | currency pipe - call formatMoney() instead`);
  }
  for (const line of hits(text, BARE_UNIT_KEY_RE)) {
    failures.push(`${rel}:${line}  bare unit key composed onto a number - call formatMoney() instead`);
  }
}

// The retired key must not come back into the bundles either: re-adding it is
// how a template gets its second money format back. And no NEW key may become
// the next `BAHT_UNIT` under a different name — five already had, on the whole
// booking flow, while this gate reported OK.
for (const bundle of readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'))) {
  const text = readFileSync(join(I18N_DIR, bundle), 'utf8');
  for (const line of hits(text, BARE_UNIT_KEY_RE)) {
    failures.push(`public/i18n/${bundle}:${line}  BAHT_UNIT was retired by OBRS-1592`);
  }
  for (const line of hits(text, MONEY_WORD_VALUE_RE)) {
    failures.push(
      `public/i18n/${bundle}:${line}  a currency word is not a translation value — ` +
        'the unit comes from formatMoney(), not from a key'
    );
  }
  for (const line of hits(text, MONEY_WORD_NEAR_PLACEHOLDER_RE)) {
    const lineText = text.split('\n')[line - 1] ?? '';
    const exempt = KNOWN_UNENFORCED.find((e) => e.match.test(lineText));
    if (exempt) {
      exempted.push(`public/i18n/${bundle}:${line}  ${exempt.key} — ${exempt.why}`);
      continue;
    }
    failures.push(
      `public/i18n/${bundle}:${line}  a currency word next to an interpolated amount — ` +
        'pass formatMoney(x) in as the parameter and drop the unit from the sentence'
    );
  }
}

for (const e of exempted) {
  console.log(`check-money-format: NOT ENFORCED — ${e}`);
}

if (failures.length > 0) {
  console.error(`check-money-format: ${failures.length} money-rendering site(s) outside ${HOME}:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('');
  console.error('  Money reaches a user through formatMoney(value, lang) and nothing else.');
  console.error(`  It lives in ${HOME} and its header says why each alternative is banned.`);
  process.exit(1);
}

console.log('check-money-format: OK - every money-rendering site goes through formatMoney().');
