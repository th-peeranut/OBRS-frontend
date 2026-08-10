#!/usr/bin/env node
/**
 * OBRS-911 - self-test for scripts/netlify-ignore.mjs, the command that decides whether a
 * push to the production branch skips its Netlify build.
 *
 * Why a gate and not "we ran it once". A wrong SKIP produces no build log, no failed
 * check and no red anything: `sit` simply keeps serving the previous bundle while the push
 * reads as deployed. The only place that mistake can be caught is here, before it ships.
 *
 * Three of the assertions below are not about the decision function at all - they pin
 * facts OUTSIDE it that the decision quietly depends on:
 *
 *   - `tsconfig.app.json` must still compile `src/main.ts` plus `.d.ts` only, because that
 *     is what makes `src/**\/*.spec.ts` provably not a build input.
 *   - `netlify.toml`'s `[build] command` must stay byte-identical (AC8). The value in the
 *     Netlify UI is DIFFERENT and does not run scripts/inject-sit-env.js, so if the key is
 *     ever dropped the site falls back to a command that fails - on the NEXT build, not on
 *     the edit that caused it.
 *   - netlify-ignore.mjs must name `CACHED_COMMIT_REF` and must never reach for `HEAD~1`.
 *
 * Exit 0 = pass, 1 = fail. No dependencies, so this runs before `npm ci`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classify, decide, resolveRange } from './netlify-ignore.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

/** @param {string[]} paths */
function expectBuild(paths, why) {
  const verdict = decide(paths);
  expect(
    verdict.build,
    `expected BUILD for [${paths.join(', ')}] (${why}) but the decision was SKIP: ${verdict.reason}`
  );
}

/** @param {string[]} paths */
function expectSkip(paths, why) {
  const verdict = decide(paths);
  expect(
    !verdict.build,
    `expected SKIP for [${paths.join(', ')}] (${why}) but the decision was BUILD: ${verdict.reasons.join('; ')}`
  );
}

// ---------------------------------------------------------------------------
// AC3 - deny by default. Anything not named as inert must build.
// ---------------------------------------------------------------------------
expectBuild(['newdir/foo.ts'], 'a top-level directory nobody has classified yet');
expectBuild(['newdir/README.txt'], 'unknown directory, unknown extension');
expectBuild(['.editorconfig'], 'an unclassified root file');
expectBuild(['netlify.toml'], 'the build config itself - a CSP edit that never deploys is worse than a wasted build');
expectBuild(['package.json'], 'build scripts and pre-hooks live here');
expectBuild(['package-lock.json'], 'the exact dependency tree the bundle is built from');
expectBuild(['.nvmrc'], 'pins the Node version the build compiles under (OBRS-528)');
expectBuild(['angular.json'], 'the build configuration `--configuration sit` resolves against');
expectBuild(['tsconfig.json'], 'compiler options');
expectBuild(['tsconfig.app.json'], 'the application program definition');
expectBuild(['tsconfig.spec.json'], 'tsconfig* is build input as a family, no per-file judgement');
expectBuild(['scripts/inject-sit-env.js'], 'named directly in the netlify.toml build command');
expectBuild(['scripts/check-local-env.mjs'], 'runs as the `prebuild` hook, so it can fail the build');
expectBuild(['src/index.html'], 'the document the bundle is injected into');
expectBuild(['public/i18n/th.json'], 'shipped assets - i18n lives here');
expectBuild(['src/app/app.component.ts'], 'application source');
expectBuild(
  ['docs/prod/LANE-BRIEFS.md', 'src/app/app.component.ts'],
  'a mixed push - one build input is enough to build the whole thing'
);

// ---------------------------------------------------------------------------
// AC4 - the diff range spans several commits and the code file is NOT the last one.
// The decision function sees the whole range at once, which is the entire point of
// diffing against CACHED_COMMIT_REF instead of HEAD~1.
// ---------------------------------------------------------------------------
expectBuild(
  ['src/app/services/booking/booking.service.ts', 'docs/adr/0035-promote.md', 'README.md'],
  'code changed earlier in the range while the last commit only touched prose'
);

// ---------------------------------------------------------------------------
// AC5 - fail towards building.
// ---------------------------------------------------------------------------
expectBuild([], 'an empty change list cannot be told apart from a diff that failed');
expect(!resolveRange({}).ok, 'no env at all must not resolve to a range');
expect(
  !resolveRange({ CACHED_COMMIT_REF: '', COMMIT_REF: 'abc123' }).ok,
  'an empty CACHED_COMMIT_REF (first build, cleared cache, force push) must not resolve'
);
expect(
  !resolveRange({ CACHED_COMMIT_REF: 'abc123', COMMIT_REF: '' }).ok,
  'an empty COMMIT_REF must not resolve'
);
expect(
  resolveRange({ CACHED_COMMIT_REF: 'abc123', COMMIT_REF: 'def456' }).ok,
  'two real refs must resolve, otherwise nothing is ever skipped and this file is theatre'
);

// ---------------------------------------------------------------------------
// The other direction. Without these, every assertion above passes trivially by
// building everything, and the card would ship a no-op.
// ---------------------------------------------------------------------------
expectSkip(['docs/prod/LANE-BRIEFS.md'], 'documentation');
expectSkip(['README.md', 'AGENT_MEMORY.md'], 'root prose');
expectSkip(
  ['e2e/tests/obrs-874-analytics-consent-withdraw.spec.ts', 'e2e/fixtures/seed.sql'],
  'e2e runs against a deployed site, it is never compiled into one'
);
expectSkip(['.github/workflows/ci.yml'], 'GitHub Actions and Netlify are different machines');
expectSkip(['playwright.obrs867.config.ts'], 'a harness config at the root, not referenced by angular.json');
expectSkip(
  ['src/app/shared/lib/return-date.spec.ts'],
  'a unit spec - not in the tsconfig.app.json program (pinned below)'
);
expectSkip(
  ['e2e/lanes.json', 'docs/design-system.md', 'src/app/shared/lib/return-date.spec.ts'],
  'the shape of a real promote that changes nothing a visitor can load'
);

// A path that is inert must not become inert for the wrong reason.
expect(
  classify('src/app/x.md').verdict === 'build',
  'markdown under src/ must build - the markdown rule must sit BEHIND the build-input rules'
);
expect(
  classify('docs/x.ts').verdict === 'inert',
  'a .ts file under docs/ is still docs - the inert-directory rule is about location, not extension'
);

// ---------------------------------------------------------------------------
// Pinning the facts the decision depends on but does not contain.
// ---------------------------------------------------------------------------
// Comments are stripped LINE-WISE, not with a `/\*[\s\S]*?\*\//` sweep: the values in this
// file are globs like "src/**/*.d.ts" that contain `/*` and `*/` themselves, and the sweep
// silently rewrote them to "src*.d.ts" - which still passed the assertion below, for the
// wrong reason. Only lines that are ENTIRELY a comment are removed.
const appTsconfig = JSON.parse(
  readFileSync(join(repoRoot, 'tsconfig.app.json'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\*.*\*\/|\/\/)/.test(line))
    .join('\n')
);
expect(
  JSON.stringify(appTsconfig.files) === JSON.stringify(['src/main.ts']),
  `tsconfig.app.json "files" is ${JSON.stringify(appTsconfig.files)}, expected ["src/main.ts"]. ` +
    `netlify-ignore.mjs treats src/**/*.spec.ts as inert BECAUSE the application program is this ` +
    `narrow. Widen it and that carve-out becomes wrong - remove the carve-out or restore the shape.`
);
expect(
  Array.isArray(appTsconfig.include) && appTsconfig.include.every((entry) => entry.endsWith('.d.ts')),
  `tsconfig.app.json "include" is ${JSON.stringify(appTsconfig.include)}; it must stay declaration-only ` +
    `for the same reason as the "files" assertion above.`
);

const netlifyToml = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8');
const EXPECTED_BUILD_COMMAND = 'node scripts/inject-sit-env.js && npm run build -- --configuration sit';
expect(
  netlifyToml.includes(`  command = "${EXPECTED_BUILD_COMMAND}"`),
  `netlify.toml [build].command is not the expected string. It must stay exactly:\n` +
    `  command = "${EXPECTED_BUILD_COMMAND}"\n` +
    `The Netlify UI holds a DIFFERENT command (npm run build:sit) which never runs ` +
    `scripts/inject-sit-env.js, so the gitignored environment.local.ts is never generated and the ` +
    `prebuild:sit --require-local check fails. Drop the key here and the site silently falls back to ` +
    `that one - failing on the NEXT build, not on the edit that caused it.`
);
expect(
  /^\s*ignore\s*=\s*"node scripts\/netlify-ignore\.mjs"\s*$/m.test(netlifyToml),
  'netlify.toml must wire the ignore command, otherwise this whole file grades an essay nobody reads'
);

// Trap 1, pinned twice: once behaviourally, once at the call site. A blanket grep for
// "HEAD~1" is not used on purpose - the file DISCUSSES HEAD~1 at length in the comment
// that explains why it must not be used, and a gate that forbids naming the mistake would
// be paid for by deleting the explanation.
const resolved = resolveRange({ CACHED_COMMIT_REF: 'aaaaaaa', COMMIT_REF: 'bbbbbbb' });
expect(
  resolved.ok && resolved.base === 'aaaaaaa' && resolved.head === 'bbbbbbb',
  'the diff base must come from CACHED_COMMIT_REF (the last commit Netlify built successfully) ' +
    'and the head from COMMIT_REF. A base of HEAD~1 would see only the final commit of a push, so ' +
    'a push whose code landed in an EARLIER commit would be skipped and sit would serve a stale bundle.'
);

const ignoreSource = readFileSync(join(repoRoot, 'scripts', 'netlify-ignore.mjs'), 'utf8');
expect(
  /\['diff',\s*'--name-only',\s*'-z',\s*range\.base,\s*range\.head\]/.test(ignoreSource),
  'the git diff must be run over range.base..range.head, i.e. over the refs resolveRange returned. ' +
    'If the argument list stops matching, the assertion above is testing a function the command no ' +
    'longer uses.'
);

if (failures.length > 0) {
  console.error(`netlify ignore-command gate FAILED (${failures.length}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('netlify ignore-command gate OK: deny-by-default, fail-safe to build, and both pins hold.');
