// OBRS-946 - the tenth pure-node gate. It exists because this repo has now found the
// SAME bug twice in the SAME pair of files.
//
// `scripts/inject-prod-env.js` (build time) and `src/environments/prod-config-guard.ts`
// (boot time) assert the same prod config from two sides, deliberately: the generated
// environment.prod.local.ts is gitignored, so a hand-written or stale copy skips the
// first gate entirely and only the second one sees it. Two gates is the right design.
// Two INDEPENDENTLY MAINTAINED COPIES of the rule is what keeps failing:
//
//   - OBRS-926: the runbook taught a PROD_API_URL of '/api' that both gates rejected.
//     One assertion was examined, fixed, and its twin was not audited.
//   - OBRS-946: both gates demanded an Omise public key starting with `pkey_live_`,
//     a string Omise has never issued. The live key is `pkey_` + 19 chars with no
//     environment segment (measured on the prod VM; that key took a real 20.00 THB
//     charge). So both gates rejected the CORRECT value - the prod build could not
//     produce a bundle, and a hand-written config could not boot one.
//
// Why the unit tests did not catch OBRS-946: every fixture was invented
// (`pkey_live_abcdefghijklmnop`), so the suite proved the guard agreed with the
// fixture, not with Omise. A fixture cannot falsify the assumption it was written
// from. This gate therefore checks two things a spec file cannot:
//
//   1. PARITY - the pattern is byte-identical in both files. A fix applied to one
//      copy and not the other fails here, which is exactly the shape of both bugs
//      above.
//   2. BEHAVIOUR AGAINST REAL SHAPES - the table below is built from values that were
//      observed, not imagined: the prod VM's live key, the test key committed in
//      environment.base.ts, and the fabricated string the old spec used to call valid.
//      The first row is the case that was failing in production on 2026-07-31.
//
// Costs no runner minutes (pure node, no npm install needed) and runs in the gate lane
// beside the other check-*.mjs scripts.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  { file: 'scripts/inject-prod-env.js', role: 'build-time gate (generates environment.prod.local.ts)' },
  { file: 'src/environments/prod-config-guard.ts', role: 'boot-time gate (runs against the shipped bundle)' },
];

// The declaration must be a literal regex on one line, named the same in both files.
// Anchored on the name rather than on the pattern so this gate never has to be edited
// when the pattern legitimately changes - only when it changes in one place.
const DECLARATION = /^\s*(?:export\s+)?const OMISE_LIVE_PUBLIC_KEY = (\/.+\/[a-z]*);\s*$/gm;

// Every row is a shape that has existed somewhere real. `why` is printed on failure,
// because the useful half of a red gate is which real-world value it just got wrong.
const CASES = [
  {
    // The SHAPE measured on the prod VM (/opt/obrs/.env.prod), not the key itself - a
    // publishable key is safe in source by design, but this repo is public and there is
    // nothing the real id proves here that its shape does not.
    key: 'pkey_1a2b3c4d5e6f7g8h9i0',
    accept: true,
    why: "the live-key shape on the prod VM: 'pkey_' + 19 chars, no environment segment. That key took a real 20.00 THB charge (chrg_68iydxbsxsugso4ycv4, Paid in the LIVE dashboard), which is how we know this shape is live - the prefix cannot say so, there is nothing in it to read. Rejecting it is OBRS-946 reopened: prod can neither build nor boot.",
  },
  {
    key: 'pkey_test_5rd059u8cgynfe12lds',
    accept: false,
    why: "the TEST key committed in environment.base.ts. It tokenizes against Omise's test vault: the payment returns success, the ticket is issued, and no money moves. This is the failure the gates were built for.",
  },
  {
    key: 'pkey_live_abcdefghijklmnop',
    accept: false,
    why: 'the invented fixture the old spec called valid. Omise issues no such key, so accepting it means the pattern is once again describing our imagination rather than the vendor.',
  },
  {
    key: 'skey_1a2b3c4d5e6f7g8h9i0',
    accept: false,
    why: 'a live SECRET key pasted into the public-key box - same length and charset as the correct value, so only the prefix separates them. This is why the rule stays an allowlist instead of a !startsWith(pkey_test_) denylist.',
  },
  {
    key: '',
    accept: false,
    why: 'an unset or blank PROD_OMISE_PUBLIC_KEY. A denylist would wave this through.',
  },
  {
    key: 'pkey_test_REPLACE_ME',
    accept: false,
    why: 'the unsubstituted placeholder shape (application-local.yml.example carries it verbatim).',
  },
  {
    key: 'pkey_1a2b3c4d5e6f7g8h9i',
    accept: false,
    why: 'the live key one character short - a truncated copy/paste. Length is the only thing that distinguishes it from a valid key, which is why the pattern pins it.',
  },
];

const errors = [];

// ---------------------------------------------------------------------------
// 1. Parity
// ---------------------------------------------------------------------------

const found = [];

for (const { file, role } of SOURCES) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const matches = [...src.matchAll(DECLARATION)];

  // "Found none" and "there are none" are the same value and opposite facts. A rename
  // or a reformat here must be a red gate, never a quiet pass over an empty set.
  if (matches.length === 0) {
    errors.push(
      `${file}: no \`const OMISE_LIVE_PUBLIC_KEY = /…/;\` declaration found.\n` +
        `    This file is the ${role}. Either the constant was renamed or the regex was\n` +
        `    inlined back into the condition - in both cases this gate has stopped\n` +
        `    checking anything, which is how OBRS-946 survived its own test suite.`,
    );
    continue;
  }
  if (matches.length > 1) {
    errors.push(`${file}: ${matches.length} OMISE_LIVE_PUBLIC_KEY declarations; expected exactly 1.`);
    continue;
  }

  found.push({ file, role, source: matches[0][1] });
}

if (found.length === SOURCES.length) {
  const [a, b] = found;
  if (a.source !== b.source) {
    errors.push(
      'The two Omise-key gates no longer agree.\n' +
        `    ${a.file}\n      ${a.source}\n` +
        `    ${b.file}\n      ${b.source}\n` +
        '    One was fixed and the other was left behind - the exact shape of OBRS-926\n' +
        '    and OBRS-946. Whichever is correct, both must say it: the build-time gate\n' +
        '    is skipped entirely by a hand-written environment.prod.local.ts, and the\n' +
        '    boot-time gate is the only thing that sees the bundle that actually ships.',
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Behaviour against shapes that really exist
// ---------------------------------------------------------------------------

for (const { file, source } of found) {
  const body = source.slice(1, source.lastIndexOf('/'));
  const flags = source.slice(source.lastIndexOf('/') + 1);

  let pattern;
  try {
    pattern = new RegExp(body, flags);
  } catch (e) {
    errors.push(`${file}: OMISE_LIVE_PUBLIC_KEY is not a compilable regex (${e.message}).`);
    continue;
  }

  // A `g`/`y` flag makes .test() stateful via lastIndex, so the same key would alternate
  // pass/fail across the rows below. Cheap to check, invisible when it bites.
  if (/[gy]/.test(flags)) {
    errors.push(`${file}: OMISE_LIVE_PUBLIC_KEY must not carry the 'g' or 'y' flag - .test() would be stateful.`);
    continue;
  }

  for (const { key, accept, why } of CASES) {
    const actual = pattern.test(key);
    if (actual === accept) continue;
    const shown = key === '' ? '(empty)' : key;
    errors.push(
      `${file}: ${pattern} ${actual ? 'ACCEPTS' : 'REJECTS'} '${shown}' and must ${accept ? 'ACCEPT' : 'REJECT'} it.\n` +
        `    ${why}`,
    );
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error('\ncheck-omise-key-format: the prod Omise public-key rule is wrong or out of sync.\n');
  for (const e of errors) console.error(`  - ${e}\n`);
  console.error('See docs/prod/RUNBOOK-OBRS-390-prod-frontend-config.md and OBRS-946.\n');
  process.exit(1);
}

console.log(
  `check-omise-key-format: OK - ${found.length} gates agree on ${found[0].source}, ` +
    `and all ${CASES.length} real-world key shapes land on the right side of it.`,
);
