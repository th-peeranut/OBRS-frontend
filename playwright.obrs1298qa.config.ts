import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1298 — `/admin/stops`: the edit form moved into a modal and the row became clickable.
 * Runs `e2e/tests/obrs-1298-stops-modal.spec.ts`, which is declared in `e2e/lanes.json` under
 * the OWN-DB lane.
 *
 * WHY OWN-DB AND NOT SIT-LIVE. The spec logs in as a seeded owner and then MUTATES stop rows
 * (AC5a saves a text field on a stop that already has a photo; AC5b saves whitespace and reads
 * the trimmed value back). It carries no `e2e/support/sit-sweep.ts` teardown, so running it on
 * the shared SIT database would leave edits behind for whoever looks next. It needs a database
 * it is allowed to spend — which is exactly what OWN-DB names.
 *
 * WHY NOT GATE. It asserts the real save round-trip against a real backend; intercepting the
 * calls would leave nothing but the modal's own markup, which `stop-form-modal.component.spec.ts`
 * already covers far more cheaply. It also uses `click({ force: true })` to dismiss SweetAlert,
 * which the GATE lane forbids for good reason (OBRS-750).
 *
 * ENVIRONMENT — a hand-started local backend, NOT SIT:
 *   cd ../OBRS-backend && ./mvnw clean && ./mvnw -q spring-boot:run -Dspring-boot.run.profiles=dev,local
 *   npm run start:local          # frontend, port 4200 ONLY
 * The `dev` profile's CORS allow-list is pinned to exactly `http://localhost:4200`, so the
 * randomized-alt-port convention other QA configs use does NOT apply here — the port is part of
 * the environment's premise, and only one server can hold it at a time.
 *
 * Run:
 *   npx playwright test --config=playwright.obrs1298qa.config.ts
 */
const PORT = process.env['QA_1298_PORT'] ?? '4200';

export default defineConfig({
  // OBRS-1616: no `webServer`, so nothing said which tree served these pages. This lane
  // drives the stack the operator started by hand (see ENVIRONMENT above), so a foreign
  // tree on the port is the documented state -- the guard must name it, not refuse.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e',
  testMatch: ['**/obrs-1298-stops-modal.spec.ts'],
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'on',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
