/**
 * OBRS-769 census lane (CAPTURE in e2e/lanes.json) -- the gate config with a
 * different testMatch.
 *
 * The gate's `testMatch` is an explicit allow-list on purpose (membership is the
 * claim "this spec needs nothing but a browser"), so a census that only REPORTS
 * does not belong in it. This borrows the same hermetic webServer and viewport
 * and points at the census spec only:
 *
 *   npx playwright test --config=playwright.obrs769.config.ts
 *
 * KEPT rather than deleted with the card. `customer-contrast-allow.ts` cites its
 * output as the argument for deleting $text-lightgrey and keeping
 * $text-lightblack, and that argument is only re-checkable if the thing that
 * produced it still runs. Re-run it before moving either token: the gate prints
 * what FAILS, and the reason this card needed two different fixes for one
 * symptom is entirely in what still PASSED.
 */
import base from './playwright.gate.config';
import { defineConfig } from '@playwright/test';

const PORT = process.env['E2E_GATE_PORT'] ?? '4272';

export default defineConfig({
  ...base,
  testMatch: ['**/obrs-769-census.spec.ts'],
  workers: 1,
  timeout: 600_000,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
