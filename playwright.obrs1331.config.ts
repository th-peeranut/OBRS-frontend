import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1331 evidence capture. Two `ng serve` instances started BY HAND, the same shape
 * playwright.obrs702.config.ts uses for this very page:
 *
 *   :4330  OBRS-frontend-wt-obrs-1308-notification-message-override  (BEFORE)
 *   :4331  this worktree                                            (AFTER)
 *
 *     npx ng serve --port 4330   # in the 1308 worktree
 *     npx ng serve --port 4331   # here
 *     npx playwright test --config=playwright.obrs1331.config.ts
 *
 * The BEFORE tree is NOT a reconstruction: the 1308 worktree is `dev` with the seventh
 * tab and without this card's one declaration, which is exactly the state the owner
 * screenshotted. Nothing is stubbed into looking broken and nothing is patched into
 * looking fixed — the served tree is the only variable.
 *
 * Both serve the DEFAULT (local) configuration, so `apiUrl` points at :8080 where nothing
 * listens; the spec stubs the reads the Booking Policy tab makes and anything it missed
 * fails as a network error rather than quietly reaching SIT. No backend is required
 * because the tab STRIP is built entirely from SYSTEM_SETTINGS_TABS on the frontend.
 *
 * No `webServer` (one config cannot start two trees) and no `globalSetup` (the session is
 * synthetic — e2e/support/gate-admin-session.ts).
 *
 * NO LANE-TREE GUARD EITHER, decided in OBRS-1616 AC-5 rather than overlooked.
 * `e2e/support/lane-tree-guard.ts` attributes ONE port, read from `webServer.url` or this
 * config's `baseURL`; this lane has neither, because its two ports live as full URLs
 * inside the spec. A banner naming the runner's tree would be right for the AFTER half and
 * wrong for the BEFORE, and a wrong attribution is worse than none. Rule 7 of
 * scripts/check-e2e-lanes.mjs therefore does not ask for one here.
 *
 * 1280x720 is not a default: it is the window the owner reported the wrap at, and the
 * whole defect is width-dependent, so shooting it at anything else would prove nothing.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1331-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
