import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-722 evidence capture. Two `ng serve` instances started BY HAND:
 *
 *   :4722  a throwaway detached worktree at origin/dev 45c66cbd (BEFORE — no scope column)
 *   :4723  this branch                                          (AFTER  — ขอบเขต column)
 *
 *   npx ng serve --port 4722   # in the BEFORE worktree
 *   npx ng serve --port 4723   # here
 *   npx playwright test --config=playwright.obrs722.config.ts
 *
 * Both are served with the DEFAULT (local) configuration, so `apiUrl` points at
 * :8080 where nothing listens — the spec stubs every call it needs and anything
 * it missed fails as a network error rather than quietly hitting SIT (same rule
 * as playwright.gate.config.ts, which is why no backend is required).
 *
 * The three history rows are stubbed rather than seeded, and that is the honest
 * shape for this card: nothing in the product can WRITE an owner override yet
 * (there is no endpoint — that is the half of OBRS-722 deliberately left out),
 * so no live environment can produce an owner-scoped row to photograph. The
 * fixture is the exact DTO the backend now emits, and that it emits it is proven
 * separately by SystemConfigHistoryControllerTest against the real serializer.
 *
 * No `webServer`: one config cannot start two trees, and the BEFORE tree is a
 * throwaway that should not outlive the capture. The viewport is tall enough for
 * the whole table in one shot — never "fix" a clipped element screenshot by
 * scrolling, Playwright leaves the off-screen part unpainted (OBRS-702).
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
  testMatch: ['obrs-722-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
