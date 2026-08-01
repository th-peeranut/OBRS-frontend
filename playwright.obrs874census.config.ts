import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-874 AC-5 — the cookie/localStorage census, taken from the DEPLOYED SIT
 * site rather than from a local serve.
 *
 * That is the whole reason this config exists instead of another entry in
 * playwright.obrs867.config.ts. The names GA4 and Clarity write are a property
 * of the REAL tags answering for REAL IDs; the `analytics-e2e` build carries
 * deliberately invalid ones, so its scripts 404 and write nothing. Measuring
 * there would produce an empty list that looks like an answer — the exact
 * failure OBRS-631 AC-18 forbids ("⛔ ห้ามลอกรายชื่อจากบล็อกในอินเทอร์เน็ต …
 * ค่าที่ไม่ได้วัดเองจะกลายเป็นคำประกาศที่ผิดบนหน้าเว็บ").
 *
 * No `webServer`: the site under test is already deployed. Netlify's SIT build
 * receives GA4_MEASUREMENT_ID / CLARITY_PROJECT_ID as environment variables
 * (scripts/inject-sit-env.js), verified present in the served bundle on
 * 2026-08-01.
 *
 * Not a gate and never will be: it consents to real third-party tags on a real
 * deployment, and its output is a LIST to copy into the privacy notice, not a
 * pass/fail on a number. The only assertions are the two that make the list
 * meaningful — nothing before consent, something after.
 *
 *   npx playwright test --config=playwright.obrs874census.config.ts
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-874-analytics-cookie-census.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'https://sit-obrs-frontend.netlify.app',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
