/**
 * OBRS-939 — the admin shell must not wedge the browser's main thread.
 *
 * WHAT WENT WRONG, AND WHY NOTHING ELSE COULD SEE IT
 * `admin-layout.component.html` bound `[routerLinkActiveOptions]` to a METHOD
 * CALL, `navLinkActiveMatch(item)`, which returns a fresh object literal on
 * every change-detection cycle. `RouterLinkActive` compares that input by
 * identity, so its `ngOnChanges` fired every cycle, and its `update()` schedules
 * a MICROTASK. A microtask scheduled during change detection means zone.js's
 * microtask queue is never empty for long, `onMicrotaskEmpty` fires again,
 * `ApplicationRef.tick()` runs again, and the cycle repeats forever. Because the
 * loop lives entirely in microtasks, the renderer never yields to a macrotask:
 * the page paints once and then stops answering input, timers and
 * `page.evaluate` — permanently.
 *
 * Every unit test passed throughout. Karma's `fixture.detectChanges()` runs one
 * cycle by hand; the loop only exists once a real zone is driving ticks, so no
 * `ng test` case could reach it. The component file already carried a comment
 * warning that a GETTER returning a new array "hard-locks the browser" — the
 * defect returned through a method call on the same element, which that comment
 * did not cover and no check enforced.
 *
 * WHAT THIS SPEC ASSERTS, AND WHY IT IS A NUMBER
 * After the shell has rendered, a trivial in-page `page.evaluate` must resolve
 * inside RESPONSE_BUDGET_MS. That is the whole test: "the page looks fine" is
 * exactly what a wedged renderer looks like in a screenshot, since the last
 * paint before the freeze stays on screen. The probe runs after
 * SETTLE_MS, because the freeze does not start at t=0 — measured at 2.6–3.8 s
 * after navigation, so a check that samples immediately passes while broken.
 *
 * POPULATION (OBRS-939 AC-5): /admin/dashboard under three distinct failure
 * modes (abort, 500, 401) plus all five analytics pages that landed with
 * OBRS-151..155. The root cause is in the SHELL, not any one page, so this
 * sweep is deliberately wider than the page the defect was first seen on.
 *
 * Hermetic on the same terms as the rest of the GATE lane: a synthetic session
 * in localStorage and no backend at all.
 */

import { test, expect, Page, Route } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/** How long after navigation to start probing. The wedge began 2.6–3.8 s in. */
const SETTLE_MS = 5_000;
/** OBRS-939 AC-1: the number the acceptance criterion names. */
const RESPONSE_BUDGET_MS = 5_000;

type FailureMode = 'abort' | 'server-error' | 'unauthorized';

/**
 * Replaces the shell helper's abort-everything catch-all for the pages under
 * test. Registered AFTER `seedGateAdminSession`, so it wins — Playwright matches
 * route handlers in reverse registration order.
 */
async function failEveryAuthenticatedCall(page: Page, mode: FailureMode): Promise<void> {
  await page.route('**/api/private/**', (route: Route) => {
    if (mode === 'abort') {
      return route.abort();
    }
    return route.fulfill({
      status: mode === 'server-error' ? 500 : 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: mode === 'server-error' ? 500 : 401, message: 'e2e', data: null }),
    });
  });
}

/**
 * Milliseconds until a trivial in-page evaluate resolved, or -1 if it did not
 * inside `budgetMs`. The dangling evaluate is caught so a wedged page cannot
 * surface as an unhandled rejection after the test has moved on.
 */
async function evaluateRoundTripMs(page: Page, budgetMs: number): Promise<number> {
  const started = Date.now();
  const probe = page
    .evaluate(() => 1)
    .then(() => Date.now() - started)
    .catch(() => -1);
  const expired = new Promise<number>((resolve) => setTimeout(() => resolve(-1), budgetMs));
  return Promise.race([probe, expired]);
}

/**
 * What proves this page did something real, so a responsive BLANK page cannot
 * pass. Two answers, because a 401 legitimately LEAVES the admin shell: OBRS-535's
 * authInterceptor force-logs-out and routes to /login, and asserting nav links
 * there would fail for the right behaviour.
 */
interface AliveControl {
  selector: string;
  expectedPath: string;
}

const SHELL_ALIVE: AliveControl = { selector: '.admin-nav-link', expectedPath: '' };
const LOGGED_OUT_ALIVE: AliveControl = { selector: '.login-form', expectedPath: '/login' };

async function assertShellStaysResponsive(
  page: Page,
  url: string,
  label: string,
  control: AliveControl = SHELL_ALIVE
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Playwright-side wait: it keeps running even while the renderer is wedged,
  // which is precisely what made the freeze so easy to miss.
  await page.waitForTimeout(SETTLE_MS);

  // The responsiveness probe comes FIRST, and the not-vacuous control second —
  // the order is load-bearing, not tidiness. The obvious arrangement (assert the
  // shell rendered, then probe) was written first and produced eight red tests
  // for the WRONG reason: a locator query is evaluated IN the page, so against a
  // wedged renderer it never runs and reports "element(s) not found" — a message
  // that reads like a missing element rather than a frozen browser, and which
  // would send the next reader looking at the nav markup.
  const roundTrip = await evaluateRoundTripMs(page, RESPONSE_BUDGET_MS);
  expect(
    roundTrip,
    `${label}: the renderer stopped answering page.evaluate within ${RESPONSE_BUDGET_MS}ms — ` +
      `the main thread is blocked, so nothing on ${url} responds to a click either ` +
      `(landed on ${page.url()})`
  ).toBeGreaterThanOrEqual(0);

  // Only reachable once the page answers. A responsive BLANK page would satisfy
  // the probe above while proving nothing, so this is what keeps a pass
  // meaningful — and it earned its keep: it caught the 401 arm silently
  // becoming a test of /login the moment the fix let the redirect complete.
  const landed = new URL(page.url()).pathname;
  const expectedPath = control.expectedPath || url;
  expect(landed, `${label}: expected to end up on ${expectedPath}`).toBe(expectedPath);

  const alive = await page.locator(control.selector).count();
  expect(
    alive,
    `${label}: nothing matched ${control.selector} on ${landed}, so the responsiveness probe proved nothing`
  ).toBeGreaterThan(0);
}

test.describe('OBRS-939: the admin shell keeps the main thread responsive', () => {
  test.beforeEach(async ({ page }) => {
    await seedGateAdminSession(page);
  });

  // AC-1: three distinct failure modes, because `route.abort()` is a network
  // error and neither 500 nor 401 is the same event to the app.
  const FAILURE_MODES: FailureMode[] = ['abort', 'server-error', 'unauthorized'];

  for (const mode of FAILURE_MODES) {
    test(`/admin/dashboard stays responsive when every API call fails (${mode})`, async ({
      page,
    }) => {
      await failEveryAuthenticatedCall(page, mode);
      // A 401 is NOT the admin shell staying up: OBRS-535's authInterceptor
      // clears the session and routes to /login, which is the correct product
      // behaviour and was invisible before the fix only because the renderer
      // wedged before the redirect could finish. So this arm still asserts the
      // main thread never blocks — that is the defect — but it asserts it
      // through the forced logout, and says so, rather than quietly measuring
      // whichever page it happened to end on.
      await assertShellStaysResponsive(
        page,
        '/admin/dashboard',
        `dashboard/${mode}`,
        mode === 'unauthorized' ? LOGGED_OUT_ALIVE : SHELL_ALIVE
      );
    });
  }

  // The dashboard was only where this was first seen. The loop is in the shell,
  // so it applies to every page mounted inside it — these five arrived together
  // in OBRS-151..155 and are the pages the card asked to be checked by name.
  const ANALYTICS_PAGES = [
    '/admin/revenue-analytics',
    '/admin/booking-trend',
    '/admin/route-performance',
    '/admin/customer-behavior',
    '/admin/ops-efficiency',
  ];

  for (const path of ANALYTICS_PAGES) {
    test(`${path} stays responsive when every API call fails`, async ({ page }) => {
      await failEveryAuthenticatedCall(page, 'abort');
      await assertShellStaysResponsive(page, path, path);
    });
  }
});
