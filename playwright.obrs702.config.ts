import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-702 evidence capture. Two `ng serve` instances started BY HAND:
 *
 *   :4702  a throwaway worktree at origin/dev 3eff9dc1 (BEFORE — four config pages)
 *   :4703  this branch                                 (AFTER  — one tabbed page)
 *
 *   npx ng serve --port 4702   # in the BEFORE worktree
 *   npx ng serve --port 4703   # here
 *   npx playwright test --config=playwright.obrs702.config.ts
 *
 * Both are served with the DEFAULT (local) configuration, so `apiUrl` points at
 * :8080 where nothing listens — the spec stubs every call it needs and anything
 * it missed fails as a network error rather than quietly hitting SIT. Same rule
 * as playwright.gate.config.ts, and the reason no backend is required.
 *
 * No `webServer`: one config cannot start two trees, and the BEFORE tree is a
 * throwaway that should not outlive the capture. No `globalSetup` — the session
 * is synthetic (e2e/support/gate-admin-session.ts), so there is nothing to log
 * into and the role can be chosen per shot, which is what makes the
 * admin-vs-owner tab comparison possible at all.
 *
 * NO LANE-TREE GUARD EITHER, decided in OBRS-1616 AC-5 rather than overlooked.
 * `e2e/support/lane-tree-guard.ts` attributes ONE port, read from `webServer.url`
 * or this config's `baseURL`; this lane has neither, because its two ports live as
 * full URLs inside the spec. A banner naming the runner's tree would be right for
 * the AFTER half and wrong for the BEFORE, and a wrong attribution is worse than
 * none. Rule 7 of scripts/check-e2e-lanes.mjs therefore does not ask for one here.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-702-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    // Starting size only, and 720 is NOT enough for the sidebar: the nav is
    // ~1290px tall with the System group last, so the sidebar tests call
    // fitViewportToNav() to GROW the window until the whole nav is on screen.
    // Never "fix" a clipped shot by scrolling instead — Playwright returns an
    // over-tall element's full box with the off-screen part unpainted, which is
    // how this card's first evidence upload went out 44% blank white.
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
