#!/usr/bin/env node
/**
 * OBRS-1415 - the translations must never be cacheable without revalidation.
 *
 * The bug this gate stands in front of was found on prod, not here: /i18n/*.json is the
 * only shipped asset that carries WORDS, changes on most deploys, and has a filename that
 * never changes. index.html is no-store and every JS/CSS bundle is hashed, so a returning
 * visitor who holds a stale th.json gets the NEW application reading the OLD translations
 * and the page renders raw i18n keys - which reads like "the translation is missing" and
 * sends the next person hunting for keys that are all present.
 *
 * SIT was measured NOT to have that hole (2026-08-17): Netlify's own default for static
 * files is `public,max-age=0,must-revalidate`, while prod's Caddy sent no Cache-Control at
 * all. So the netlify.toml block this file checks is a PIN, not a repair - and a pin is
 * exactly the kind of thing that gets deleted as redundant by someone who re-measures the
 * default and finds it fine. It is not redundant: Netlify applies every matching header
 * rule, so the day a Cache-Control is added to the `/*` block for the bundle or for a
 * security sweep, it reaches the unhashed translations too and SIT acquires prod's bug.
 *
 * Two things are asserted, and the second is the one with teeth:
 *   1. netlify.toml pins a revalidating Cache-Control for the i18n path.
 *   2. the path it pins is the path the app actually requests. TranslateHttpLoader is
 *      constructed with a prefix in app.module.ts; move the translations to
 *      /assets/i18n/ and rule (1) keeps passing while covering nothing - the same shape
 *      as the OBRS-205 @hashed regex that matched zero files for months while its AC read
 *      as done.
 *
 * MUST-CATCH / MUST-NOT-CATCH run the same predicates over synthetic input at the bottom,
 * so this file cannot pass by being unable to see anything.
 *
 * Exit 0 = pass, 1 = fail. No dependencies, so this runs before `npm ci`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * A Cache-Control value is acceptable only if every use of the stored response has to be
 * revalidated against the origin first. `no-cache` and `no-store` say so outright;
 * `max-age=0` says it only when paired with `must-revalidate`, since a bare max-age=0
 * still permits a stale response to be served under RFC 9111 §4.2.4.
 *
 * @param {string | null} value
 */
function forcesRevalidation(value) {
  if (typeof value !== 'string') return false;
  const directives = value
    .toLowerCase()
    .split(',')
    .map((directive) => directive.trim());
  if (directives.includes('immutable')) return false;
  if (directives.includes('no-store') || directives.includes('no-cache')) return true;
  return directives.includes('max-age=0') && directives.includes('must-revalidate');
}

/**
 * Returns the Cache-Control pinned for the i18n path by netlify.toml, or null if no
 * [[headers]] block covers it. Deliberately literal about the `for` value: this gate is
 * about one known path, and a glob evaluator here would be a second implementation of
 * Netlify's matcher that can disagree with the real one in silence.
 *
 * @param {string} toml
 */
function i18nCacheControl(toml) {
  const blocks = toml.split(/^\s*\[\[headers\]\]\s*$/m).slice(1);
  for (const block of blocks) {
    const forMatch = /^\s*for\s*=\s*"([^"]+)"/m.exec(block);
    if (!forMatch) continue;
    if (!['/i18n/*', '/i18n/*.json'].includes(forMatch[1])) continue;
    const valueMatch = /^\s*Cache-Control\s*=\s*"([^"]+)"/m.exec(block);
    return valueMatch ? valueMatch[1] : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The real files.
// ---------------------------------------------------------------------------
const netlifyToml = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8');
const pinned = i18nCacheControl(netlifyToml);

expect(
  pinned !== null,
  'netlify.toml has no [[headers]] block pinning Cache-Control for the i18n path. Netlify\n' +
    '    currently supplies a revalidating default on its own, so removing this block breaks\n' +
    '    nothing TODAY - it breaks on the unrelated day someone adds a Cache-Control to the\n' +
    '    `/*` block, because every matching rule applies and the unhashed translations would\n' +
    '    inherit it. See OBRS-1415 and deploy/prod/Caddyfile in OBRS-backend, where the same\n' +
    '    invariant had to be repaired rather than pinned.'
);
expect(
  pinned === null || forcesRevalidation(pinned),
  `netlify.toml pins Cache-Control "${pinned}" for the i18n path, which permits the browser to\n` +
    '    reuse a stored translation file without asking. Any non-zero freshness window is a\n' +
    '    window in which a deploy is invisible and the page renders raw i18n keys, because the\n' +
    '    filename never changes and nothing else forces a re-fetch (index.html is no-store, the\n' +
    '    bundles are hashed). Use "no-cache".'
);

// The pin is only worth anything while it covers the path the app asks for.
const appModule = readFileSync(join(repoRoot, 'src', 'app', 'app.module.ts'), 'utf8');
const loader = /new TranslateHttpLoader\(\s*http\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/.exec(appModule);
expect(
  loader !== null,
  'could not find the TranslateHttpLoader construction in src/app/app.module.ts. The header\n' +
    '    rule in netlify.toml is written against the prefix passed there; if that call moved or\n' +
    '    changed shape, re-read it and re-point the rule instead of deleting this assertion.'
);
expect(
  loader === null || loader[1] === '/i18n/',
  `TranslateHttpLoader asks for "${loader?.[1]}", not "/i18n/". netlify.toml pins the header on\n` +
    '    "/i18n/*" and deploy/prod/Caddyfile matches `path /i18n/*.json`; both now cover a\n' +
    '    directory nothing requests, and neither would say so.'
);
expect(
  loader === null || loader[2] === '.json',
  `TranslateHttpLoader asks for the suffix "${loader?.[2]}", not ".json". prod's Caddy matcher is\n` +
    '    `path /i18n/*.json` and would stop matching.'
);

// ---------------------------------------------------------------------------
// MUST-CATCH - the edits that reopen the bug.
// ---------------------------------------------------------------------------
const REAL_BLOCK = '[[headers]]\n  for = "/i18n/*"\n  [headers.values]\n    Cache-Control = "no-cache"\n';

expect(
  i18nCacheControl('[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n') === null,
  'MUST-CATCH: a toml with only the /* block must read as unpinned'
);
expect(
  i18nCacheControl('[[headers]]\n  for = "/i18n/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n') === null,
  'MUST-CATCH: an i18n block that sets some other header must read as unpinned, not as pinned-to-nothing'
);
expect(
  !forcesRevalidation('public, max-age=3600'),
  'MUST-CATCH: an hour of freshness is an hour in which a deploy is invisible'
);
expect(
  !forcesRevalidation('public, max-age=31536000, immutable'),
  'MUST-CATCH: the hashed-asset value applied to a filename that never changes is the worst case'
);
expect(!forcesRevalidation('max-age=0'), 'MUST-CATCH: bare max-age=0 still permits a stale response');
expect(!forcesRevalidation(null), 'MUST-CATCH: no header at all is what prod was serving');

// ---------------------------------------------------------------------------
// MUST-NOT-CATCH - without these the assertions above pass by rejecting everything.
// ---------------------------------------------------------------------------
expect(i18nCacheControl(REAL_BLOCK) === 'no-cache', 'MUST-NOT-CATCH: the shipped block must be found');
expect(forcesRevalidation('no-cache'), 'MUST-NOT-CATCH: no-cache is the value this card chose');
expect(
  forcesRevalidation('public,max-age=0,must-revalidate'),
  "MUST-NOT-CATCH: Netlify's own default, measured on SIT 2026-08-17, must not be rejected - a\n" +
    '    gate that fails the value the platform already sends would be un-satisfiable there'
);
expect(
  i18nCacheControl(`[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Frame-Options = "DENY"\n\n${REAL_BLOCK}`) ===
    'no-cache',
  'MUST-NOT-CATCH: an earlier non-matching block must not hide a later matching one'
);

if (failures.length > 0) {
  console.error(`i18n cache-header gate FAILED (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`i18n cache-header gate OK: netlify.toml pins "${pinned}" for /i18n/*, and the app asks for that path.`);
