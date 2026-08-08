#!/usr/bin/env node
/**
 * OBRS-719 — payment-page script gate (PCI DSS 6.4.3(c) / 11.6.1).
 *
 * 6.4.3 requires a written inventory of every script on the payment page. An inventory
 * that anyone can leave behind by editing one component is not an inventory, so this gate
 * fails the build when the code and scripts/payment-page-script-inventory.json disagree —
 * IN EITHER DIRECTION. A stale entry is not harmless: it is still read as a measurement.
 *
 * The five rules, and the concrete change each one exists to catch:
 *
 *   1. No <script> in src/index.html. That file is loaded on EVERY route, payment
 *      included, and a tag here is a script nobody has to justify per-route. It also
 *      forced `script-src 'unsafe-inline'` into the CSP for years (OBRS-719 AC 3).
 *   2. No <script> in any component template either — same reasoning, less obvious spot.
 *   3. Every file that calls document.createElement('script') is a declared loader, and
 *      every declared loader still calls it. This is the rule that catches "a new
 *      third-party widget was added to a page".
 *   4. A declared loader and its inventory entry name THE SAME SET of https origins,
 *      in both directions. Declared-but-absent catches changing the vendor URL underneath
 *      a justification that no longer describes it. Present-but-undeclared catches the
 *      other half, which OBRS-882 found this rule could not see: `origin` was a single
 *      string, so a loader that pulled a SECOND vendor from the same file satisfied the
 *      rule completely while the second vendor appeared in no inventory and no CSP.
 *      That is the exact shape OBRS-867's analytics loader shipped in (googletagmanager
 *      AND clarity.ms from one file), and it went undetected here.
 *   5. netlify.toml's CSP matches the declared SIT origin set, has no 'unsafe-inline' in
 *      script-src, and still names a report-uri — without which 11.6.1 detection is zero
 *      while the header looks unchanged from the outside.
 *
 * Prod's Caddyfile lives in the other repo and is gated there by
 * CspAllowlistMatchesInventoryTest. Neither gate can see the other's tree; the prose
 * inventory beside the Caddyfile is the seam between them.
 *
 * Rule 6 is NOT a 6.4.3 rule and is deliberately not phrased as one (OBRS-1150).
 * Karma is not a payment page, so its scripts are not compared against the inventory —
 * that would blur what this file is for. What it does compare is angular.json's two
 * scripts[] arrays against EACH OTHER. Rule 3b below reads architect.build.options,
 * because that is what ships; architect.test.options is a second, separate array that
 * until now nothing read at all. OBRS-1135 is the measured case: removing jQuery from
 * `build` alone would have left every job in CI green while Karma went on loading it
 * forever. The suite would then have been asserting against a dependency set the user
 * never receives, which makes a green run a statement about a build nobody ships.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'src');
const INDEX_HTML = join(ROOT, 'src', 'index.html');
const ANGULAR_JSON = join(ROOT, 'angular.json');
const NETLIFY_TOML = join(ROOT, 'netlify.toml');
const INVENTORY = join(ROOT, 'scripts', 'payment-page-script-inventory.json');

// Inventory paths are written with forward slashes; relative() yields backslashes on
// Windows, where half this project's development happens. Normalise rather than compare
// two spellings of the same path and report a phantom drift on one OS only.
const posix = (p) => p.split('\\').join('/');

// -----------------------------------------------------------------------------------
// Rules, as pure functions so the self-test below can drive them on synthetic input.
// -----------------------------------------------------------------------------------

/** A <script> tag, opening only. Matches `<script>` and `<script src=...>`, not `<scriptish>`. */
const SCRIPT_TAG = /<script[\s>]/i;

/** document.createElement('script') in any quoting style, tolerant of whitespace. */
const CREATE_SCRIPT = /createElement\(\s*['"`]script['"`]\s*\)/;

function hasScriptTag(html) {
  // Comments are stripped first so that DOCUMENTING the absence of a script tag - which
  // src/index.html now does at length - does not trip the rule that enforces it.
  return SCRIPT_TAG.test(html.replace(/<!--[\s\S]*?-->/g, ''));
}

function loadsScriptDynamically(source) {
  return CREATE_SCRIPT.test(stripComments(source));
}

/** Line and block comments, so a note about a script loader is not one. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Every distinct `https://host` a file names in live code. Comments are stripped first,
 * for the same reason rule 3 strips them: a file is allowed to DISCUSS a vendor it does
 * not load, and several here do.
 *
 * `https` only, deliberately. The one `http://` literal in this repo's loader files is
 * `http://www.w3.org` — an SVG xmlns, which is an identifier and not a fetchable origin.
 * Widening this to `https?` would turn that into a finding with nothing behind it, and a
 * gate people learn to wave through is worse than no gate (OBRS-750).
 */
function httpsOriginsIn(source) {
  return new Set((stripComments(source).match(/https:\/\/[A-Za-z0-9.*-]+/g) ?? []));
}

/**
 * Do angular.json's two scripts[] arrays say the same thing? (OBRS-1150)
 *
 * ORDER IS PART OF THE ANSWER, not an accident of how this is written. These arrays are
 * a load order: popper defines what bootstrap reads at evaluation time, so the same two
 * entries in the other order is a different program. A rule that sorted before comparing
 * would call that pair equal and would have nothing to say about the one failure mode
 * order can cause.
 *
 * A missing key reads as [], which is the honest reading: `architect.test.options` with
 * no scripts loads no scripts. It is not "unknown", so it is not skipped.
 */
function scriptListsMatch(buildScripts, testScripts) {
  return JSON.stringify(buildScripts ?? []) === JSON.stringify(testScripts ?? []);
}

/**
 * Every source in a CSP that names a remote host. A "source" is any token containing
 * `://`, which drops directive names, keyword sources ('self', 'none', 'unsafe-inline'),
 * scheme sources (data:, blob:) and a relative report-uri path — none of them third
 * parties — with no allow-list of its own to maintain. Same rule as the backend's
 * CspAllowlistMatchesInventoryTest, deliberately.
 */
function originsOf(policy) {
  const origins = new Set();
  for (const directive of policy.split(';')) {
    const tokens = directive.trim().split(/\s+/);
    // report-uri/report-to name OUR OWN collector, not a source the page may load from,
    // and on SIT that value is an absolute cross-origin URL because the app and the API
    // sit on different hosts. Counting it as a third party made the gate demand an
    // inventory entry for our own backend - caught by this gate's first real run, and
    // invisible on prod, where the same directive is a relative path.
    if (tokens[0] === 'report-uri' || tokens[0] === 'report-to') continue;
    for (const token of tokens) {
      if (token.includes('://')) origins.add(token);
    }
  }
  return origins;
}

function directiveOf(policy, name) {
  for (const directive of policy.split(';')) {
    const trimmed = directive.trim();
    if (trimmed === name || trimmed.startsWith(`${name} `)) return trimmed;
  }
  return '';
}

/**
 * Origins reachable only as the TARGET of a redirect from another allowlisted origin.
 *
 * OBRS-888: `c.clarity.ms/c.gif` 302s to `c.bing.com/c.gif`. CSP re-checks every hop of a
 * redirect, so allowing only the first host still blocks the fetch — measured under a real
 * enforcing header, not read off the spec. The reason this needs a GATE rather than a
 * comment is what the violation report says: CSP names the PRE-redirect URL, so a denial
 * at hop 2 arrives as `img-src <- c.clarity.ms`, naming the host that IS allowed, and is
 * byte-identical to a denial at hop 1. Anyone tidying this allowlist against the collector
 * will conclude c.bing.com is unused. It is not unused; it is unreportable.
 *
 * Directional on purpose: source implies target, never the reverse, so dropping the vendor
 * entirely stays a legal edit. Whole-token comparison, so `https://*.clarity.ms` in
 * connect-src is not mistaken for the named beacon host.
 */
const REDIRECT_HOPS = [
  { directive: 'img-src', from: 'https://c.clarity.ms', to: 'https://c.bing.com' },
];

function allowsOrigin(directive, origin) {
  return directive.trim().split(/\s+/).includes(origin);
}

/**
 * Sub-resources a third-party SCRIPT injects into our document under a DIFFERENT directive
 * than the one that allowed the script.
 *
 * OBRS-889: `accounts.google.com` was in script-src, connect-src and frame-src, and the
 * page still failed under an enforcing header — `gsi/client` adds a <link> to
 * `accounts.google.com/gsi/style`, which is governed by style-src, where the host was
 * absent. An origin-level allowlist (the `csp-origins` block, `sitCspOrigins` below) is
 * blind to this by construction: the origin is present and documented, so both inventory
 * gates stay green while the fetch is denied.
 *
 * Directional, like REDIRECT_HOPS: the script host implies the sidecar host, never the
 * reverse, so removing the vendor outright stays a legal edit. Whole-token comparison, so
 * `https://*.google.com` in img-src is not read as the named host.
 */
const SIDECAR_SUBRESOURCES = [
  {
    origin: 'https://accounts.google.com',
    loadedBy: 'script-src',
    needs: 'style-src',
    what: 'gsi/client injects a <link> to accounts.google.com/gsi/style into this document',
  },
];

function orphanedSidecarSubresources(policy) {
  const orphans = [];
  for (const sidecar of SIDECAR_SUBRESOURCES) {
    const loader = directiveOf(policy, sidecar.loadedBy);
    const target = directiveOf(policy, sidecar.needs);
    if (allowsOrigin(loader, sidecar.origin) && !allowsOrigin(target, sidecar.origin)) {
      orphans.push(
        `netlify.toml's ${sidecar.loadedBy} allows ${sidecar.origin} but ${sidecar.needs} does not — ` +
          `${sidecar.what}. The origin being in the allowlist is not the question; the DIRECTIVE is. ` +
          'Measured under an enforcing header in OBRS-889: without this the sheet is dropped with ' +
          'error `csp` and every /login view writes a line into the collector whose documented ' +
          'steady state (PCI DSS 11.6.1) is zero.'
      );
    }
  }
  return orphans;
}

function orphanedRedirectSources(policy) {
  const orphans = [];
  for (const hop of REDIRECT_HOPS) {
    const directive = directiveOf(policy, hop.directive);
    if (allowsOrigin(directive, hop.from) && !allowsOrigin(directive, hop.to)) {
      orphans.push(
        `netlify.toml's ${hop.directive} allows ${hop.from} but not ${hop.to}, which it 302s to. ` +
          'CSP re-checks every redirect hop, so the fetch fails anyway — and the violation report ' +
          `names the PRE-redirect URL (${hop.from}), so draining the collector will never name ` +
          `${hop.to}. Measured under an enforcing header in OBRS-888; do not delete it as unused.`
      );
    }
  }
  return orphans;
}

// -----------------------------------------------------------------------------------
// Self-test — the gate's own must-catch / must-NOT-catch proof, run on every call.
// -----------------------------------------------------------------------------------

const SELF_TEST_CASES = [
  // ---- must catch: exactly what OBRS-719 removed, and the ways it could come back.
  ['html', true, '<script>\n  var s = document.createElement("script");\n</script>'],
  ['html', true, '<script src="https://cdn.example.com/widget.js"></script>'],
  ['html', true, '<SCRIPT SRC="x.js"></SCRIPT>'],
  ['html', true, '<script\n  async\n  src="x.js"></script>'],
  ['ts', true, "const s = document.createElement('script');"],
  ['ts', true, 'const s = document.createElement("script");'],
  ['ts', true, 'const s = document.createElement( `script` );'],
  // ---- must NOT catch: the shapes this repo legitimately contains.
  ['html', false, '<!-- OBRS-719: there is NO <script> tag here, and that is load-bearing. -->'],
  ['html', false, '<app-root></app-root>'],
  ['html', false, '<div class="script-preview">{{ code }}</div>'],
  ['html', false, '<scriptural-quote></scriptural-quote>'],
  ['ts', false, "const s = document.createElement('div');"],
  ['ts', false, "// historic note: this used document.createElement('script') before OBRS-719"],
  ['ts', false, "/* document.createElement('script') is done in login.component.ts */"],
  // ---- CSP parsing: keywords and schemes are not third-party origins.
  ['origins', 0, "default-src 'self'; img-src 'self' data: blob:; object-src 'none'; report-uri /api/csp-report"],
  ['origins', 2, "script-src 'self' https://a.example https://b.example"],
  // An ABSOLUTE report-uri is our own collector, not a script source. SIT has one because
  // the app and the API are on different hosts; the first real run of this gate failed on
  // exactly this, so it is pinned here rather than only fixed.
  ['origins', 0, "default-src 'self'; report-uri https://sit-obrs-backend.koyeb.app/api/csp-report"],
  ['origins', 1, "connect-src https://a.example; report-uri https://b.example/api/csp-report"],
  // ---- rule 4b: the origins a LOADER FILE names. OBRS-882 — the case that shipped is
  // two vendors from one file, so it is pinned first and by exact set, not by count.
  ['srcOrigins', 'https://www.clarity.ms,https://www.googletagmanager.com',
    'a(`https://www.googletagmanager.com/gtag/js?id=${id}`);\nb(`https://www.clarity.ms/tag/${p}`);'],
  ['srcOrigins', 'https://cdn.omise.co', "s.src = 'https://cdn.omise.co/omise.js';"],
  // A vendor named only in a COMMENT is discussed, not loaded. Three files here do this.
  ['srcOrigins', '', "// see https://accounts.google.com/gsi/client, loaded in login.component.ts"],
  ['srcOrigins', '', '/* frame-src covers https://*.omise.co for the 3DS hop */'],
  // An SVG xmlns is an identifier, not an origin — and it is why this is https-only.
  ['srcOrigins', '', 'const NS = "http://www.w3.org/2000/svg";'],
  // A wildcard host is a legitimate thing to name and must round-trip verbatim.
  ['srcOrigins', 'https://*.clarity.ms', "const upload = 'https://*.clarity.ms';"],
  // ---- OBRS-888 redirect pairs. must-catch: the exact edit the gate exists to stop —
  // someone drains the violation log, sees c.bing.com nowhere in it, removes it as unused.
  ['redirect', 1, "img-src 'self' https://c.clarity.ms"],
  // must NOT catch: dropping the vendor outright takes both hosts and is a legal edit;
  // the target alone is odd but is not this rule's business (source implies target, not
  // the reverse); and a wildcard sibling must not be read as the named host, or the gate
  // would demand an image origin inside connect-src, which fetches no images at all.
  ['redirect', 0, "img-src 'self' https://c.clarity.ms https://c.bing.com"],
  ['redirect', 0, "img-src 'self' data: blob:"],
  ['redirect', 0, "img-src 'self' https://c.bing.com"],
  ['redirect', 0, "connect-src 'self' https://*.clarity.ms"],
  // ---- OBRS-889 sidecar sub-resources. must-catch: the policy that shipped for two
  // months — GIS allowed as a script, its stylesheet not allowed as a stylesheet.
  ['sidecar', 1, "script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"],
  // A style-src that is missing altogether falls back to default-src, which is 'self' —
  // still a denial, so still caught rather than skipped for lack of a directive to read.
  ['sidecar', 1, "default-src 'self'; script-src 'self' https://accounts.google.com"],
  // must NOT catch: the fixed policy; dropping Google sign-in entirely (both entries go,
  // and demanding the sidecar back would block that removal); the reverse direction,
  // which is odd but is not this rule's business; and a wildcard that must not be read as
  // the named host — `https://*.google.com` is in img-src for Maps imagery and says
  // nothing about whether the GIS stylesheet may load.
  ['sidecar', 0, "script-src 'self' https://accounts.google.com; style-src 'self' https://accounts.google.com"],
  ['sidecar', 0, "script-src 'self' https://cdn.omise.co; style-src 'self' 'unsafe-inline'"],
  ['sidecar', 0, "script-src 'self'; style-src 'self' https://accounts.google.com"],
  ['sidecar', 1, "script-src 'self' https://accounts.google.com; style-src 'self' https://*.google.com"],
  // ---- rule 6: angular.json's two scripts[] arrays (OBRS-1150). Input is [build, test].
  // must NOT catch: the pair as it stands, and the honest empty case.
  ['scriptsPair', true, [['a.js', 'b.js'], ['a.js', 'b.js']]],
  ['scriptsPair', true, [[], []]],
  ['scriptsPair', true, [[], undefined]],
  // must catch: BOTH halves of the OBRS-1135 near-miss. Removing from build only leaves
  // the extra entry in test; removing from test only leaves it in build. Neither array is
  // privileged here — the rule is that they agree, not that one follows the other.
  ['scriptsPair', false, [['a.js', 'b.js'], ['a.js', 'b.js', 'jquery.min.js']]],
  ['scriptsPair', false, [['a.js', 'b.js', 'jquery.min.js'], ['a.js', 'b.js']]],
  // must catch: same entries, wrong load order. popper before bootstrap is not a style
  // choice, so a rule that sorted first would be blind to the one thing order can break.
  ['scriptsPair', false, [['popper.js', 'bootstrap.js'], ['bootstrap.js', 'popper.js']]],
  // must catch: the whole key deleted while build still ships two scripts. Absent is [],
  // not "unknown" — a skip here would be a green answer to a question never asked.
  ['scriptsPair', false, [['a.js'], undefined]],
];

function runSelfTest() {
  const failures = [];
  for (const [kind, expected, input] of SELF_TEST_CASES) {
    let actual;
    if (kind === 'html') actual = hasScriptTag(input);
    else if (kind === 'ts') actual = loadsScriptDynamically(input);
    else if (kind === 'srcOrigins') actual = [...httpsOriginsIn(input)].sort().join(',');
    else if (kind === 'redirect') actual = orphanedRedirectSources(input).length;
    else if (kind === 'sidecar') actual = orphanedSidecarSubresources(input).length;
    else if (kind === 'scriptsPair') actual = scriptListsMatch(input[0], input[1]);
    else actual = originsOf(input).size;

    if (actual !== expected) {
      failures.push(
        `  [${kind}] expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} for: ${input.replace(/\n/g, '\\n')}`
      );
    }
  }
  if (failures.length > 0) {
    console.error('::error::payment-page script gate SELF-TEST FAILED — the gate itself is wrong, findings below cannot be trusted:');
    for (const f of failures) console.error(f);
    process.exit(1);
  }
}

runSelfTest();

// -----------------------------------------------------------------------------------
// The real scan.
// -----------------------------------------------------------------------------------

const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
const problems = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(SRC_DIR);
const templates = allFiles.filter((f) => f.endsWith('.html'));
const tsFiles = allFiles.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'));

// --- 1 + 2. No <script> tag anywhere the app serves.
if (hasScriptTag(readFileSync(INDEX_HTML, 'utf8'))) {
  problems.push(
    'src/index.html contains a <script> tag. It is loaded on EVERY route including /payment, ' +
      'so a script here is one PCI DSS 6.4.3 makes us justify per-route and cannot. Load it from ' +
      'the component that needs it, the way login.component.ts loads gsi/client.'
  );
}
for (const template of templates) {
  if (template === INDEX_HTML) continue;
  if (hasScriptTag(readFileSync(template, 'utf8'))) {
    problems.push(`${posix(relative(ROOT, template))} contains a <script> tag — same rule as index.html.`);
  }
}

// --- 3 + 4. Dynamic loaders match the inventory, both directions.
const declared = new Map(inventory.scriptLoaders.map((l) => [posix(l.file), l]));

const foundLoaders = new Set();
for (const file of tsFiles) {
  const rel = posix(relative(ROOT, file));
  if (!loadsScriptDynamically(readFileSync(file, 'utf8'))) continue;
  foundLoaders.add(rel);

  const entry = declared.get(rel);
  if (!entry) {
    problems.push(
      `${rel} loads a script at runtime but is not in scripts/payment-page-script-inventory.json. ` +
        'Add it with its origin, the routes it runs on, and WHY the third party is needed — that ' +
        'justification is the actual 6.4.3(c) requirement, not the file list.'
    );
    continue;
  }
  const source = readFileSync(file, 'utf8');
  const inSource = httpsOriginsIn(source);
  const inEntry = new Set(entry.origins);

  for (const origin of [...inEntry].sort()) {
    if (!inSource.has(origin)) {
      problems.push(
        `${rel} is inventoried as loading ${origin}, but that origin does not appear in the file. ` +
          'Either the vendor URL changed under a justification that no longer describes it, or the ' +
          'inventory entry is stale.'
      );
    }
  }
  for (const origin of [...inSource].sort()) {
    if (!inEntry.has(origin)) {
      problems.push(
        `${rel} names ${origin} but the inventory does not list it among that file's origins. ` +
          'A loader may pull from more than one vendor, and each one needs its own written ' +
          'justification (PCI DSS 6.4.3(c)) and its own CSP entry — the second vendor is the one ' +
          'that gets forgotten (OBRS-882).'
      );
    }
  }
}
for (const [rel] of declared) {
  if (!foundLoaders.has(rel)) {
    problems.push(
      `scripts/payment-page-script-inventory.json lists ${rel} as a script loader, but it no longer ` +
        'loads one. Remove the entry — an inventory describing scripts nobody loads is still read as ' +
        'a measurement.'
    );
  }
}

// --- 3b. The bundled scripts angular.json injects into every page.
const angularJson = JSON.parse(readFileSync(ANGULAR_JSON, 'utf8'));
const buildOptions = angularJson.projects.OBRS.architect.build.options;
const bundled = buildOptions.scripts ?? [];

// --- 3c. Angular's own injected markup, which is a script source we do not write.
// Measured on the emitted dist/index.html, not reasoned about: with `inlineCritical`
// on, the build rewrites the stylesheet link to
//   <link rel="stylesheet" href="styles-*.css" media="print" onload="this.media='all'">
// An inline event handler is blocked by `script-src` exactly like an inline block once
// 'unsafe-inline' is gone — so the handler would never fire, media would stay "print",
// and the app would ship UNSTYLED. Report-Only hides this completely; it would have
// surfaced for the first time at the enforce flip, on the checkout page.
if (buildOptions.optimization?.styles?.inlineCritical !== false) {
  problems.push(
    "angular.json must set optimization.styles.inlineCritical: false. With it on, the build " +
      'rewrites the stylesheet <link> to use an inline onload handler, which a script-src ' +
      "without 'unsafe-inline' blocks — the stylesheet then never loads and the app renders " +
      'unstyled. Report-Only will not show you this; enforcing would (OBRS-719).'
  );
}
const bundledExpected = inventory.bundledScripts;
if (JSON.stringify(bundled) !== JSON.stringify(bundledExpected)) {
  problems.push(
    "angular.json's build scripts[] differs from the inventory's bundledScripts.\n" +
      `      angular.json: ${JSON.stringify(bundled)}\n` +
      `      inventory:    ${JSON.stringify(bundledExpected)}\n` +
      '      Every entry here is injected into EVERY page, payment included.'
  );
}

// --- 6. angular.json's SECOND scripts[] — the one Karma loads (OBRS-1150).
// Not a PCI rule: Karma is not a payment page, so this compares the two arrays to each
// OTHER rather than either of them to the inventory. Everything above reads
// architect.build.options, which is what ships; nothing read architect.test.options at
// all until this rule, and `architect` appeared exactly once in this repo's own code as
// a result. Equality is the invariant that actually holds today, so it is the one worth
// asserting — a test-only script would be a deliberate act, and this is where the
// exception would be written down rather than discovered later by someone reading a diff.
const testScripts = angularJson.projects.OBRS.architect.test?.options?.scripts ?? [];
if (!scriptListsMatch(bundled, testScripts)) {
  problems.push(
    "angular.json's test scripts[] does not match its build scripts[].\n" +
      `      architect.build.options.scripts: ${JSON.stringify(bundled)}\n` +
      `      architect.test.options.scripts:  ${JSON.stringify(testScripts)}\n` +
      '      These are two separate arrays and editing one does not touch the other, so a\n' +
      '      half-finished edit leaves Karma running against a dependency set the user never\n' +
      '      receives — a green suite then describes a build nobody ships. OBRS-1135 is the\n' +
      '      real case: dropping jQuery from build alone kept every CI job green while Karma\n' +
      '      would have loaded it forever. If Karma genuinely needs a script the app does not,\n' +
      '      change this rule and say why here; do not silently let the arrays diverge.'
  );
}

// --- 5. The SIT policy netlify.toml actually serves.
const netlify = readFileSync(NETLIFY_TOML, 'utf8');
const cspMatch = netlify.match(/Content-Security-Policy-Report-Only\s*=\s*"([^"]*)"/);
if (!cspMatch) {
  problems.push(
    'netlify.toml no longer serves a Content-Security-Policy-Report-Only header. SIT is the only ' +
      'place this policy is exercised by a real browser today — prod carries the header but the app ' +
      'is not published there yet (OBRS-205).'
  );
} else {
  const policy = cspMatch[1];
  const inPolicy = originsOf(policy);
  const inInventory = new Set(inventory.sitCspOrigins);

  const undocumented = [...inPolicy].filter((o) => !inInventory.has(o)).sort();
  const stale = [...inInventory].filter((o) => !inPolicy.has(o)).sort();
  if (undocumented.length > 0) {
    problems.push(`netlify.toml CSP allows origins absent from the inventory: ${undocumented.join(', ')}`);
  }
  if (stale.length > 0) {
    problems.push(`Inventory lists sitCspOrigins the netlify.toml CSP no longer allows: ${stale.join(', ')}`);
  }

  const scriptSrc = directiveOf(policy, 'script-src');
  if (scriptSrc.includes("'unsafe-inline'") || scriptSrc.includes("'unsafe-eval'")) {
    problems.push(
      "netlify.toml's script-src regained 'unsafe-inline'/'unsafe-eval'. It came out when index.html's " +
        'inline Google Identity bootstrap moved into login.component.ts; if an inline block is genuinely ' +
        'needed again, add a BUILD-TIME hash step — a hand-copied hash silently breaks login the next ' +
        'time the block is edited.'
    );
  }
  for (const orphan of orphanedRedirectSources(policy)) {
    problems.push(orphan);
  }
  for (const orphan of orphanedSidecarSubresources(policy)) {
    problems.push(orphan);
  }
  if (!directiveOf(policy, 'report-uri').includes('/api/csp-report')) {
    problems.push(
      "netlify.toml's CSP lost its report-uri. Violations then land only in the DevTools console of a " +
        'customer\'s browser, which nobody here can read — PCI DSS 11.6.1 detection goes to zero while ' +
        'the header looks unchanged.'
    );
  }
}

// --- Non-vacuity. Counted POSITIVELY: "no problems found" is also what a gate that
// scanned an empty directory reports, and that is the failure mode worth guarding.
if (templates.length === 0 || tsFiles.length === 0 || foundLoaders.size === 0) {
  console.error(
    `::error::payment-page script gate FOUND NOTHING TO CHECK (${templates.length} template(s), ` +
      `${tsFiles.length} .ts file(s), ${foundLoaders.size} script loader(s)) — the gate is a no-op, ` +
      'which is worse than a failure. Check the paths (OBRS-719).'
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`payment-page script gate FAILED (${problems.length} finding(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '::error::The scripts on the payment page and the written inventory have drifted apart. PCI DSS ' +
      '6.4.3(c) requires an inventory of every script on that page WITH a justification for each, and ' +
      '11.6.1 requires that unauthorised changes to those scripts be detected — an inventory that ' +
      'silently goes stale satisfies neither. Update scripts/payment-page-script-inventory.json and ' +
      'the prose document it points at (OBRS-719).'
  );
  process.exit(1);
}

console.log(
  `payment-page script gate OK: ${SELF_TEST_CASES.length} self-test case(s) passed, then ` +
    `${templates.length} template(s), ${tsFiles.length} .ts file(s), ${foundLoaders.size} declared ` +
    `script loader(s) and ${inventory.sitCspOrigins.length} CSP origin(s) checked against the inventory.`
);
