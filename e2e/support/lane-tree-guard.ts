import { execFileSync } from 'node:child_process';
import type { FullConfig } from '@playwright/test';

/**
 * OBRS-1531 -- say which tree this lane is about to measure, and refuse to measure
 * somebody else's.
 *
 * `webServer.reuseExistingServer` is `!CI`, so on this box it is always on: if any
 * process is already answering the lane's port, Playwright does not start a server --
 * it attaches to that one. Nothing in the output says so. Measured 2026-08-22
 * (OBRS-773): a lane run from the OBRS-773 worktree reported `199 passed`, that number
 * went onto the card as AC evidence, and the server it had measured was
 * `...-wt-obrs-768\node_modules\...\ng.js serve --configuration gate --port 4230`. It
 * was caught only because the contrast gate went red on a page OBRS-773 never touched;
 * a green run would have looked perfect and been worth nothing.
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
 * The port comes from `config.webServer.url`, never from an env var, so a config that
 * spreads the gate config (`playwright.obrs769.config.ts`) is guarded on ITS port and
 * not on the gate's.
 *
 * IT STANDS DOWN ON CI, deliberately: there `reuseExistingServer` is false, the runner
 * has one lane and no neighbours, and `Get-NetTCPConnection` is Windows-only anyway. It
 * stands down on any non-Windows box too -- and prints that it did, because a guard
 * that goes quiet is the failure mode this card is about.
 *
 * ASCII-only source.
 */

const TAG = '[lane-tree]';

function git(rootDir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

/** Command line of the process LISTENING on `port`, or null if nothing is. */
function listenerCommandLine(port: string): string | null {
  const script =
    `$ErrorActionPreference='SilentlyContinue'; ` +
    `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1; ` +
    `if ($c) { (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess)).CommandLine }`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  });
  return out.trim() || null;
}

export default function laneTreeGuard(config: FullConfig): void {
  const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
  if (!server?.url) return;
  const port = new URL(server.url).port;

  // `--show-toplevel` answers with forward slashes; a Windows command line has
  // backslashes. Compare in one spelling, and keep the trailing separator: without it
  // the MAIN clone's `...\OBRS-frontend` is a prefix of every worktree path beside it
  // (`...\OBRS-frontend-wt-obrs-1531`), so the clone would accept a worktree's server.
  const tree = git(config.rootDir, ['rev-parse', '--show-toplevel']).replace(/\//g, '\\');
  const sha = git(config.rootDir, ['rev-parse', '--short', 'HEAD']);
  const branch = git(config.rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = git(config.rootDir, ['status', '--porcelain']) ? ' +uncommitted changes' : '';

  console.log(`${TAG} tree ${tree}`);
  console.log(`${TAG} head ${sha} (${branch})${dirty}`);
  console.log(`${TAG} port ${port}`);

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
