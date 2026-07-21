// E2E lane-membership gate (OBRS-602).
//
// Why this exists: this repo's Playwright suite grew to 223 cases that nobody had ever
// seen pass together, and the reason was structural rather than anyone's mistake.
// `playwright.config.ts` declares `testDir: './e2e'` with no `testIgnore`, so it adopts
// every spec in the directory automatically. Meanwhile each card that needed a special
// environment -- its own seeded database, a 390px viewport, a hand-started backend on
// :8575 -- added a bespoke `playwright.*.config.ts` next to it and ran the spec under
// that. The spec then belonged to two configs: the one it was written for, and the
// default one, which supplied none of what it needed. Nine of the twenty-four specs
// were in that position. Their failures were read as flakes for months because a suite
// with no known-good baseline gives you nothing to compare against, so every red run
// was explained away as "probably pre-existing" -- and it usually was, which is what
// made the habit so durable.
//
// Deleting the sweep is not enough on its own. A spec added tomorrow with no lane would
// silently belong to nothing and run nowhere, which is the same failure wearing the
// opposite sign. So membership is declared once, in `e2e/lanes.json`, and this gate
// asserts the declaration matches reality in both directions.
//
// What it enforces:
//
//   1. Every `e2e/tests/*.spec.ts` has exactly one entry in `e2e/lanes.json`, and every
//      entry names a file that exists. A new spec fails CI until its author states which
//      environment it needs. That is a thirty-second decision at authoring time and an
//      afternoon of archaeology six months later.
//
//   2. The GATE lane in `e2e/lanes.json` and `testMatch` in `playwright.gate.config.ts`
//      list exactly the same specs. Two sources of truth for "what is the merge gate"
//      is how the first one rotted.
//
//   3. No spec writes to an absolute filesystem path. Two did, both to
//      `C:/Users/<name>/Desktop/workshop/obrs-agent-office/docs/manual-tests/assets/...`
//      -- a path in a DIFFERENT git repository, containing a specific developer's
//      username. That is not hypothetical: the office repo carried modified PNGs from
//      an earlier QA run. Screenshots belong under `e2e-evidence/` (already gitignored).
//
//   4. No GATE-lane spec hardcodes a host or port. The gate lane's whole claim is that
//      it needs nothing but a browser; a literal `http://localhost:8080` in the spec
//      body is that claim being false in a way no assertion will report, because the
//      request simply fails and the test times out somewhere unrelated.
//
// Deliberate non-goal: this gate does NOT verify that a GATE spec actually mocks every
// call it makes. It cannot -- that is a runtime property. `playwright.gate.config.ts`
// verifies it instead, and does so far better than any static check could, by serving
// the app against a backend that does not exist. An unmocked call gets ECONNREFUSED, so
// a spec that passes there is provably hermetic rather than asserted to be. This script
// guards the bookkeeping; that config guards the truth.
//
// Blind spots, stated plainly:
//   - `testMatch` in the gate config is parsed with a regex, not a TypeScript parser. It
//     must stay a flat array of single-quoted `'**/name.spec.ts'` strings. Any other
//     shape is reported as a parse failure rather than passed over silently.
//   - Rule 3 matches Windows drive-letter and POSIX `/Users|/home` roots. A path built
//     at runtime by string concatenation is not caught.
//   - Lane correctness is not checked. Nothing here can tell you a spec labelled
//     SIT-LIVE would really pass on SIT; the label records intent, and intent is what
//     was missing.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = join(ROOT, 'e2e', 'tests');
const LANES_FILE = join(ROOT, 'e2e', 'lanes.json');
const GATE_CONFIG = join(ROOT, 'playwright.gate.config.ts');

const VALID_LANES = new Set(['GATE', 'GATE-BLOCKED', 'SIT-LIVE', 'OWN-DB', 'CAPTURE']);

const ABSOLUTE_PATH = /['"`](?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)[^'"`\n]+['"`]/g;
const HARDCODED_HOST = /['"`]https?:\/\/(?!\{)[^'"`\n]+['"`]/g;

const errors = [];
const fail = (msg) => errors.push(msg);

// ---------------------------------------------------------------------------

if (!existsSync(LANES_FILE)) {
  console.error(`FAIL  e2e/lanes.json is missing. Every spec must declare its lane.`);
  process.exit(1);
}

let lanes;
try {
  lanes = JSON.parse(readFileSync(LANES_FILE, 'utf8'));
} catch (e) {
  console.error(`FAIL  e2e/lanes.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const entries = lanes.specs ?? [];
const specsOnDisk = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.ts'));

// --- Rule 1: registry <-> filesystem, both directions ----------------------

const declared = new Map();
for (const entry of entries) {
  if (!entry.spec) {
    fail(`lanes.json: an entry has no "spec" field`);
    continue;
  }
  if (declared.has(entry.spec)) {
    fail(`lanes.json: "${entry.spec}" is declared more than once`);
  }
  if (!VALID_LANES.has(entry.lane)) {
    fail(
      `lanes.json: "${entry.spec}" has lane "${entry.lane}" -- must be one of ${[...VALID_LANES].join(', ')}`
    );
  }
  if (!entry.why || entry.why.trim().length < 10) {
    fail(`lanes.json: "${entry.spec}" needs a "why" explaining what environment it requires`);
  }
  declared.set(entry.spec, entry);
}

for (const file of specsOnDisk) {
  if (!declared.has(file)) {
    fail(
      `${file} is not declared in e2e/lanes.json. Add it with the lane it needs -- a spec ` +
        `that belongs to no lane runs in no lane.`
    );
  }
}
for (const spec of declared.keys()) {
  if (!specsOnDisk.includes(spec)) {
    fail(`lanes.json declares "${spec}" but e2e/tests/${spec} does not exist`);
  }
}

// --- Rule 2: GATE lane <-> playwright.gate.config.ts testMatch -------------

const gateDeclared = entries.filter((e) => e.lane === 'GATE').map((e) => e.spec).sort();

const gateSrc = readFileSync(GATE_CONFIG, 'utf8');
const matchBlock = gateSrc.match(/testMatch:\s*\[([\s\S]*?)\]/);
if (!matchBlock) {
  fail(
    `playwright.gate.config.ts: could not find a "testMatch: [ ... ]" array. This gate ` +
      `parses it with a regex, so it must stay a flat array of quoted globs.`
  );
} else {
  const gateConfigured = [...matchBlock[1].matchAll(/['"]\*\*\/([^'"]+\.spec\.ts)['"]/g)]
    .map((m) => m[1])
    .sort();

  for (const s of gateDeclared) {
    if (!gateConfigured.includes(s)) {
      fail(`lanes.json puts "${s}" in the GATE lane, but playwright.gate.config.ts does not run it`);
    }
  }
  for (const s of gateConfigured) {
    if (!gateDeclared.includes(s)) {
      fail(`playwright.gate.config.ts runs "${s}", but lanes.json does not put it in the GATE lane`);
    }
  }
}

// --- Rules 3 & 4: per-spec source hygiene ---------------------------------

for (const file of specsOnDisk) {
  const src = readFileSync(join(TESTS_DIR, file), 'utf8');
  const entry = declared.get(file);

  for (const hit of src.match(ABSOLUTE_PATH) ?? []) {
    fail(
      `${file} writes to an absolute path ${hit} -- machine-specific, and in at least two ` +
        `cases a path inside a different git repository. Use a repo-relative directory ` +
        `under e2e-evidence/ (gitignored).`
    );
  }

  if (entry?.lane === 'GATE') {
    for (const hit of src.match(HARDCODED_HOST) ?? []) {
      // A stub PAYLOAD may legitimately contain a URL (a photo link, a maps link); those
      // are data the app renders, never a request this spec issues. Only flag a literal
      // that appears in a navigation or request call.
      const line = src.slice(0, src.indexOf(hit)).split('\n').length;
      const context = src.split('\n')[line - 1] ?? '';
      if (/\b(goto|request\.(get|post|put|delete)|fetch)\s*\(/.test(context)) {
        fail(
          `${file} is in the GATE lane but navigates to a hardcoded host ${hit} (line ${line}). ` +
            `The gate lane runs with no backend and no fixed port -- use baseURL-relative paths.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------

if (errors.length) {
  console.error(`\nE2E lane gate FAILED -- ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    `\nSee e2e/lanes.json and docs/e2e-lanes.md for what each lane means and how to run it.\n`
  );
  process.exit(1);
}

const counts = {};
for (const e of entries) counts[e.lane] = (counts[e.lane] ?? 0) + 1;
console.log(
  `E2E lane gate OK -- ${entries.length} specs declared: ` +
    Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
);
