/**
 * OBRS-618 — a synthetic admin session for the hermetic GATE lane.
 *
 * WHY THIS EXISTS
 * Four specs mocked 100% of their own API traffic and were still not merge-gateable,
 * because each one opened with
 *
 *     test.use({ storageState: '../fixtures/admin-auth.json' })
 *
 * and that file is gitignored, produced only by `e2e/global-setup.ts`, which logs into
 * the **live SIT deployment**. So a test that never touches a backend could still go red
 * because Koyeb was cold-starting. `playwright.gate.config.ts` refuses `globalSetup` for
 * exactly that reason, which left those specs stranded in the GATE-BLOCKED lane.
 *
 * WHY A REAL JWT WAS NEVER NEEDED — the evidence, since the card guessed otherwise
 * `staff-sell-walkin.spec.ts` carried a comment claiming a fake token "changes
 * behaviour", and OBRS-618 hypothesised that something decodes the JWT's claims. It does
 * not. `AuthService` (src/app/auth/auth.service.ts) treats the token as an opaque string:
 * `isAuthenticated()` is `!!getToken()`, and roles come from a **separate** `auth_roles`
 * localStorage key, not from the token. Nothing in `src/app` decodes a JWT at all
 * (no `jwt-decode`, no `JSON.parse(atob(...))`).
 *
 * What actually broke those specs is the OBRS-535 mechanism, and the comment in
 * `staff-sell-walkin` says so in its own words: a fake token on a **non-mocked**
 * authenticated call gets a real **401** from SIT, and one 401 is enough for
 * `authInterceptor.handleUnauthorized()` to clear the session and bounce to `/login`
 * before the assertion runs. The token was never the problem; the unmocked call was.
 *
 * And that mechanism cannot fire in the GATE lane: it serves the app with the default
 * (local) configuration, so `apiUrl` is `http://localhost:8080` where nothing listens.
 * An unmocked call gets a network error, never a 401 — so it can never force-logout. It
 * fails as itself, which is the whole point of the lane.
 *
 * WHAT `stubGateAdminShell` COVERS
 * `AdminLayoutComponent.ngOnInit` fires boot-time calls no individual spec asked for
 * (notification polling from OBRS-317, the sidebar usability-report badge). They are
 * stubbed here so a spec only exercises what it deliberately stubbed, and anything else
 * authenticated is **aborted and recorded** rather than allowed out — `expectNoEscapedGateCalls`
 * then turns an escape into a failure that names the call, instead of a timeout somewhere
 * unrelated. This mirrors `report-usability-issue.spec.ts`, which proved the pattern.
 *
 * Registration order matters: the catch-all goes first, because Playwright matches routes
 * in REVERSE registration order — so a spec's own later, narrower stub still wins.
 */

import { expect, Page } from '@playwright/test';

const EMPTY_PAGE_RESPONSE = { code: 200, message: 'OK', data: { content: [], totalElements: 0 } };

const ADMIN_REPORTS_PATH = '/private/admin/usability-reports';

/** `AdminLayoutComponent`'s sidebar badge count probe — same endpoint, `size=1`. */
const isAdminBadgeCall = (url: URL): boolean =>
  url.pathname.endsWith(ADMIN_REPORTS_PATH) && url.searchParams.get('size') === '1';

/** Authenticated calls that reached the catch-all, per page. */
const escapedCalls = new WeakMap<Page, string[]>();

export interface GateAdminSessionOptions {
  username?: string;
  roles?: string[];
  language?: string;
}

/**
 * Seeds a synthetic admin session into localStorage before Angular boots, and stubs the
 * admin shell's own boot-time traffic. Call it from `test.beforeEach` — the values land
 * via `addInitScript`, so they are origin-independent and survive whatever port the gate
 * config was given (`E2E_GATE_PORT`). A committed `storageState` JSON could not do that:
 * its `origins` array is keyed by an absolute origin, so it would silently apply to
 * nothing the day someone changed the port.
 */
export async function seedGateAdminSession(
  page: Page,
  options: GateAdminSessionOptions = {}
): Promise<void> {
  const username = options.username ?? 'admin@system.local';
  const roles = options.roles ?? ['admin'];
  const language = options.language ?? 'en';

  await page.addInitScript(
    ({ user, roleList, lang }) => {
      localStorage.setItem('app_language', lang);
      // Only needs to be a non-empty string: AuthService.isAuthenticated() is
      // !!getToken() and nothing decodes it.
      localStorage.setItem('auth_token', 'e2e-gate-admin-token');
      localStorage.setItem('auth_username', user);
      localStorage.setItem('auth_roles', JSON.stringify(roleList));
    },
    { user: username, roleList: roles, lang: language }
  );

  await stubGateAdminShell(page);
}

/**
 * Stubs the admin shell's boot-time calls and aborts (recording) anything else
 * authenticated. Exported separately for a spec that seeds its session some other way.
 */
export async function stubGateAdminShell(page: Page): Promise<void> {
  const escaped: string[] = [];
  escapedCalls.set(page, escaped);

  // Backstop first — see the registration-order note in the file header.
  await page.route('**/api/private/**', (route) => {
    escaped.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });

  await page.route(isAdminBadgeCall, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_PAGE_RESPONSE),
    })
  );

  await page.route('**/private/notifications/unread-count', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'OK', data: { unreadCount: 0 } }),
    })
  );

  await page.route(
    (url) => url.pathname.endsWith('/private/notifications'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE_RESPONSE),
      })
  );

  // OBRS-193: `SellPageComponent.ngOnInit` fetches the salesperson's assigned pickup
  // stop and maps a failure to `null`. Every admin page that mounts the staff shell
  // issues it, so it belongs here rather than in any one spec.
  // `endsWith`, not a glob: `/private/users/me/email/change-request` must not match.
  await page.route(
    (url) => url.pathname.endsWith('/private/users/me'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data: { salesPointStop: null } }),
      })
  );
}

/**
 * The walk-in sell page's own boot traffic — the calls it fires on mount and on
 * trip-row selection, which no spec stubbed because against live SIT they simply
 * succeeded. OBRS-618 found them by aborting-and-recording: `/private/route-stops/{slug}`,
 * `/private/schedules/{id}` and `/private/schedules/{id}/boarding-list` were escaping from
 * `focus-retention`, `stop-filter-route-pair` and `trip-details-edit` alike, even though
 * all three describe themselves as fully mocked.
 *
 * The bodies are deliberately EMPTY rather than invented. Each of these consumers is
 * written to tolerate no data, and says so in `sell-page.component.ts`:
 * `getMe` maps failure to `null`, `routeStops?.data?.stops ?? []` with "stops missing
 * from route-stops sort last ... an incomplete route-stops set never scrambles the known
 * sequence", and `getScheduleById`'s error branch "keeps fallback values silently".
 * Fabricating plausible-looking rows here would put page state under the assertions that
 * no server ever produced — the one thing worse than the abort this replaces.
 *
 * Call it after {@link seedGateAdminSession} and before the spec's own stubs: Playwright
 * matches handlers in reverse registration order, so a spec that needs a real schedule
 * detail (e.g. `trip-details-edit`'s edit form) still wins with its own later handler.
 */
export async function stubWalkInSellShell(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.includes('/private/route-stops/'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data: { stops: [] } }),
      })
  );

  await page.route(
    (url) => /\/private\/schedules\/\d+\/boarding-list$/.test(url.pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data: [] }),
      })
  );

  // Numeric id only — `/private/schedules/walk-in` is a different endpoint that every
  // one of these specs fulfils itself, and a looser matcher would swallow it.
  await page.route(
    (url) => /\/private\/schedules\/\d+$/.test(url.pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data: null }),
      })
  );
}

/**
 * Fails the test — **by name** — if an authenticated call reached the catch-all instead
 * of a stub. Without this, an escape shows up as an unexplained timeout: the request
 * simply fails and whatever the page needed never renders. Pages that never seeded a
 * session are not instrumented, so this is a no-op for them.
 */
export function expectNoEscapedGateCalls(page: Page): void {
  const escaped = escapedCalls.get(page);
  if (!escaped) return;
  expect(escaped, 'authenticated call(s) were not stubbed by this spec').toEqual([]);
}
