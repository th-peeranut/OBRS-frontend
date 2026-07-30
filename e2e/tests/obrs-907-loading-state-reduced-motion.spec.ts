/**
 * OBRS-907 — `prefers-reduced-motion: reduce` must stop the loading-state
 * component's animation WITHOUT the indicator disappearing.
 *
 * WHY THIS IS A PLAYWRIGHT SPEC, NOT A KARMA UNIT TEST
 * `ng test` runs in a real ChromeHeadless browser, but that browser never
 * reports a reduced-motion preference and Karma has no per-spec hook to force
 * one — mocking `window.matchMedia` in a unit test does not change what the
 * ACTUAL stylesheet's `@media (prefers-reduced-motion: reduce)` rule
 * resolves to, since that's evaluated by the browser's CSS engine, not JS.
 * Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })` is the real
 * mechanism the OS-level setting uses, applied to a real page.
 *
 * WHY THE ADMIN NOTIFICATION BELL, NOT THE CUSTOMER TICKET MODAL
 * Both are real `<app-loading-state>` call sites (OBRS-907), but the ticket
 * modal needs an authenticated customer session with a real booking to
 * reach, which this hermetic lane has no fixture for. The admin path here
 * exercises the RISKIER half of the implementation: the `graphic="icon"`
 * mode reuses the pre-existing global `.admin-loading-spinner` rule
 * (`admin-theme.scss`), so `loading-state.component.scss`'s reduced-motion
 * override has to WIN a cross-stylesheet specificity fight (Angular's
 * emulated-encapsulation content attribute vs. the unscoped global rule) —
 * see the comment in that file. The `graphic="ring"` mode (what the ticket
 * modal uses) is entirely self-contained in the same file, behind the exact
 * same `@media` block, so this is the higher-value site to prove live.
 *
 * Hermetic: seeds a synthetic admin session (no live SIT / storageState) and
 * intercepts the one call that matters — `GET .../private/notifications` —
 * with a handler that never resolves, so `NotificationInboxService.loading$`
 * stays `true` and the panel's first-load spinner never races to the empty
 * state. Lane = GATE (see e2e/lanes.json + playwright.gate.config.ts).
 */

import { test, expect } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

test.describe('OBRS-907: <app-loading-state> respects prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await seedGateAdminSession(page);

    // Overrides stubGateAdminShell's own (fast, empty) notifications stub —
    // Playwright matches routes in reverse registration order, so this,
    // registered after seedGateAdminSession, wins. Never fulfilling keeps
    // NotificationInboxService.loading$ === true for the life of the test.
    await page.route(
      (url) => url.pathname.endsWith('/private/notifications'),
      () => new Promise<void>(() => undefined)
    );
  });

  test('the admin notification-bell spinner rotates by default, freezes under reduced motion, and stays visible', async ({
    page,
  }) => {
    // Not asserting expectNoEscapedGateCalls here: /admin redirects to
    // /admin/dashboard, whose own KPI widgets are out of scope for this
    // spec (they fail closed — dashboard renders regardless) and stubbing
    // them would only obscure what this test is actually about.
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const bellTrigger = page.locator('.notification-bell-trigger');
    await bellTrigger.waitFor({ state: 'visible', timeout: 20_000 });
    await bellTrigger.click();

    const spinner = page.locator('.admin-loading-spinner');
    await spinner.waitFor({ state: 'visible', timeout: 10_000 });

    // Positive control (proving-absence-requires-a-positive-control): assert
    // the UN-reduced case actually rotates before trusting the reduced case.
    // Without this, a harness bug that renders no animation at all would
    // pass the "frozen" assertion below vacuously.
    await expect
      .poll(() => spinner.evaluate((el) => getComputedStyle(el).animationName), {
        message: 'spinner should be actively rotating before reduced-motion is requested',
      })
      .toBe('admin-loading-spin');
    expect(await spinner.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('running');

    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect
      .poll(() => spinner.evaluate((el) => getComputedStyle(el).animationName), {
        message:
          'loading-state.component.scss must win the specificity fight against admin-theme.scss\'s ' +
          'un-scoped .admin-loading-spinner rule under prefers-reduced-motion: reduce',
      })
      .toBe('none');

    // Must NOT disappear — a frozen indicator is still a loading signal.
    await expect(spinner).toBeVisible();
    expect(await spinner.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    expect(Number(await spinner.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0);
  });
});
