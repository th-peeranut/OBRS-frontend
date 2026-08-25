import { execFileSync } from 'node:child_process';
import type { FullConfig } from '@playwright/test';

/**
 * OBRS-1531 / OBRS-1611 -- say which tree this lane is about to measure, and refuse to
 * measure somebody else's.
 *
 * `webServer.reuseExistingServer` is `!CI` or a flat `true` in 36 of this repo's 53 root
 * configs, so on this box it is always on: if any process is already answering the lane's
 * port, Playwright does not start a server -- it attaches to that one. Nothing in the
 * output says so. Measured 2026-08-22 (OBRS-773): a lane run from the OBRS-773 worktree
 * reported `199 passed`, that number went onto the card as AC evidence, and the server it
 * had measured was `...-wt-obrs-768\node_modules\...\ng.js serve --configuration gate
 * --port 4230`. It was caught only because the contrast gate went red on a page OBRS-773
 * never touched; a green run would have looked perfect and been worth nothing.
 *
 * The parallel-session ceiling is 4, so two lanes wanting one port is the NORMAL case.
 * Before any spec runs this global setup therefore:
 *
 *   1. prints the tree, the sha and the port, so a log pasted onto a card can be
 *      checked rather than trusted (AC2); and
 *   2. reads the OWNER of whatever is listening on that port and throws if its command
 *      line is not inside this worktree. Throwing is the point -- the alternative is
 *      the silent pass that produced OBRS-773's evidence.
 *
 * OBRS-1611 -- NOT EVERY LANE MAY THROW. Four configs attach to the stack the operator
 * started by hand and say so in their own header: obrs1258qa, obrs1388qa, obrs1388before
 * and obrs433, all on :4200. For them "the server belongs to another tree" is the
 * documented, correct state, so throwing would refuse a legitimate run. They declare
 *
 *     metadata: { laneTree: 'attach-to-operator-stack' },
 *
 * and get step 1 without step 2: the banner still names the tree that actually served the
 * pictures, which is the whole evidence value. A config that declares nothing is guarded
 * -- the strict side is the default on purpose, because a typo in the marker then costs a
 * refused run somebody notices, not a silent picture of the wrong tree. Rule 7 of
 * `scripts/check-e2e-lanes.mjs` rejects a misspelt value, and a webServer lane that wires
 * no guard at all.
 *
 * IT STANDS DOWN ON CI, deliberately: there `reuseExistingServer` is false, the runner
 * has one lane and no neighbours, and `Get-NetTCPConnection` is Windows-only anyway. It
 * stands down on any non-Windows box too -- and prints that it did, because a guard
 * that goes quiet is the failure mode this card is about.
 *
 * ASCII-only source.
 */

const TAG = '[lane-tree]';

/**
 * The one value `metadata.laneTree` may take. Exported so rule 7 of
 * scripts/check-e2e-lanes.mjs can read the spelling out of this file instead of keeping a
 * second copy of it that would drift from this one.
 */
export const ATTACH_TO_OPERATOR_STACK = 'attach-to-operator-stack';

function git(rootDir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

/**
 * The port this lane will actually measure, or null when it measures nothing on this box.
 *
 * `config.webServer.url` first, never an env var, so a config that spreads the gate config
 * (`playwright.obrs769.config.ts`) is guarded on ITS port and not on the gate's.
 *
 * The fallback is not defensive padding. Measured against @playwright/test 1.61 in
 * `node_modules/playwright/lib/common/index.js`: when a config gives `webServer` as an
 * ARRAY, Playwright sets `FullConfig.webServer` to **null** and keeps the array on an
 * internal field this signature cannot reach. Six lanes here do that (local, obrs483,
 * obrs577, obrs732, obrs884, obrs1456), so reading only `config.webServer` would print
 * nothing at all for them -- a guard wired in and silent, which is worse than one that was
 * never wired. The browser's `baseURL` is the same frontend those arrays serve, so it
 * names the port that matters.
 *
 * Only a loopback baseURL, and only with an explicit port: `playwright.obrs561.config.ts`
 * drops its webServer entirely and points baseURL at SIT when OBRS561_BASE_URL is set,
 * and there is no local server to attribute in that shape.
 *
 * The backend entry of those six arrays is not checked. Its server lives in the
 * OBRS-backend tree, so "is the listener inside this worktree" could only ever be false
 * there; and locally its `reuseExistingServer` is off unless E2E_REUSE_SERVERS=1, which
 * makes Playwright itself fail loudly on a busy port.
 */
function lanePort(config: FullConfig): string | null {
  const url = config.webServer?.url;
  if (url) return new URL(url).port;

  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return null;
  try {
    const parsed = new URL(baseURL);
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) return null;
    return parsed.port || null;
  } catch {
    return null;
  }
}

/**
 * A one-line description of the process LISTENING on `port`, or null only when NOTHING
 * is. A `pid <n>` marker is emitted first so that a listener whose command line cannot
 * be read -- Win32_Process.CommandLine is null for a process owned by another user or
 * running elevated -- still comes back non-null. The caller then fails closed on it
 * (the port IS held, just by something it cannot name) instead of mistaking it for a
 * free port and letting reuseExistingServer attach to it. OBRS-1531: a guard that goes
 * quiet is the failure mode this card is about.
 */
function listenerCommandLine(port: string): string | null {
  const script =
    `$ErrorActionPreference='SilentlyContinue'; ` +
    `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1; ` +
    `if ($c) { "pid " + $c.OwningProcess; (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess)).CommandLine }`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  });
  // The pid and the command line come back as two lines; keep them on one so the refusal
  // below stays a block of `label : value` a reader can scan.
  return out.trim().replace(/\s*\r?\n\s*/g, ' :: ') || null;
}

export default function laneTreeGuard(config: FullConfig): void {
  const attaches = config.metadata['laneTree'] === ATTACH_TO_OPERATOR_STACK;

  const port = lanePort(config);
  if (!port) {
    console.log(`${TAG} standing down -- this lane names no local server to attribute`);
    return;
  }

  // `--show-toplevel` answers with forward slashes; a Windows command line has
  // backslashes. Compare in one spelling, and keep the trailing separator: without it
  // the MAIN clone's `...\OBRS-frontend` is a prefix of every worktree path beside it
  // (`...\OBRS-frontend-wt-obrs-1531`), so the clone would accept a worktree's server.
  // Only on win32: this string is also the path the banner prints, and rewriting the
  // separators off Windows printed `\home\runner\work\...` into the CI log -- a path
  // that names the right tree in a spelling that box does not use.
  let tree: string;
  let sha: string;
  let branch: string;
  let dirty: string;
  try {
    const toplevel = git(config.rootDir, ['rev-parse', '--show-toplevel']);
    tree = process.platform === 'win32' ? toplevel.replace(/\//g, '\\') : toplevel;
    sha = git(config.rootDir, ['rev-parse', '--short', 'HEAD']);
    branch = git(config.rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    dirty = git(config.rootDir, ['status', '--porcelain']) ? ' +uncommitted changes' : '';
  } catch (e) {
    // AC-5: this runs on CI too (up to the CI return below). A git hiccup -- not a repo,
    // git not on PATH -- must not redden the lane; stand down loudly instead. Locally a
    // git failure also means the tree cannot be computed, so the owner check below could
    // not run either.
    console.log(`${TAG} git unavailable -- standing down (${(e as Error).message.split('\n')[0]})`);
    return;
  }

  console.log(`${TAG} tree ${tree}`);
  console.log(`${TAG} head ${sha} (${branch})${dirty}`);
  console.log(
    `${TAG} port ${port}${attaches ? ' (attaches to the operator stack on purpose)' : ''}`
  );

  if (process.env['CI']) {
    console.log(`${TAG} owner check off on CI -- reuseExistingServer is false there`);
    return;
  }
  if (process.platform !== 'win32') {
    console.log(`${TAG} owner check off -- implemented for win32, this is ${process.platform}`);
    return;
  }

  const listener = listenerCommandLine(port);
  if (!listener) {
    console.log(`${TAG} nothing on ${port} yet -- this run serves its own tree`);
    return;
  }
  if (listener.toLowerCase().includes(`${tree.toLowerCase()}\\`)) {
    console.log(`${TAG} the server on ${port} is this tree's own`);
    return;
  }

  if (attaches) {
    // The documented state for these four, not an accident -- but the log still has to
    // name the tree that served the pictures, because that is what goes onto the card.
    console.log(`${TAG} the server on ${port} is ANOTHER tree's, which is what this lane asks for:`);
    console.log(`${TAG}   listening : ${listener}`);
    console.log(`${TAG} whatever this run captures is a picture of THAT tree, not of ${tree}.`);
    return;
  }

  throw new Error(
    `${TAG} REFUSING TO RUN -- port ${port} belongs to another tree.\n` +
      `  reuseExistingServer would have attached to it and reported ITS code as this\n` +
      `  lane's result, with nothing in the output to say so (OBRS-773, OBRS-1531).\n` +
      `    this tree : ${tree}\n` +
      `    listening : ${listener}\n` +
      `  Give this lane a port of its own -- each config names its own env var, see the\n` +
      `  port table in docs/e2e-lanes.md. If that server is a leftover of your own\n` +
      `  killed run in another worktree, stop it instead.`
  );
}
