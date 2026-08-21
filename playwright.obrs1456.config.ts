import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-564 booking-policy lane, given a committed config by OBRS-1456.
 *
 *   npx playwright test --config=playwright.obrs1456.config.ts
 *
 * Until this file existed the lane was assembled by hand on every run, and its
 * spec header named ports (`:8080` / `:4200`) that no longer matched what the
 * spec actually needed — the OBRS-1456 run found `:8080` and `:4200` both held
 * by unrelated sessions. The ports below are the `e2e` build configuration's
 * (`environment.e2e.ts` pins `apiUrl` to `:8181`; changing one without the
 * other silently points the browser at another session's backend) plus a
 * lane-private frontend port.
 *
 * OWN-DB, and the database is NOT built here: this spec writes the platform
 * `booking_max_advance_days` row and reads it back through the public page, so
 * it needs a database it may spend. Build one first —
 * `OBRS-backend\scripts\new-local-db.ps1 -DbName obrs1456qa` — and boot the
 * backend on it:
 *
 *   $env:DB_PASSWORD = '<local postgres password>'
 *   .\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=dev,local' `
 *     '-Dspring-boot.run.jvmArguments=-Dserver.port=8181 -Dapp.frontend-url=http://localhost:4256 -Dspring.datasource.url=jdbc:postgresql://localhost:5432/obrs1456qa'
 *
 * `-Dapp.frontend-url` is not decoration: dev CORS allows exactly that one
 * origin, so a backend booted with the default `:4200` refuses this lane.
 *
 * There is deliberately no backend `webServer` entry. Playwright would have to
 * own the database build to own the backend, and a lane that silently rebuilds
 * a database is the wrong default for a spec a human runs to read a verdict.
 */

const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4256';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs-564-booking-policy.spec.ts',
  timeout: 90_000,

  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: `npx ng serve --configuration e2e --port ${FRONTEND_PORT} --no-live-reload`,
      url: BASE_URL,
      timeout: 300_000,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
