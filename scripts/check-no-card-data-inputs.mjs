// Cardholder-data entry gate -- keeps this origin out of PCI DSS SAQ A-EP (OBRS-391).
//
// Why this exists. Until OBRS-391 the payment page rendered `<input id="creditCardNo">`
// and `<input id="cvv">` on nj-phuyaipu.com and passed their values to
// `Omise.createToken('card', ...)`. That is "direct post / JS tokenization from a
// merchant-controlled page": the PAN transits a page we control, so the site does NOT
// qualify for SAQ A (~24 requirements) and falls to SAQ A-EP (~140 requirements plus
// quarterly ASV scans, forever), and it is the arrangement clause 5.5(f) of the Omise
// Merchant Service Agreement bars unless we file an AOC with Omise every year. The fix
// was to let Omise's hosted iframe (cdn.omise.co/pay.html) collect those fields.
//
// Deleting the inputs is a one-day change. KEEPING them deleted is the actual
// requirement, and nothing about the codebase makes it obvious: an `<input>` on a
// payment form is the single most natural thing a developer can add, the compiler is
// happy, every test stays green, and the cost lands months later as an audit
// obligation or a suspended merchant account (clause 12.1(a): immediate suspension, no
// notice). This gate is what makes that regression loud.
//
// -----------------------------------------------------------------------------------
// WHAT IT FAILS ON
//
//   Templates (*.html) -- any element that can receive typed input (`input`,
//   `textarea`, `select`, `p-calendar`, `p-inputmask`, `p-inputnumber`, `p-password`,
//   `p-inputotp`) whose IDENTIFYING attribute names cardholder data:
//     id / name / formControlName / formControl / ngModel / inputId / placeholder /
//     autocomplete
//   matched against CARD_DATA_NAME below (card number, PAN, CVV/CVC/CSC, security
//   code, expiry date/month/year, and the standard `autocomplete="cc-*"` tokens).
//
//   TypeScript (*.ts) --
//     1. `createToken('card', ...)`  -- tokenizing a PAN this app is holding.
//     2. `customCardForm`            -- the OmiseCard option that puts the merchant's
//                                       own card form back on the merchant's page and
//                                       demotes OmiseCard to a tokenizer. It looks like
//                                       a styling choice and it silently restores the
//                                       exact SAQ A-EP arrangement this card removed.
//
// WHAT IT MUST NOT FAIL ON, and this half is not decoration: the word "card" is all
// over this codebase (`.card-container`, `.payment-card`, `cardToken`, `cardBrands`,
// the `'creditcard'` tab id, e-ticket's card layout) and a date picker is an ordinary
// widget (`travelDate`, `departureDate`, `birthDate`). A gate that fires on those gets
// switched off within a week, so both directions are pinned by SELF_TEST_CASES below.
//
// The self-test runs FIRST on every invocation, against in-memory fixtures. If this
// scan ever stops catching the four real shapes OBRS-391 deleted, the gate fails on
// itself before it can report a clean tree -- a gate whose own probes are broken must
// never be able to print OK (OBRS-649: a declared gate can be a silent no-op).
//
// Deliberate exception, e.g. a genuine non-payment field this scan misreads:
//   <!-- no-card-input-ok: <reason> -->      in a template
//   // no-card-input-ok: <reason>            in TypeScript
// within OPT_OUT_LOOKBACK characters before the finding. The reason after the colon is
// REQUIRED -- a bare marker suppresses nothing, so an opt-out always says why.
//
// Comments are MASKED before scanning (both `<!-- -->` and `//` / block comments), so
// prose that merely describes the forbidden shapes -- this header, and the long note in
// omise-token.service.ts -- is not itself a finding. String literals are deliberately
// NOT masked: `createToken('card'` keeps its argument, which is the thing being matched.
//
// Reads files with fs, no bundling, so it runs before `npm ci`.
// Run locally with: npm run test:no-card-inputs
//
// ASCII-only source.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

// argv[2] overrides the scan root, matching check-proto-key / check-store-null. It
// exists so this gate's own red-baseline proof can be run against the PRE-OBRS-391
// tree: `node scripts/check-no-card-data-inputs.mjs <old-worktree>/src` must FAIL.
const SRC_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const OPT_OUT_LOOKBACK = 800;
// `(?!-->)` is not pedantry: without it the `-` of an HTML comment's own terminator
// satisfies `\S`, so the bare marker `<!-- no-card-input-ok: -->` silenced findings while
// documenting nothing -- the exact escape hatch this marker must not have. The self-test
// case at the bottom caught it on this gate's first run.
const OPT_OUT = /no-card-input-ok[ \t]*:[ \t]*(?!-->)\S/;

/** Elements that can hold something a person typed. */
const INPUT_ELEMENTS = [
  'input',
  'textarea',
  'select',
  'p-calendar',
  'p-inputmask',
  'p-inputnumber',
  'p-password',
  'p-inputotp',
];

/** Attributes that NAME a field. Class and style names are excluded on purpose --
 * `.payment-card` is a layout box, not a PAN. */
const NAMING_ATTRS = [
  'id',
  'name',
  'formControlName',
  'formControl',
  'ngModel',
  'inputId',
  'placeholder',
  'autocomplete',
];

/**
 * Names that mean cardholder data.
 *
 * Every alternative is anchored on a token that has no innocent reading in this app:
 *  - `card`/`cc` immediately followed by a number word. `cardToken`, `cardBrands` and
 *    `card-container` do not match; `creditCardNo`, `card_number`, `ccNum` do.
 *  - `pan` as a WHOLE word only, so `panel`/`panState` are safe.
 *  - the CVV family, which has no other meaning.
 *  - `expiry`/`expiration`/`expire(s|d)` joined to a date part. `travelDate` and
 *    `departureDate` do not match; `expireDate`, `exp_month`, `expiryYear` do.
 *  - the W3C `autocomplete` tokens, which are unambiguous by specification.
 */
const CARD_DATA_NAME =
  /(?:(?:credit)?card|cc)[-_ ]?(?:no\b|num|pan\b)|\bpan\b|\bcvv\b|\bcvc\b|\bcsc\b|security[-_ ]?code|\bexp(?:iry|iration|ires?|ired)?[-_ ]?(?:date|month|year|mm|yy)\b|\bexp(?:iry|iration)\b|\bcc-(?:number|csc|exp|exp-month|exp-year|name)\b/i;

/** Forbidden TypeScript shapes: [regex, human explanation]. */
const TS_FORBIDDEN = [
  [
    /\bcreateToken\s*\(\s*['"]card['"]/,
    "createToken('card', ...) tokenizes a PAN this app is holding -- the SAQ A-EP " +
      'pattern OBRS-391 removed. Use OmiseTokenService.requestCardToken(), which opens ' +
      "Omise's hosted iframe and never sees the number.",
  ],
  [
    /\bcustomCardForm\b/,
    'customCardForm puts a merchant-hosted card form back in front of OmiseCard, ' +
      'restoring SAQ A-EP scope while still looking like a hosted integration ' +
      '(OBRS-391).',
  ],
];

// -----------------------------------------------------------------------------------
// Scanning
// -----------------------------------------------------------------------------------

/** Blank out comment bodies, preserving length and newlines so offsets and line
 * numbers computed against either string still agree. */
function maskComments(source, isTemplate) {
  const out = Array.from(source);
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };
  if (isTemplate) {
    const RE = /<!--[\s\S]*?(?:-->|$)/g;
    let m;
    while ((m = RE.exec(source))) blank(m.index, m.index + m[0].length);
    return out.join('');
  }
  const LINE = /\/\/[^\n]*/g;
  const BLOCK = /\/\*[\s\S]*?(?:\*\/|$)/g;
  let m;
  while ((m = BLOCK.exec(source))) blank(m.index, m.index + m[0].length);
  const masked = out.join('');
  while ((m = LINE.exec(masked))) blank(m.index, m.index + m[0].length);
  return out.join('');
}

/**
 * Text of the tag that starts at `openIndex`, up to its closing `>`.
 *
 * Quote-aware, because Angular attribute values routinely contain `>`:
 * `[disabled]="a > b"` would otherwise truncate the tag and hide every attribute
 * after it -- silently shrinking what this gate can see.
 */
function readTag(source, openIndex) {
  let quote = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return source.slice(openIndex, i + 1);
  }
  return null;
}

/** Findings for one template. `masked` drives structure; values are read from it too,
 * since nothing here lives inside a comment on a legitimate element. */
export function scanTemplate(source) {
  const masked = maskComments(source, true);
  const findings = [];
  let elementsSeen = 0;

  for (const tag of INPUT_ELEMENTS) {
    const OPEN = new RegExp(`<${tag}(?=[\\s/>])`, 'gi');
    let m;
    while ((m = OPEN.exec(masked))) {
      const text = readTag(masked, m.index);
      if (text === null) continue;
      elementsSeen += 1;
      OPEN.lastIndex = m.index + text.length;
      if (OPT_OUT.test(source.slice(Math.max(0, m.index - OPT_OUT_LOOKBACK), m.index))) {
        continue;
      }
      for (const attr of NAMING_ATTRS) {
        // Matches `id="x"`, `[id]="x"`, `formControlName="x"`, `[(ngModel)]="x"`.
        //
        // The two quote styles are separate alternatives rather than one `["']...["']`
        // class, because a BOUND attribute holds an expression that contains quotes of
        // its own: `[id]="'cardNumber'"`. A single character class stops at the inner
        // quote and captures the empty string, so every bound attribute silently passed
        // -- and a binding is precisely how someone would re-add a field without it
        // looking like the deleted code. Caught by this gate's own self-test.
        //
        // The leading `\s` is load-bearing too. Without it `[\[(]*id[)\]]*=` matched the
        // TAIL of any attribute whose name ends in "id" -- `[class.is-invalid]="..."`
        // parsed as the `id` attribute and reported the staff walk-in form's
        // `isFieldInvalid('identityCardNumber')` expression as a payment field. An
        // attribute always follows whitespace inside a tag, so requiring it costs
        // nothing and stops the gate crying wolf on the day it ships.
        const ATTR = new RegExp(
          `\\s[\\[(]*${attr}[)\\]]*\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
          'i'
        );
        const found = ATTR.exec(text);
        if (!found) continue;
        const value = found[1] ?? found[2] ?? '';
        if (!CARD_DATA_NAME.test(value)) continue;
        findings.push({
          index: m.index,
          message:
            `<${tag} ${attr}="${value}"> -- an input naming cardholder data on our ` +
            'own origin. Card fields belong in the Omise iframe, not here (OBRS-391).',
        });
        break;
      }
    }
  }
  return { findings, elementsSeen };
}

/** Findings for one TypeScript file. */
export function scanTypeScript(source) {
  const masked = maskComments(source, false);
  const findings = [];
  for (const [re, why] of TS_FORBIDDEN) {
    const GLOBAL = new RegExp(re.source, 'g');
    let m;
    while ((m = GLOBAL.exec(masked))) {
      if (OPT_OUT.test(source.slice(Math.max(0, m.index - OPT_OUT_LOOKBACK), m.index))) {
        continue;
      }
      findings.push({ index: m.index, message: `${m[0].trim()} -- ${why}` });
    }
  }
  return findings;
}

// -----------------------------------------------------------------------------------
// Self-test -- the gate's own must-catch / must-NOT-catch proof, run on every call.
// -----------------------------------------------------------------------------------

const SELF_TEST_CASES = [
  // ---- must catch: the four shapes OBRS-391 actually deleted, verbatim.
  ['html', true, '<input class="form-control" type="text" id="creditCardNo" formControlName="creditCardNo" />'],
  ['html', true, '<input class="form-control" type="text" id="cvv" formControlName="cvv" maxlength="4" />'],
  ['html', true, '<p-calendar dateFormat="mm/yy" view="month" formControlName="expireDate"></p-calendar>'],
  ['ts', true, "window.Omise?.createToken('card', payload, (statusCode, response) => {});"],
  // ---- must catch: the same intent spelled differently.
  ['html', true, '<input name="card_number" />'],
  ['html', true, '<input id="ccNum" />'],
  ['html', true, '<input autocomplete="cc-csc" id="code" />'],
  ['html', true, '<input formControlName="securityCode" />'],
  ['html', true, '<input id="expiryMonth" />'],
  ['html', true, '<input [id]="\'cardNumber\'" />'],
  // A `>` inside an attribute value must not truncate the tag and hide what follows.
  ['html', true, '<input [disabled]="a > b" formControlName="cvv" />'],
  ['ts', true, 'OmiseCard.open({ customCardForm: true, amount: 100 });'],
  // ---- must NOT catch: real shapes from this codebase.
  ['html', false, '<div class="card-container payment-card"><span>x</span></div>'],
  ['html', false, '<input id="promoCode" formControlName="promoCode" />'],
  ['html', false, '<input id="phoneNumber" formControlName="phoneNumber" />'],
  ['html', false, '<p-calendar formControlName="travelDate"></p-calendar>'],
  ['html', false, '<p-calendar formControlName="departureDate"></p-calendar>'],
  ['html', false, '<input id="panelTitle" formControlName="panelTitle" />'],
  // An attribute whose NAME merely ends in one of the naming attributes -- the
  // `[class.is-invalid]` / `[class.form-error]` shape used all over this codebase.
  // Only `formControlName` names this field, and it is not a card field.
  ['html', false, '<input [class.is-invalid]="isFieldInvalid(\'cardNumber\')" formControlName="promoCode" />'],
  ['html', false, '<button class="tab" (click)="selectTab(\'creditcard\')">Card</button>'],
  ['html', false, '<!-- historic note: this page once had <input id="cvv"> -->'],
  ['ts', false, "const payload: PaymentPayload = { bookingId, paymentMethod: 'card', cardToken };"],
  ['ts', false, "readonly cardBrands = [{ name: 'Visa', icon: 'icons/payment-brand-visa.svg' }];"],
  ['ts', false, "// historic note: this service called createToken('card', payload) before OBRS-391"],
  ['ts', false, '/* customCardForm must never be set -- see OBRS-391. */'],
  // ---- opt-out honoured, and only with a reason.
  ['html', false, '<!-- no-card-input-ok: loyalty card id, not a payment card -->\n<input id="cardNumber" />'],
  ['html', true, '<!-- no-card-input-ok: -->\n<input id="cardNumber" />'],
];

function runSelfTest() {
  const failures = [];
  for (const [kind, shouldFlag, snippet] of SELF_TEST_CASES) {
    const found =
      kind === 'html' ? scanTemplate(snippet).findings.length > 0 : scanTypeScript(snippet).length > 0;
    if (found !== shouldFlag) {
      failures.push(
        `  - expected ${shouldFlag ? 'a finding' : 'NO finding'} for [${kind}] ${snippet}`
      );
    }
  }
  return failures;
}

// -----------------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith('.html') || (full.endsWith('.ts') && !full.endsWith('.d.ts'))) {
      out.push(full);
    }
  }
  return out;
}

const selfTestFailures = runSelfTest();
if (selfTestFailures.length > 0) {
  console.error('card-data input gate FAILED ITS OWN SELF-TEST:');
  for (const f of selfTestFailures) console.error(f);
  console.error(
    '::error::This gate can no longer tell a card field from an ordinary one, so its ' +
      'verdict on the tree means nothing. Fix CARD_DATA_NAME / scanTemplate before ' +
      'trusting any run (OBRS-391).'
  );
  process.exit(1);
}

const files = walk(SRC_DIR);
const problems = [];
let templatesScanned = 0;
let inputElements = 0;
let tsScanned = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(join(SRC_DIR, '..'), file).replace(/\\/g, '/');
  const lineAt = (idx) => source.slice(0, idx).split('\n').length;

  if (file.endsWith('.html')) {
    templatesScanned += 1;
    const { findings, elementsSeen } = scanTemplate(source);
    inputElements += elementsSeen;
    for (const f of findings) problems.push(`${rel}:${lineAt(f.index)}  ${f.message}`);
  } else {
    tsScanned += 1;
    for (const f of scanTypeScript(source)) {
      problems.push(`${rel}:${lineAt(f.index)}  ${f.message}`);
    }
  }
}

// A scan that reached nothing is not a pass. Both counts are asserted because either
// one alone can be satisfied by a wrong path: an empty directory yields 0 files, and a
// path that resolves to a non-template tree yields templates with no inputs at all.
if (templatesScanned === 0 || tsScanned === 0 || inputElements === 0) {
  console.error(
    `::error::card-data input gate FOUND NOTHING TO CHECK under ${SRC_DIR} ` +
      `(${templatesScanned} template(s), ${tsScanned} .ts file(s), ${inputElements} ` +
      'input element(s)) -- the gate is a no-op, which is worse than a failure. Check ' +
      'the path (OBRS-391).'
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`card-data input gate FAILED (${problems.length} finding(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::Cardholder data must never be entered on this origin. A card number, CVV ' +
      'or expiry field on our own page moves the whole site from PCI DSS SAQ A to SAQ ' +
      'A-EP (~140 requirements plus quarterly ASV scans, permanently) and re-opens the ' +
      'clause 5.5(f) question in the Omise merchant agreement, whose penalty clause ' +
      '12.1(a) is suspension without notice. Collect card details through ' +
      "OmiseTokenService.requestCardToken(), which opens Omise's hosted iframe " +
      '(cdn.omise.co/pay.html) -- or add a `no-card-input-ok: <reason>` comment if this ' +
      'genuinely is not a payment card (OBRS-391).'
  );
  process.exit(1);
}

console.log(
  `card-data input gate OK: ${SELF_TEST_CASES.length} self-test case(s) passed, then ` +
    `${inputElements} input element(s) across ${templatesScanned} template(s) and ` +
    `${tsScanned} .ts file(s) checked -- no cardholder-data entry on this origin.`
);
