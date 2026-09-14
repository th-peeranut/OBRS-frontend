import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-863 evidence capture. Two `ng serve` instances started BY HAND:
 *
 *   :4863  a worktree at origin/dev            (BEFORE — the form always open)
 *   :4864  this branch                         (AFTER  — the collapsed summary)
 *
 *   npx ng serve --port 4863   # in a worktree checked out at origin/dev
 *   npx ng serve --port 4864   # here
 *   npx playwright test --config=playwright.obrs863capture.config.ts
 *
 * Both served with the DEFAULT (development) configuration, for two reasons that
 * both matter: `apiUrl` points at :8080 where nothing listens, so anything the
 * spec fails to stub fails loudly instead of quietly reaching SIT; and
 * `seedStore` needs `window.ng`, which only a development build exposes. The
 * spec's `seedCustomerSession` fulfils every `/api/**` call in the browser, so
 * this lane is hermetic and no backend is required.
 *
 * The viewport goes AFTER the device spread, not in the top-level `use` —
 * `devices['Desktop Chrome']` carries its own 1280x720 and the project's `use`
 * is merged last. The spec sets 390x664 per test anyway; this is the shape the
 * sibling capture configs keep, so the default never silently wins.
 *
 * No `webServer`: one config cannot start two trees. No lane-tree guard, for the
 * same reason playwright.obrs391.config.ts carries none — the guard attributes
 * ONE port read from `webServer.url` or `baseURL`, and this lane has neither,
 * because its two ports live as full URLs inside the spec. A banner naming the
 * runner's tree would be right for the AFTER half and wrong for the BEFORE, and
 * a wrong attribution is worse than none. Rule 7 of scripts/check-e2e-lanes.mjs
 * therefore does not ask for one here.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-863-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 664 } },
    },
  ],
});
