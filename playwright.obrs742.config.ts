import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-742 evidence capture. Unlike every other capture config here, this one
 * needs a REAL backend and a REAL database — OBRS-730 shipped the endpoint that
 * writes an owner override, so the rows this card is about can finally be
 * produced instead of stubbed.
 *
 * Setup, once (OBRS-backend worktree at origin/dev, which carries V51):
 *
 *   .\scripts\new-local-db.ps1 -DbName obrs742qa
 *   $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://localhost:5432/obrs742qa'
 *   $env:DB_PASSWORD = '<local postgres password>'
 *   .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev,local"
 *
 * Then, as the seeded owner (owner@system.local), against :8080:
 *
 *   PUT    /api/private/owner/configs/booking-policy  {maxAdvanceDays:45, cutoffMinutes:30}
 *   PUT    /api/private/owner/configs/booking-policy  {maxAdvanceDays:60, cutoffMinutes:45}
 *   DELETE /api/private/owner/configs/booking-policy
 *
 * which leaves exactly six history rows — two INSERT (old_value NULL, the case
 * this card fixes), two UPDATE, two DELETE (new_value NULL, the case it must not
 * break) — newest first in the table.
 *
 * BOTH trees are served on :4200, one at a time, because the dev profile's CORS
 * allows exactly `${app.frontend-url}` = http://localhost:4200 and nothing else.
 * Serving the two trees on private ports would need the backend restarted with
 * extra origins; sequencing on the one allowed origin is cheaper and keeps the
 * BEFORE/AFTER pair differing by the tree alone.
 *
 *   # BEFORE — a throwaway detached worktree at origin/dev
 *   npx ng serve --port 4200
 *   $env:OBRS742_PHASE='before'; npx playwright test --config=playwright.obrs742.config.ts
 *   # stop it, then AFTER — this branch
 *   npx ng serve --port 4200
 *   $env:OBRS742_PHASE='after';  npx playwright test --config=playwright.obrs742.config.ts
 *
 * `ng serve` with no --configuration serves environment.ts, whose apiUrl is
 * :8080 — the stack booted above. The viewport is tall enough for the whole
 * six-row card in one shot; never "fix" a clipped element screenshot by
 * scrolling, Playwright leaves the off-screen part unpainted (OBRS-702).
 *
 * GUARDED, unlike the rest of the two-tree capture family (OBRS-1616). Those serve their
 * two trees on two ports inside ONE run, so a single banner would be right for one half
 * and wrong for the other. This lane does not: each phase is its own invocation against
 * ONE server on ONE port, which is exactly the shape `e2e/support/lane-tree-guard.ts`
 * attributes. It is also the family's most exposed lane — :4200 is shared and
 * hand-started, so a BEFORE server left running when the AFTER invocation starts produces
 * origin/dev screenshots labelled "after" with nothing to say so (OBRS-773). The banner
 * says so. `baseURL` repeats the port the spec already hardcodes, which is safe here and
 * only here: the dev profile's CORS pins it to http://localhost:4200 (see above), so it
 * is a constant, not a per-session choice, and nothing in the spec navigates by it.
 */
export default defineConfig({
  // OBRS-1616: each phase serves ONE tree on :4200, so the guard can name it. A foreign
  // tree there is the documented state for the BEFORE phase, so it must not refuse.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e/tests',
  testMatch: ['obrs-742-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    // OBRS-1616: the guard's only handle on the port. The spec navigates by full URL.
    baseURL: 'http://localhost:4200',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
