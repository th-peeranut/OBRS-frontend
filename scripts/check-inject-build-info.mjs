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
 * Four cases, per the spec (docs/sessions/SPEC-OBRS-1075-build-identity.md §8):
 *   1. No COMMIT_REF + cwd with no reachable .git -> throw, no output file.
 *   2. COMMIT_REF set but no `v*` tag reachable -> throw, no output file.
 *   3. Positive control: everything resolves -> file written, values well-shaped and
 *      non-empty. (DEV-GOTCHAS: zero assertions without a positive control cannot go red.)
 *   4. Stale-output: a fake file already sits at `out` from an earlier successful run, THEN
 *      generate() is run in a failing environment -> the fake file must be GONE, not just an
 *      exit-1. This is what proves a bypass-npm lane (`npx ng serve`/`ng test` direct) hits a
 *      loud TS2307 instead of silently compiling last run's stale values.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

console.log('build-info generator self-test OK: all 4 must-fail/must-pass cases hold.');
