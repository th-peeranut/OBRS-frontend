/**
 * Playwright config for running the PRE-EXISTING regression suite against
 * port 4202 (where this worktree's branch is served).
 *
 * This is separate from the standard playwright.config.ts (which targets
 * port 4200 — a different worktree's server).  Use this config when you need
 * to verify that the sidebar-hover-expand branch did not break pre-existing
 * flows, since those flows depend on features present in THIS branch but not
 * necessarily in whatever is served at port 4200.
 *
 * --disable-web-security bypasses SIT CORS (origin: localhost:4200 only).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup-4202.ts',
  testDir: './e2e/tests',
  // Exclude the sidebar-specific spec — it has its own config (playwright-sidebar.config.ts)
  testIgnore: ['**/sidebar-hover-expand.spec.ts'],
  timeout: 90_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4202',
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--disable-web-security'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
      },
    },
  ],
});
