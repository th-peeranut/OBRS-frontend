import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1432 evidence capture. Two `ng serve` instances started BY HAND, the same shape
 * playwright.obrs1331.config.ts uses for this very page:
 *
 *   :4340  OBRS-frontend on `dev`        (BEFORE — the flat 8-tab strip)
 *   :4341  this worktree                 (AFTER  — one entry per topic)
 *
 *     npx ng serve --port 4340   # in the clean OBRS-frontend clone, branch dev
 *     npx ng serve --port 4341   # here
 *     npx playwright test --config=playwright.obrs1432.config.ts
 *
 * The BEFORE tree is NOT a reconstruction: it is `dev` at the commit this branch forked
 * from, so it is the strip the owner complained about. The served tree is the only
 * variable — same synthetic session, same stubs, same language, same mode, same viewport.
 *
 * Both serve the DEFAULT (local) configuration, so `apiUrl` points at :8080 where nothing
 * listens; the spec stubs the read the Booking Policy tab makes and anything it missed
 * fails as a network error rather than quietly reaching SIT. No backend is required
 * because the strip is built entirely from SYSTEM_SETTINGS_TABS on the frontend.
 *
 * No `webServer` (one config cannot start two trees) and no `globalSetup` (the session is
 * synthetic — e2e/support/gate-admin-session.ts).
 *
 * Viewport is per-test, not here: the defect is width-dependent and the two widths ARE the
 * two claims — 1,366px is the laptop the owner reported 2 rows on, 390px is where the
 * measurement on live SIT put the strip at 4 rows.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1432-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
