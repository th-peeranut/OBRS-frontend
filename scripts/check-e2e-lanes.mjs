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
//   5. No GATE-lane spec passes `force: true` to a pointer action (OBRS-775 AC5). It
//      does not aim the event; it deletes the check that the click reached what it
//      names. OBRS-750 spent a card and a wrong diagnosis on exactly that.
//
//   6. No two root configs read the same port env var, and no two default to the same
//      port -- unless the sharing is declared in SHARED_PORT_ENV_OK with a reason
//      (OBRS-1531). This is not tidiness. `webServer.reuseExistingServer` is `!CI`, so
//      locally the second lane to start gets no port-in-use error: it attaches to the
//      first one's dev server and reports THAT tree's code as its own result, silently.
//      Three configs read `E2E_GATE_PORT` and two of them defaulted to 4230, so setting
//      the var to escape a collision moved two other lanes along with it.
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
//   - Rule 6 reads only `process.env['X'] ?? 'NNNN'` declarations. A config that
//     hardcodes `--port 4200` states no variable and is not compared -- and about ten
//     of them do, all pointing at a hand-started server whose CORS allow-list pins that
//     exact origin. Those lanes cannot be moved by an env var, which is why they are
//     out of scope here rather than silently exempted.
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

// Rule 3 is an ALLOW-LIST on the one sink that matters, not a deny-list of path shapes.
// The first draft denied drive letters and /Users|/home roots, which caught the two
// instances that prompted the rule and missed the likelier next one: a RELATIVE
// '../../obrs-agent-office/docs/...' reaches the same foreign repository and looks
// portable while doing it. Screenshots must land under e2e-evidence/ (gitignored) or in
// Playwright's own output dir; anything else is a finding regardless of how it is spelt.
const SCREENSHOT_PATH = /\bpath:\s*(['"`])([^'"`\n]*)\1/g;
const ALLOWED_EVIDENCE = /^(e2e-evidence\/|test-results\/|\$\{ASSETS\})/;
const ABSOLUTE_PATH = /(['"`])(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)[^'"`\n]*\1/g;
const HARDCODED_HOST = /(['"`])https?:\/\/(?!\{)[^'"`\n]*\1/g;

// Rule 6 (OBRS-775 AC5). `force: true` on a pointer action does not aim the event at
// the element -- it skips the actionability checks and dispatches at the coordinates
// anyway, so the event lands on whatever is topmost. That is not a workaround for a
// flaky click; it is the assertion being deleted. OBRS-750 is the whole argument:
// `b2c-critical-path` clicked `.btn-confirm` with `force: true`, the event went to the
// button's malformed inline PARENT, the navigation never happened, and the spec timed
// out for 60s on a clean GitHub runner while the diagnosis went to CPU contention.
// OBRS-753 found the real cause and OBRS-775 swept the codebase for the same defect --
// but a gate that forbids the malformed box while still allowing `force` leaves the
// tool that hides it in everyone's hands. Matched on POINTER actions only: Node's
// `fs.rmSync(dir, { recursive: true, force: true })` is unrelated and appears in a
// GATE spec today.
const FORCED_POINTER = /\b(click|dblclick|hover|tap|check|uncheck|selectOption|dragTo|setChecked)\s*\([^)]*\bforce\s*:\s*true/gs;

// A root config that declares a directory but not what it runs adopts every spec in it.
// That is the exact defect this card exists to undo, and it existed in TWO configs, so
// spot-fixing the named one would have left the family intact. Any new root config must
// declare a testMatch (or be listed here with a reason).
const CONFIGS_WITHOUT_TESTMATCH_OK = new Set([]);

// Rule 6 (OBRS-1531). `const PORT = process.env['NAME'] ?? '4230'` -- the one shape
// every config in this repo uses to declare a movable port.
const PORT_ENV_DECL = /process\.env\[(['"])([A-Za-z0-9_]+)\1\]\s*\?\?\s*(['"])(\d{2,5})\3/g;

// Sharing that is a decision, not an accident. A var listed here may be read by any
// number of configs, and those configs may share a default port with each other.
const SHARED_PORT_ENV_OK = new Map([
  [
    'E2E_FRONTEND_PORT',
    'the full-local-stack family (local, obrs483, obrs577, obrs732, obrs884, obrs1456). ' +
      'Every one of them talks to a hand-started backend on E2E_BACKEND_PORT, and ' +
      '`environment.e2e.ts` pins `apiUrl` to that one port -- so two of these lanes can ' +
      'never be up at the same time whatever their frontend port says.',
  ],
  ['E2E_BACKEND_PORT', 'same family, same reason: there is one backend to point at.'],
]);

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

// Resolve a match's 1-based line from its INDEX, never by searching for its text. The
// first version did `src.indexOf(hit)`, which always finds the first occurrence of that
// literal -- so the same URL appearing in a header comment and again in a real
// `page.goto()` reported the comment's line, read the comment as context, and let the
// navigation through. Neither direction of that bug is reachable by a test that only
// checks the rule fires.
const lineAt = (src, index) => src.slice(0, index).split('\n').length;

// Blank out comments while preserving every byte position, so `lineAt` still reports the
// real line. Needed by rule 5 and by nothing else: this repo's specs explain themselves at
// length, and `b2c-critical-path.spec.ts` QUOTES the forbidden call in its header ("this
// line was `click({ force: true })`, and it is what made this spec the one red") precisely
// because that is the defect it documents. The first draft of rule 5 flagged that sentence
// and the gate failed on a clean tree -- a rule that reds on a correct file gets deleted,
// not obeyed. A regex cannot do this: it has to track string and template-literal state,
// or it blanks the `//` inside an `https://` URL and the rule stops seeing real code.
function blankComments(src) {
  let out = '';
  let i = 0;
  let quote = null; // "'", '"', '`', or null
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Look backwards from the match to the start of its statement, so a call wrapped across
// lines by the formatter is still seen as a call. Single-line context was the second
// half of the same blind spot.
const statementAround = (src, index) => {
  const start = src.lastIndexOf(';', index);
  return src.slice(start + 1, index + 200);
};

for (const file of specsOnDisk) {
  const src = readFileSync(join(TESTS_DIR, file), 'utf8');
  const entry = declared.get(file);

  for (const m of src.matchAll(SCREENSHOT_PATH)) {
    const value = m[2];
    if (!ALLOWED_EVIDENCE.test(value)) {
      fail(
        `${file}:${lineAt(src, m.index)} writes a screenshot to "${value}". Evidence must ` +
          `land under e2e-evidence/ (gitignored). Two specs used to write to an absolute ` +
          `path inside a DIFFERENT git repository, and a relative '../..' escape reaches ` +
          `the same place while looking portable.`
      );
    }
  }

  for (const m of src.matchAll(ABSOLUTE_PATH)) {
    fail(
      `${file}:${lineAt(src, m.index)} contains an absolute path ${m[0]} -- machine-specific ` +
        `(it embeds one developer's username) and not reproducible on any other checkout.`
    );
  }

  if (entry?.lane === 'GATE') {
    for (const m of blankComments(src).matchAll(FORCED_POINTER)) {
      fail(
        `${file}:${lineAt(src, m.index)} is in the GATE lane and uses \`force: true\` on a ` +
          `pointer action. \`force\` does not aim the event -- it skips the actionability ` +
          `checks and dispatches at the coordinates regardless, so the click lands on ` +
          `whichever element is topmost. That is how OBRS-750 stayed hidden: the event went ` +
          `to the button's own parent for the whole life of the defect. If a click is ` +
          `intercepted, find out by what.`
      );
    }

    for (const m of src.matchAll(HARDCODED_HOST)) {
      // A stub PAYLOAD may legitimately contain a URL (a photo link, a maps link); those
      // are data the app renders, never a request this spec issues. Only flag a literal
      // that appears in a navigation or request call.
      if (/\b(goto|request\.(get|post|put|delete)|fetch)\s*\(\s*$|\b(goto|fetch)\s*\(/.test(
          statementAround(src, m.index))) {
        fail(
          `${file}:${lineAt(src, m.index)} is in the GATE lane but navigates to a hardcoded ` +
            `host ${m[0]}. The gate lane runs with no backend and no fixed port -- use ` +
            `baseURL-relative paths.`
        );
      }
    }
  }
}

// --- Rule 5: no root config may sweep a directory without declaring what it runs ------

for (const file of readdirSync(ROOT)) {
  if (!/^playwright.*\.config\.ts$/.test(file)) continue;
  if (CONFIGS_WITHOUT_TESTMATCH_OK.has(file)) continue;
  const src = readFileSync(join(ROOT, file), 'utf8');
  if (!/\btestMatch\s*:/.test(src)) {
    fail(
      `${file} declares a testDir but no testMatch, so it adopts every spec in that ` +
        `directory -- the exact defect OBRS-602 undid, which existed in two configs at ` +
        `once. Give it a testMatch (deriving from e2e/lanes.json is fine) or delete it.`
    );
  }
}

// --- Rule 6: one lane, one port env var, one default (OBRS-1531) ---------------------

const byEnvVar = new Map(); // VAR -> [{ file, port }]
for (const file of readdirSync(ROOT)) {
  if (!/^playwright.*\.config\.ts$/.test(file)) continue;
  const src = readFileSync(join(ROOT, file), 'utf8');
  for (const m of src.matchAll(PORT_ENV_DECL)) {
    if (!byEnvVar.has(m[2])) byEnvVar.set(m[2], []);
    byEnvVar.get(m[2]).push({ file, port: m[4] });
  }
}

for (const [envVar, uses] of byEnvVar) {
  if (uses.length > 1 && !SHARED_PORT_ENV_OK.has(envVar)) {
    fail(
      `${uses.map((u) => u.file).join(', ')} all read process.env['${envVar}']. Setting it ` +
        `to move one lane off a busy port moves the others too, and reuseExistingServer is ` +
        `on locally, so the one you were not thinking about attaches to somebody else's dev ` +
        `server instead of failing (OBRS-773). Give each lane its own variable, or add ` +
        `'${envVar}' to SHARED_PORT_ENV_OK with the reason the sharing is deliberate.`
    );
  }
}

// A default port is what the lane actually uses, because the documented way to run any
// of these is with no variable set at all.
const byDefaultPort = new Map(); // '4230' -> [{ file, envVar }]
for (const [envVar, uses] of byEnvVar) {
  for (const u of uses) {
    if (!byDefaultPort.has(u.port)) byDefaultPort.set(u.port, []);
    byDefaultPort.get(u.port).push({ file: u.file, envVar });
  }
}

for (const [port, uses] of byDefaultPort) {
  if (uses.length < 2) continue;
  // Two configs may land on one default only through a var that is declared shared --
  // which is the claim that they can never be up together.
  const vars = new Set(uses.map((u) => u.envVar));
  if (vars.size === 1 && SHARED_PORT_ENV_OK.has([...vars][0])) continue;
  fail(
    `${uses.map((u) => `${u.file} (${u.envVar})`).join(', ')} all default to port ${port}. ` +
      `Separate variables do not separate the lanes when both are run the documented way, ` +
      `with neither variable set: the second one to start reuses the first one's server and ` +
      `reports its tree as the result (OBRS-1531). Give one of them a free default.`
  );
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
