#!/usr/bin/env node
/**
 * OBRS-911 - the Netlify `ignore` command for this site.
 *
 * WHAT NETLIFY DOES WITH THE EXIT CODE, stated first because backwards is the expensive
 * direction:
 *
 *   exit 0      => Netlify CANCELS this build  ("ignore it")
 *   exit non-0  => Netlify BUILDS
 *
 * That is the same polarity as Netlify's own default (`git diff --quiet ...`), which exits
 * 0 when nothing changed. A bug that flips it does not fail loudly: it publishes nothing
 * and `sit` keeps serving the previous bundle while every push reads as "deployed".
 *
 * WHY THIS FILE EXISTS. Netlify bills only the SUCCESSFUL PRODUCTION DEPLOY, and the
 * production branch of this site is `sit`. Every push that lands on `sit` therefore pays
 * the same price whether it changed a bundle byte or a paragraph of prose - measured on
 * the 2026-08-10 billing page, 195 credits for 13 production deploys, i.e. 15.0 credits
 * each. Several promotes in this repo's history moved nothing but `e2e/`, `docs/` and
 * `*.spec.ts`; those paid full price for a byte-identical artifact.
 *
 * THREE RULES THIS FILE IS BUILT AROUND. Each is a trap that was walked into or nearly
 * walked into while the card was being written, so they are stated where the code is.
 *
 * 1. The diff base is `CACHED_COMMIT_REF`, NEVER `HEAD~1`. One push carries many commits.
 *    On a fast-forward of three commits, `HEAD~1` sees only the last one - so a push whose
 *    LAST commit is docs but whose earlier commits are code would be skipped, and `sit`
 *    would silently serve the old bundle. `CACHED_COMMIT_REF` is the commit Netlify last
 *    built successfully, so the range also covers every push that this file skipped
 *    earlier. The skips compose; `HEAD~1` does not.
 *
 * 2. DENY BY DEFAULT. A path is inert only if a rule below says so by name. The inverse
 *    shape ("build everything except docs and markdown") goes silently wrong the day
 *    somebody adds a new top-level directory: it would be treated as inert without anyone
 *    deciding that. Anything unrecognised builds.
 *
 * 3. FAIL TOWARDS BUILDING. No cached ref, an unreadable ref, a git error, an empty file
 *    list - all of them build. The cost of a needless build is 15 credits and is visible
 *    on a billing page. The cost of a wrong skip is a production branch serving a stale
 *    bundle with no build log anywhere to explain it.
 *
 * The `ignore` command runs BEFORE `npm ci`, so this file must stay dependency-free.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Everything under these directories is read by the build. */
export const BUILD_INPUT_PREFIXES = ['src/', 'public/', 'scripts/'];

/**
 * Root files that are build inputs. `netlify.toml` is in here for a reason that is worth
 * more than the credits: OBRS-888 could only find the missing CSP hosts because a
 * PUBLISHED SIT reported them, so a CSP edit that never deploys is a worse failure than a
 * build that was not needed. `.nvmrc` pins the Node version (OBRS-528) and changing it
 * changes the compiler, not just a number.
 */
export const BUILD_INPUT_FILES = [
  'netlify.toml',
  'package.json',
  'package-lock.json',
  '.nvmrc',
  'angular.json',
];

/** `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json` - all of them build. */
const BUILD_INPUT_TSCONFIG = /^tsconfig[^/]*\.json$/;

/**
 * Directories no build step reads. `.github/` is here because GitHub Actions and Netlify
 * are different machines: changing CI cannot change a bundle. `e2e/` runs against an
 * already-deployed site and is never compiled into one.
 */
export const INERT_PREFIXES = [
  'docs/',
  'e2e/',
  '.github/',
  '.claude/',
  '.codex/',
  '.vscode/',
  'playwright-report/',
];

/**
 * Unit specs are the one carve-out INSIDE a build-input directory, and it is a carve-out
 * that can be proven rather than assumed: `tsconfig.app.json` compiles a `files` list of
 * exactly `src/main.ts` plus `src/**\/*.d.ts`, so a `.spec.ts` is not in the application
 * program at all - not excluded from it, never in it. check-netlify-ignore.mjs asserts
 * that tsconfig shape on every CI run, so widening it fails the gate instead of quietly
 * making this rule wrong.
 */
const INERT_UNIT_SPEC = /^src\/.*\.spec\.ts$/;

/** Playwright harness configs at the repo root. Never referenced by angular.json. */
const INERT_PLAYWRIGHT_CONFIG = /^playwright[^/]*\.config\.ts$/;

/** Prose. Reached only after the build-input rules above, so `src/**\/*.md` still builds. */
const INERT_MARKDOWN = /\.md$/;

/**
 * @param {string} rawPath a repo-relative path as git prints it
 * @returns {{ verdict: 'build' | 'inert', rule: string }}
 */
export function classify(rawPath) {
  const path = rawPath.replace(/\\/g, '/');

  // Ordered before the src/ rule on purpose - this is the carve-out.
  if (INERT_UNIT_SPEC.test(path)) {
    return { verdict: 'inert', rule: 'unit spec (not in the tsconfig.app.json program)' };
  }

  for (const prefix of BUILD_INPUT_PREFIXES) {
    if (path.startsWith(prefix)) {
      return { verdict: 'build', rule: `build input directory ${prefix}` };
    }
  }
  if (BUILD_INPUT_FILES.includes(path) || BUILD_INPUT_TSCONFIG.test(path)) {
    return { verdict: 'build', rule: 'build input file' };
  }

  for (const prefix of INERT_PREFIXES) {
    if (path.startsWith(prefix)) {
      return { verdict: 'inert', rule: `inert directory ${prefix}` };
    }
  }
  if (INERT_PLAYWRIGHT_CONFIG.test(path)) {
    return { verdict: 'inert', rule: 'playwright harness config' };
  }
  if (INERT_MARKDOWN.test(path)) {
    return { verdict: 'inert', rule: 'markdown' };
  }

  return { verdict: 'build', rule: 'unrecognised path (deny by default)' };
}

/**
 * @param {string[]} paths every path changed across the whole diff range
 * @returns {{ build: boolean, reason: string, reasons: string[] }}
 */
export function decide(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    // An empty list is ambiguous: "this commit changed nothing" and "the diff produced
    // nothing because something upstream went wrong" look identical from here. Rule 3.
    return { build: true, reason: 'the changed-file list is empty', reasons: [] };
  }

  const reasons = [];
  for (const path of paths) {
    const { verdict, rule } = classify(path);
    if (verdict === 'build') {
      reasons.push(`${path} -> ${rule}`);
    }
  }

  return reasons.length > 0
    ? { build: true, reason: `${reasons.length} of ${paths.length} changed path(s) reach the build`, reasons }
    : { build: false, reason: `all ${paths.length} changed path(s) are inert`, reasons };
}

/**
 * The two refs Netlify hands the ignore command. Split out from main() so the fail-safe
 * can be tested without a repository.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, base: string, head: string } | { ok: false, reason: string }}
 */
export function resolveRange(env) {
  const base = (env.CACHED_COMMIT_REF ?? '').trim();
  const head = (env.COMMIT_REF ?? env.HEAD ?? '').trim();
  if (!base) {
    // First build of the site, a cleared cache, or a force push. There is no previous
    // successful build to diff against, so there is nothing to be confident about.
    return { ok: false, reason: 'CACHED_COMMIT_REF is empty - no previously built commit to diff against' };
  }
  if (!head) {
    return { ok: false, reason: 'COMMIT_REF is empty - nothing to diff' };
  }
  return { ok: true, base, head };
}

function main() {
  const range = resolveRange(process.env);
  if (!range.ok) {
    console.log(`[netlify-ignore] BUILD - ${range.reason}.`);
    process.exit(1);
  }

  let paths;
  try {
    const raw = execFileSync(
      'git',
      ['diff', '--name-only', '-z', range.base, range.head],
      { encoding: 'utf8' }
    );
    // -z avoids core.quotePath mangling non-ASCII names into escaped octal.
    paths = raw.split('\0').filter((entry) => entry.length > 0);
  } catch (error) {
    console.log(
      `[netlify-ignore] BUILD - could not diff ${range.base}..${range.head}: ${error.message}`
    );
    process.exit(1);
  }

  const verdict = decide(paths);

  // AC6. A skip leaves no build log behind, so this IS the only record of why `sit` did
  // not move. Print the inputs, not just the answer.
  console.log(`[netlify-ignore] range ${range.base}..${range.head} - ${paths.length} changed path(s):`);
  for (const path of paths) {
    const { verdict: pathVerdict, rule } = classify(path);
    console.log(`[netlify-ignore]   ${pathVerdict === 'build' ? 'BUILD' : 'inert'}  ${path}  (${rule})`);
  }

  if (verdict.build) {
    console.log(`[netlify-ignore] BUILD - ${verdict.reason}.`);
    process.exit(1);
  }

  console.log(
    `[netlify-ignore] SKIP - ${verdict.reason}. Netlify will cancel this build and ` +
      `the previously published deploy stays live.`
  );
  process.exit(0);
}

// Importing this file from the self-test must not run the git diff or call process.exit.
// pathToFileURL rather than a hand-built `file://` string: on Windows argv[1] is
// `C:\...`, and `new URL('file://C:/...')` would read `C:` as the HOST and never match.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
