#!/usr/bin/env node
/**
 * OBRS-1075 - self-test for scripts/inject-build-info.mjs (AC-6, "no fallback").
 *
 * Why a gate and not "we ran it once": a wrong fallback here does not fail loudly - it
 * writes a plausible-looking build-info.ts (`'unknown'`, `'dev'`) and every later step
 * (compile, footer render, submitted usability report) succeeds while the value is a lie.
 * The only place that can be caught is here, before it ships.
 *
 * Same shape as scripts/check-netlify-ignore.mjs: import the pure functions from the
 * generator and assert against them directly, in one file, with no test framework.
 *
 * Six cases, per the spec (docs/sessions/SPEC-OBRS-1075-build-identity.md §8) plus the
 * shallow-clone self-heal added after CI job 104298772230 went red:
 *   1. No COMMIT_REF + cwd with no reachable .git -> throw, no output file.
 *   2. COMMIT_REF set but no `v*` tag reachable, and no remote to fetch from -> throw, no
 *      output file.
 *   3. Positive control: everything resolves -> file written, values well-shaped and
 *      non-empty. (DEV-GOTCHAS: zero assertions without a positive control cannot go red.)
 *   4. Stale-output: a fake file already sits at `out` from an earlier successful run, THEN
 *      generate() is run in a failing environment -> the fake file must be GONE, not just an
 *      exit-1. This is what proves a bypass-npm lane (`npx ng serve`/`ng test` direct) hits a
 *      loud TS2307 instead of silently compiling last run's stale values.
 *   5. Shallow clone (`--depth 1 --no-tags`, actions/checkout@v4's default shape) of a repo
 *      that has NO `v*` tag anywhere -> the self-heal fetch succeeds (there is a real
 *      `origin` to fetch from) but still finds nothing -> throw, no output file. Without
 *      this the self-heal fetch could silently turn into a fallback that hides a genuine
 *      absence of a tag instead of a merely-not-yet-fetched one.
 *   6. Positive control for the self-heal itself: same shallow-clone shape, but the origin
 *      DOES have a `v*` tag on an earlier commit the `--depth 1` clone did not include ->
 *      `git describe` fails on the first try, the self-heal `git fetch --unshallow --tags`
 *      brings the tag's commit in, and the retry succeeds with the correct tag. This is CI
 *      job 104298772230 reproduced locally and proven fixed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generate } from './inject-build-info.mjs';

const failures = [];
const cleanupDirs = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function freshOutPath() {
  const dir = mkdtempSync(join(tmpdir(), 'obrs-build-info-out-'));
  cleanupDirs.push(dir);
  return join(dir, 'build-info.ts');
}

function noGitCwd() {
  const dir = mkdtempSync(join(tmpdir(), 'obrs-build-info-nogit-'));
  cleanupDirs.push(dir);
  return dir;
}

/** A throwaway git repo with at least one commit but NO tags. */
function gitRepoNoTags() {
  const dir = mkdtempSync(join(tmpdir(), 'obrs-build-info-notag-'));
  cleanupDirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'selftest@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Self Test'], { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'x');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

/** Same, but with a `v*` tag on HEAD so appVersion can resolve. */
function gitRepoWithTag() {
  const dir = gitRepoNoTags();
  execFileSync('git', ['tag', 'v9.9.9-selftest'], { cwd: dir });
  return dir;
}

/**
 * A throwaway "origin" repo with two commits. `withTag` puts a `v*` tag on the FIRST
 * commit only, so a `--depth 1` clone of the second commit does not include the tagged
 * commit at all — the shape that made CI job 104298772230 fail (`fatal: No names found`)
 * even though the real repo has real `v*` tags.
 */
function originRepo(withTag) {
  const dir = mkdtempSync(join(tmpdir(), 'obrs-build-info-origin-'));
  cleanupDirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'selftest@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Self Test'], { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'a');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'c1'], { cwd: dir });
  if (withTag) execFileSync('git', ['tag', 'v9.9.9-selftest'], { cwd: dir });
  writeFileSync(join(dir, 'b.txt'), 'b');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'c2'], { cwd: dir });
  return dir;
}

/**
 * A `--depth 1 --no-tags` clone of `origin` — the exact shape `actions/checkout@v4`'s
 * default produces, and what Netlify's clone is documented (scripts/netlify-ignore.mjs) to
 * be shaped like too: HEAD's commit only, no tag refs fetched at all. A plain local path
 * would make git silently IGNORE `--depth` ("--depth is ignored in local clones"), so this
 * has to go through a real `file://` URL — `pathToFileURL` is what makes that portable
 * across a Windows drive-letter path without hand-rolling the `file:///C:/...` escaping.
 */
function shallowCloneNoTags(origin) {
  const dir = mkdtempSync(join(tmpdir(), 'obrs-build-info-shallow-'));
  cleanupDirs.push(dir);
  execFileSync('git', [
    'clone',
    '--depth', '1',
    '--no-tags',
    '--quiet',
    pathToFileURL(origin).href,
    dir,
  ]);
  return dir;
}

// ---------------------------------------------------------------------------
// Case 1 - no COMMIT_REF, cwd with no reachable .git.
// ---------------------------------------------------------------------------
{
  const out = freshOutPath();
  const cwd = noGitCwd();
  const env = { ...process.env };
  delete env.COMMIT_REF;

  let threw = false;
  try {
    generate(env, cwd, out);
  } catch {
    threw = true;
  }
  expect(threw, 'case 1: generate() must throw when COMMIT_REF is unset and cwd has no .git');
  expect(!existsSync(out), 'case 1: no output file should exist after a failed resolve');
}

// ---------------------------------------------------------------------------
// Case 2 - COMMIT_REF present (so buildSha resolves without git) but no `v*` tag
// reachable, so appVersion cannot resolve.
// ---------------------------------------------------------------------------
{
  const out = freshOutPath();
  const cwd = gitRepoNoTags();
  const env = { ...process.env, COMMIT_REF: 'deadbeef1234567890' };

  let threw = false;
  try {
    generate(env, cwd, out);
  } catch {
    threw = true;
  }
  expect(threw, 'case 2: generate() must throw when no `v*` tag is reachable, even with a valid COMMIT_REF');
  expect(!existsSync(out), 'case 2: no output file should exist after a failed resolve');
}

// ---------------------------------------------------------------------------
// Case 3 - positive control. Without this, cases 1/2/4 could pass vacuously
// because generate() never succeeds at all (DEV-GOTCHAS: zero assertions
// without a positive control cannot go red).
// ---------------------------------------------------------------------------
{
  const out = freshOutPath();
  const cwd = gitRepoWithTag();
  const env = { ...process.env };
  delete env.COMMIT_REF;

  const result = generate(env, cwd, out);
  expect(existsSync(out), 'case 3: output file must exist after a successful resolve');
  expect(
    /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(result.appVersion),
    `case 3: appVersion "${result.appVersion}" does not look like a git tag`,
  );
  expect(
    /^[0-9a-f]{7}$/.test(result.buildSha),
    `case 3: buildSha "${result.buildSha}" is not a 7-char hex sha`,
  );
  const written = existsSync(out) ? readFileSync(out, 'utf8') : '';
  expect(
    written.includes(result.appVersion) && written.includes(result.buildSha),
    'case 3: the written file must contain the resolved values',
  );
}

// ---------------------------------------------------------------------------
// Case 4 - stale output. A file left over from an earlier successful run must be
// removed even when THIS run fails.
// ---------------------------------------------------------------------------
{
  const out = freshOutPath();
  writeFileSync(out, 'export const buildInfo = { appVersion: "vFAKE", buildSha: "fakefak" };\n');
  const cwd = noGitCwd();
  const env = { ...process.env };
  delete env.COMMIT_REF;

  let threw = false;
  try {
    generate(env, cwd, out);
  } catch {
    threw = true;
  }
  expect(threw, 'case 4: generate() must throw in a failing environment');
  expect(!existsSync(out), 'case 4: a stale output file must be removed even though this run failed');
}

// ---------------------------------------------------------------------------
// Case 5 - shallow clone of a repo with NO `v*` tag anywhere. The self-heal fetch
// succeeds (there is a real `origin` remote), but still finds nothing, so this must
// still throw and write nothing — the self-heal must not become a silent fallback.
// ---------------------------------------------------------------------------
{
  const out = freshOutPath();
  const origin = originRepo(false);
  const cwd = shallowCloneNoTags(origin);
  const env = { ...process.env };
  delete env.COMMIT_REF;

  let threw = false;
  try {
    generate(env, cwd, out);
  } catch {
    threw = true;
  }
  expect(threw, 'case 5: generate() must throw when a shallow clone has no `v*` tag anywhere, even after the self-heal fetch');
  expect(!existsSync(out), 'case 5: no output file should exist after a failed resolve');
}

// ---------------------------------------------------------------------------
// Case 6 - positive control for the self-heal path itself (CI job 104298772230,
// reproduced and proven fixed). The shallow clone's `--depth 1` misses the commit the
// tag lives on, so the FIRST describe fails, but the self-heal
// `git fetch --unshallow --tags` brings it in and the retry must succeed.
// ---------------------------------------------------------------------------
{
  const out = freshOutPath();
  const origin = originRepo(true);
  const cwd = shallowCloneNoTags(origin);
  const env = { ...process.env };
  delete env.COMMIT_REF;

  const result = generate(env, cwd, out);
  expect(
    result.appVersion === 'v9.9.9-selftest',
    `case 6: the self-heal fetch should have recovered the tag; got appVersion "${result.appVersion}"`,
  );
  expect(existsSync(out), 'case 6: output file must exist once the self-heal fetch recovers the tag');
}

// ---------------------------------------------------------------------------

for (const dir of cleanupDirs) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup of scratch temp dirs; not worth failing the gate over
  }
}

if (failures.length > 0) {
  console.error(`build-info generator self-test FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('build-info generator self-test OK: all 6 must-fail/must-pass cases hold.');
