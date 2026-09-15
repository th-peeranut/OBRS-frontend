#!/usr/bin/env node
/**
 * OBRS-1075 - generates the gitignored src/environments/build-info.ts that stamps the
 * FE bundle with the git tag it was built from (`appVersion`) and the short commit sha
 * (`buildSha`). See docs/adr/0046-build-identity-stamping.md for the full design.
 *
 * RESOLVE ORDER, NO FALLBACK (AC-6, business rule #3):
 *   1. buildSha  <- process.env.COMMIT_REF (Netlify) sliced to 7 chars, else
 *                   `git rev-parse --short=7 HEAD`.
 *   2. appVersion <- `git describe --tags --match v* --abbrev=0`, SELF-HEALING once if that
 *      finds nothing (see "SHALLOW CLONES" below) before giving up.
 *   3. Either step throwing/empty => exit(1) and NO file is written. Never 'unknown',
 *      never '', never '0.0.0', never 'dev' - a silently-wrong build identity defeats the
 *      entire point of the feature (a usability report tagged with a fake version cannot be
 *      traced back to the build that produced the bug).
 *
 * SHALLOW CLONES (OBRS-1075, measured on CI job 104298772230, "Build Smoke Check (AOT +
 * budgets)", red in 20s): `actions/checkout@v4` defaults to `fetch-depth: 1` and does NOT
 * fetch tags, so a repo with a real `v*` tag reachable from origin still describes as
 * having none - `git describe` sees only the one commit it was given. Netlify's clone is
 * shaped the same way (scripts/netlify-ignore.mjs already documents non-shallow history but
 * a SEPARATE tag fetch), so an unpatched generator would have failed the SIT deploy too,
 * not just this CI job - worse than a red check, because nobody would see it until the
 * deploy itself broke. `--depth 1 --no-tags` was measured locally to reproduce the exact
 * CI failure (`fatal: No names found, cannot describe anything.`), and `git fetch --tags`
 * ALONE does not fix it either: the tag ref arrives but the shallow history still does not
 * reach the commit it points at, so `describe` fails again with a DIFFERENT message
 * (`fatal: No tags can describe '<sha>'`). Only `git fetch --unshallow --tags` (on an
 * already-shallow repo; plain `git fetch --tags` on a non-shallow one) was measured to
 * work. A fallback version string was rejected on purpose (AC-6) - self-healing the CLONE
 * instead of faking the VALUE keeps the no-fallback contract intact: if the repo genuinely
 * has no `v*` tag reachable even after fetching, this still exits 1 with nothing written.
 *
 * WHY rmSync(OUT) HAPPENS FIRST, BEFORE EITHER RESOLVE STEP (scrutinize 2026-09-15):
 * build-info.ts is gitignored, so `git checkout`/`git pull` never removes a stale one left
 * over from an earlier successful run. Every npm-script lane (build/test/e2e/start/deploy)
 * is already safe because its `pre*` hook's own non-zero exit stops npm from running the
 * main script - but several playwright.*.config.ts webServer entries call `npx ng serve`/
 * `npx ng test` directly, which skips npm hooks entirely. Without the upfront delete, a
 * generator failure on THOSE lanes would silently compile against last run's values with no
 * error at all. Deleting first turns every bypass lane into a loud
 * `TS2307: Cannot find module './build-info'` instead - see
 * scripts/check-inject-build-info.mjs case 4 for the proof.
 *
 * WHY THE NPM PRE-HOOK, NOT netlify.toml: scripts/check-netlify-ignore.mjs asserts
 * netlify.toml's `[build].command` byte-identical to the value the Netlify UI already holds
 * a DIFFERENT string for, so this generator must run from somewhere `npm run build` already
 * reaches on every lane - the pre-hooks in package.json.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'src', 'environments', 'build-info.ts');

/** @param {NodeJS.ProcessEnv} env @param {string} cwd @returns {string} */
export function resolveBuildSha(env, cwd) {
  if (env.COMMIT_REF) {
    const ref = env.COMMIT_REF.trim();
    if (!ref) throw new Error('COMMIT_REF is set but empty');
    return ref.slice(0, 7);
  }
  const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  if (!sha) throw new Error('git rev-parse --short=7 HEAD returned empty output');
  return sha;
}

/**
 * `git describe --tags --match v* --abbrev=0`, returning the tag or `null` if none is
 * found (never throws) - the caller decides whether that is fatal or a cue to self-heal.
 * @param {string} cwd @returns {string | null}
 */
function tryDescribeTag(cwd) {
  try {
    const tag = execFileSync(
      'git',
      ['describe', '--tags', '--match', 'v*', '--abbrev=0'],
      { cwd, encoding: 'utf8' },
    ).trim();
    return tag || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} cwd @returns {string}
 */
export function resolveAppVersion(cwd) {
  const first = tryDescribeTag(cwd);
  if (first) return first;

  // Self-heal, once, before giving up - see the "SHALLOW CLONES" note at the top of this
  // file. Logged so the remedy is visible in the CI/Netlify build log, not a silent branch.
  console.log(
    "inject-build-info: no `v*` tag found locally (shallow clone?) - fetching tags once before giving up",
  );
  try {
    const isShallow =
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd, encoding: 'utf8' }).trim() === 'true';
    const fetchArgs = isShallow ? ['fetch', '--unshallow', '--tags', '--quiet'] : ['fetch', '--tags', '--quiet'];
    execFileSync('git', fetchArgs, { cwd, encoding: 'utf8' });
  } catch (err) {
    throw new Error(`no \`v*\` tag found, and the self-heal fetch failed too: ${err.message}`);
  }

  const second = tryDescribeTag(cwd);
  if (second) return second;

  throw new Error(
    'no `v*` tag reachable even after `git fetch --tags` - the clone has no tag and fetching ' +
      'did not add one. Check the repo actually has a `v*` tag reachable from this commit.',
  );
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 * @param {string} out
 * @returns {{ appVersion: string, buildSha: string }}
 */
export function generate(env, cwd, out) {
  rmSync(out, { force: true });
  const buildSha = resolveBuildSha(env, cwd);
  const appVersion = resolveAppVersion(cwd);
  const content =
    `// AUTO-GENERATED by scripts/inject-build-info.mjs - do not edit, do not commit (gitignored).\n` +
    `export const buildInfo = { appVersion: ${JSON.stringify(appVersion)}, buildSha: ${JSON.stringify(buildSha)} };\n`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
  return { appVersion, buildSha };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const { appVersion, buildSha } = generate(process.env, process.cwd(), OUT);
    console.log(`build-info.ts written - appVersion=${appVersion} buildSha=${buildSha}`);
  } catch (err) {
    console.error(`inject-build-info FAILED: ${err.message}`);
    console.error(
      'No fallback by design (AC-6) - see docs/adr/0046-build-identity-stamping.md. ' +
        'Fix COMMIT_REF / git tags and retry.',
    );
    process.exit(1);
  }
}
