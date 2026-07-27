import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-775 geometry evidence. Hermetic -- it needs no backend and no database,
 * because every page it visits is one the GATE lane already reaches with
 * `page.route` fixtures (e2e/support/host-boxes.ts).
 *
 * WHY A SEPARATE CONFIG RATHER THAN A CASE IN THE GATE. A before/after
 * comparison is not a gate: it needs two runs of two different trees, and the
 * BEFORE tree is by definition the one without the fix. This config is run by
 * hand, twice, and its AFTER run is the assertion.
 *
 *   # BEFORE -- with the `:host { display }` additions NOT yet applied
 *   $env:OBRS775_PHASE='before'; npx playwright test --config=playwright.obrs775.config.ts
 *   # apply the fixes, then
 *   $env:OBRS775_PHASE='after';  npx playwright test --config=playwright.obrs775.config.ts
 *
 * The AFTER run reads `e2e-evidence/obrs775-geometry-before.json` and fails on
 * any element whose border box moved. That is the evidence AC3 asks for, made
 * mechanical: the card requires coordinates before and after at the viewports in
 * each component's media queries, and eyeballing a handful of selectors is how
 * you confirm what you already believed. This measures EVERY element on every
 * page at four widths -- roughly 30,000 boxes per phase -- so a regression I
 * introduced somewhere I was not looking has nowhere to hide.
 *
 * `reuseExistingServer: false` on purpose. The two phases differ by a stylesheet
 * edit, and a server left running from the BEFORE phase would serve whatever it
 * had last rebuilt -- which is exactly the shape of a comparison that reports a
 * clean pass because both sides measured the same bundle. Each phase boots its
 * own.
 *
 * `workers: 1`, since the two phases must be comparable and a page's layout is
 * measured against a machine under a known load, not a variable one.
 */

const PORT = process.env['OBRS775_PORT'] ?? '4232';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-775-geometry.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
