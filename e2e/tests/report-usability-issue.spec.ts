/**
 * QA: Report a Usability Issue — E2E + Regression
 *
 * Coverage:
 *  1. FAB presence on home, search/booking, and anonymous routes
 *  2. Modal open/close behaviour — synchronous open, scroll lock/unlock
 *  3. Form validation — empty / whitespace-only description blocks submit
 *  4. Image client pre-checks — too-many, too-large, wrong type
 *  5. errorCode mapping (stubbed) — REPORT_RATE_LIMITED → specific message
 *  6. Success flow (stubbed) — 201 receipt → toast + modal close
 *  7. i18n — Thai and Chinese translations rendered (no raw KEY.PATH text)
 *  8. Admin triage (stubbed) — empty state, populated rows, detail modal, status save
 *  9. Regression — FAB z-index / overlap on seat-picker, lang-switcher, existing flows
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';
import { seedAnalyticsConsent } from '../support/analytics-consent';

// ── Constants ─────────────────────────────────────────────────────────────────

const USABILITY_ENDPOINT = '**/api/usability-reports';
// OBRS-535: these were globs, and a route glob is compiled to an END-ANCHORED
// regex (`globToRegexPattern` appends `$`). `**/private/admin/usability-reports`
// therefore could NEVER match the real request, which always carries
// `?page=&size=&status=&sort=` — so every "stubbed" admin call escaped to the
// live SIT backend, came back 401 on the fake token, and `authInterceptor`
// force-logged-out the page before any assertion ran. Predicate matchers read
// the parsed URL, so the query string can't silently break them again.
const ADMIN_REPORTS_PATH = '/private/admin/usability-reports';

/**
 * The triage page's own list GET. Excludes the sidebar badge's count probe
 * below, which hits the SAME endpoint — without this split, the badge call
 * would be counted as a page load by call-counting stubs (the status-save
 * test serves a different body on the 2nd list GET).
 */
const isAdminListCall = (url: URL): boolean =>
  url.pathname.endsWith(ADMIN_REPORTS_PATH) && url.searchParams.get('size') !== '1';

/** `AdminLayoutComponent`'s sidebar badge count — same endpoint, `size=1`. */
const isAdminBadgeCall = (url: URL): boolean =>
  url.pathname.endsWith(ADMIN_REPORTS_PATH) && url.searchParams.get('size') === '1';

const RECEIPT_STUB = {
  id: 'stub-receipt-id',
  category: 'bug',
  status: 'new',
  imageCount: 0,
  createdAt: '2026-06-30T00:00:00Z',
};

const REPORT_LIST_STUB = {
  code: 200,
  message: 'OK',
  data: {
    content: [
      {
        id: 'rep-001',
        category: 'bug',
        status: 'new',
        userId: null,
        descriptionPreview: 'Button not working on mobile',
        imageCount: 2,
        createdAt: '2026-06-30T06:00:00Z',
      },
      {
        id: 'rep-002',
        category: 'suggestion',
        status: 'in_review',
        userId: 42,
        descriptionPreview: 'Add dark mode',
        imageCount: 0,
        createdAt: '2026-06-29T10:00:00Z',
      },
    ],
    totalElements: 2,
  },
};

const REPORT_DETAIL_STUB = {
  code: 200,
  message: 'OK',
  data: {
    id: 'rep-001',
    category: 'bug',
    status: 'new',
    userId: null,
    description: 'Button not working on mobile devices when screen width is 375px.',
    descriptionPreview: 'Button not working on mobile',
    routeUrl: '/home',
    userAgent: 'Mozilla/5.0 (Playwright)',
    imageCount: 0,
    images: [],
    createdAt: '2026-06-30T06:00:00Z',
  },
};

const EMPTY_PAGE_RESPONSE = { code: 200, message: 'OK', data: { content: [], totalElements: 0 } };

/** Authenticated calls that reached the catch-all in `stubAdminShell`, per page. */
const escapedPrivateCalls = new WeakMap<Page, string[]>();

/**
 * Fails the test — by name — if an admin spec let an authenticated call through
 * to the live SIT backend. Pages that never called `injectAdminAuth` are not
 * instrumented, so this is a no-op for them.
 */
function expectNoEscapedPrivateCalls(page: Page): void {
  const escaped = escapedPrivateCalls.get(page);
  if (!escaped) return;
  expect(escaped, 'authenticated call(s) reached live SIT instead of a stub').toEqual([]);
}

/**
 * Stubs every OTHER authenticated call the admin shell fires on boot, so the
 * only thing an admin spec exercises is what it deliberately stubbed.
 *
 * `AdminLayoutComponent.ngOnInit` starts `NotificationInboxService` polling
 * (OBRS-317, landed 2026-07-14 — two weeks AFTER this spec was written) and
 * fetches the sidebar usability-report badge count. Neither was stubbed, both
 * 401 against live SIT on the fake token, and one 401 is enough for
 * `authInterceptor.handleUnauthorized()` to clear the session and redirect to
 * `/login` — which is why all six admin specs died on a session-expiry dialog
 * instead of their own assertion. (OBRS-535)
 *
 * Registered FIRST (from `injectAdminAuth`) on purpose: Playwright matches
 * routes in reverse registration order, so a test's own later, narrower stub
 * still wins.
 */
async function stubAdminShell(page: Page): Promise<void> {
  // Backstop, registered before everything else so any narrower stub still
  // wins: an authenticated call nobody stubbed is ABORTED rather than allowed
  // out to live SIT. Aborting yields a network error, not a 401, so it can
  // never trigger the force-logout that hid this class of bug for two weeks —
  // and `expectNoEscapedPrivateCalls` turns it into a named failure. (OBRS-535)
  const escaped: string[] = [];
  escapedPrivateCalls.set(page, escaped);
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
}

/**
 * Inject fake admin auth into localStorage before Angular boots, and stub the
 * admin shell's own boot-time calls (see `stubAdminShell` — without them the
 * fake token triggers a real 401 and a forced logout).
 */
async function injectAdminAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    // auth_token only needs to be a non-empty string for isAuthenticated() to return true
    localStorage.setItem('auth_token', 'qa-fake-admin-token');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  });
  await stubAdminShell(page);
}

/** Stub admin API list to return the provided response. */
async function stubAdminList(page: Page, response: unknown): Promise<void> {
  await page.route(isAdminListCall, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    } else {
      // `fallback()`, never `continue()`: `continue()` sends the request
      // straight to the network, skipping every remaining handler INCLUDING
      // the catch-all abort in `stubAdminShell` — a non-GET here would escape
      // to live SIT unrecorded, which is the exact hole this card closed on
      // the GET path. `fallback()` re-enters handler matching. (OBRS-535)
      route.fallback();
    }
  });
}

// OBRS-882. File-scope, so it reaches every describe below rather than the four that
// happened to go red. The FAB lives at `z-index: 900` in the bottom-right corner and
// OBRS-867's consent banner sits at `z-index: 1000` across the bottom edge — its SCSS
// says outranking the FAB was the intent, "while the question is unanswered this one is
// the more urgent". So on a fresh context the FAB is genuinely unclickable, and eleven
// cases here failed as `locator.click` timeouts naming `.report-fab`. Seeding a settled
// answer puts these tests back on the layout a returning visitor sees, which is the one
// they were written against. The banner-up state is covered by
// analytics-consent-banner.spec.ts instead of being every spec's problem.
test.beforeEach(async ({ page }) => {
  await seedAnalyticsConsent(page);
});

/**
 * OBRS-942. The two FAB-overlap cases below measure `boundingBox()` on the first
 * `.select-btn`, and `waitFor({ state: 'visible' })` is not enough to make that
 * measurement mean anything: /schedule-booking resolves its search behind
 * `AlertService.showLoading()`, whose `.swal2-container` overlay is up while the
 * schedule list is still growing underneath it. Measured too early, the first
 * card sits at the very bottom of the viewport — exactly where the FAB lives —
 * and the assertion reads a position the traveler never sees.
 *
 * This went red on CI for the first time on the OBRS-942 merge (`c0338518`,
 * run 30700904986): the failure screenshot shows the "Loading..." spinner still
 * on screen with the Select button half-rendered at y≈690 of a 720px viewport.
 * Nothing in that card touches this page — it added 7 tests to a 2-worker lane
 * (149 → 156, 6.2m → 6.6m measured), and the extra contention was enough to lose
 * a race that had always been there. Same shape as OBRS-767.
 *
 * Waits for the precondition rather than sleeping: a `waitForTimeout` tuned on
 * one runner is the same bug with a longer fuse, and every spec that later joins
 * this lane would have to re-tune it.
 *
 * Proved non-vacuous rather than assumed: `waitFor({ state: 'hidden' })` also
 * resolves instantly against an element that never existed, so the overlay was
 * pinned first with a throwaway `state: 'visible'` probe in the same position —
 * it passed on BOTH cases locally, i.e. the dialog really is up here and this
 * wait has something to wait for.
 */
async function settleScheduleList(page: Page): Promise<void> {
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.locator('.select-btn').first().waitFor({ state: 'visible', timeout: 15_000 });
}

// ── Section 1: FAB visibility ─────────────────────────────────────────────────

test.describe('FAB — visibility on all routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    // Stub stops and schedules so pages load without needing the real backend
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.route('**/api/schedules/search', (route) => route.fulfill({ json: schedulesFixture }));
  });

  test('FAB is visible on the home page (anonymous)', async ({ page }) => {
    await page.goto('/');
    const fab = page.locator('.report-fab');
    await fab.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(fab).toBeVisible();
  });

  test('FAB is visible on the schedule-booking page (anonymous)', async ({ page }) => {
    // Navigate through the booking funnel so Angular's router lands on /schedule-booking
    await page.goto('/');
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').waitFor();
    await page.locator('#dropdownObrsPassenger').click();
    await page.getByAltText('Passenger Add Icon').first().click();
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').click();
    await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'Nong Sak' }).click();
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]').click();
    await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'Bangkok' }).click();
    await page.locator('.btn-search').click();
    await page.waitForURL('**/schedule-booking');

    const fab = page.locator('.report-fab');
    await fab.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(fab).toBeVisible();
  });

  test('FAB is visible on the login page (logged-out route)', async ({ page }) => {
    await page.goto('/login');
    const fab = page.locator('.report-fab');
    await fab.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(fab).toBeVisible();
  });
});

// ── Section 2: Modal open / close behaviour ───────────────────────────────────

test.describe('FAB modal — open, defaults, close', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.goto('/');
    await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('modal opens synchronously on FAB click (no fetch gating)', async ({ page }) => {
    // Listen for any network request to the usability endpoint BEFORE clicking
    let networkRequestFired = false;
    page.on('request', (req) => {
      if (req.url().includes('usability-reports')) networkRequestFired = true;
    });

    await page.locator('.report-fab').click();

    // Modal must be visible in the same tick — no wait for network
    const modal = page.locator('.report-modal-backdrop');
    await expect(modal).toBeVisible();

    // No HTTP call to usability-reports endpoint should have been made on modal open
    expect(networkRequestFired).toBe(false);
  });

  test('category defaults to "bug" (select button first option selected)', async ({ page }) => {
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });

    // OBRS-915: `aria-pressed`, not `aria-checked`. The comment this replaces
    // said PrimeNG marks the selection with `aria-checked` "for selectbutton
    // role=radio", and both halves are now wrong — v19's SelectButton renders
    // each option as a `<p-togglebutton>` host with `[attr.aria-pressed]="checked"`
    // and no `aria-checked` at all (the container's role was `group`, never
    // `radio`, in v17 as well). Read off the host bindings in
    // `node_modules/primeng/fesm2022/primeng-togglebutton.mjs`, not the docs.
    //
    // The attribute is asserted rather than the `.p-togglebutton-checked` class
    // beside it because what this test is for is the DEFAULT being announced to
    // a screen reader; a class is styling and would still "pass" if the state
    // reached nobody.
    const bugButton = page.locator('p-selectbutton .p-togglebutton', { hasText: 'Bug' });
    await bugButton.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(bugButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('close button hides modal and unlocks body scroll', async ({ page }) => {
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });

    // Verify body is scroll-locked
    const overflowBefore = await page.evaluate(() => document.body.style.overflow);
    expect(overflowBefore).toBe('hidden');

    // Click close
    await page.locator('.report-modal__close').click();
    await expect(page.locator('.report-modal-backdrop')).not.toBeVisible();

    // Body scroll should be restored
    const overflowAfter = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfter).toBe('');
  });

  test('backdrop click closes modal', async ({ page }) => {
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });

    // Click on the backdrop (not the modal itself) at corner coordinates
    await page.locator('.report-modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.report-modal-backdrop')).not.toBeVisible();
  });
});

// ── Section 3: Validation — empty / whitespace description ────────────────────

test.describe('FAB modal — description validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.goto('/');
    await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });
  });

  test('empty description → shows required message and dispatches NO HTTP request', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => { if (req.url().includes('usability-reports')) requests.push(req.url()); });

    // Click submit without filling description
    await page.locator('.report-modal button[type="submit"]').click();

    // Error message must appear
    await expect(page.locator('.report-field__error', { hasText: 'Description is required.' })).toBeVisible();

    // No HTTP call should have been made
    expect(requests).toHaveLength(0);
  });

  test('whitespace-only description → dispatches NO HTTP request (submit blocked)', async ({ page }) => {
    // QA DEFECT NOTE: The acceptance criterion states the "Description is required."
    // error message SHOULD also appear for whitespace-only input. However the current
    // implementation does not satisfy this: Angular's Validators.required passes
    // whitespace-only strings (it checks value.length, not value.trim().length), and
    // onSubmit() only calls markAsTouched() without setErrors({required:true}), so
    // descriptionInvalid (which guards the error div via ctrl.invalid) stays false.
    // The HTTP-blocking half of the criterion IS implemented correctly and is tested
    // here. The display half is tracked as a defect for the developer to fix by calling
    // ctrl.setErrors({ required: true }) alongside markAsTouched() in onSubmit().
    const requests: string[] = [];
    page.on('request', (req) => { if (req.url().includes('usability-reports')) requests.push(req.url()); });

    await page.locator('#report-description').fill('   ');
    await page.locator('.report-modal button[type="submit"]').click();

    // The modal stays open and no HTTP request is dispatched
    await expect(page.locator('.report-modal-backdrop')).toBeVisible();
    expect(requests).toHaveLength(0);
  });
});

// ── Section 4: Image client-side pre-checks ───────────────────────────────────

test.describe('FAB modal — image client-side pre-checks', () => {
  let tmpDir: string;

  test.beforeEach(async ({ page }) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-img-'));

    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.goto('/');
    await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });
  });

  test.afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('selecting more than 5 files shows TOO_MANY error', async ({ page }) => {
    // Create 6 tiny valid JPEG-named files
    const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
    for (let i = 0; i < 6; i++) {
      const filePath = path.join(tmpDir, `img${i}.jpg`);
      // minimal 1×1 JPEG bytes (valid enough for mime-type)
      fs.writeFileSync(filePath, Buffer.from('ffd8ffe000104a4649460001', 'hex'));
      files.push({ name: `img${i}.jpg`, mimeType: 'image/jpeg', buffer: fs.readFileSync(filePath) });
    }

    const fileInput = page.locator('.report-file-input');
    await fileInput.setInputFiles(files);

    await expect(
      page.locator('.report-field__error', { hasText: 'You can attach up to 5 images only.' })
    ).toBeVisible();
  });

  test('selecting a file over 5 MB shows TOO_LARGE error', async ({ page }) => {
    const bigFile = path.join(tmpDir, 'big.jpg');
    // Write exactly 5 MB + 1 byte
    fs.writeFileSync(bigFile, Buffer.alloc(5 * 1024 * 1024 + 1, 0xff));

    const fileInput = page.locator('.report-file-input');
    await fileInput.setInputFiles([{ name: 'big.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(bigFile) }]);

    await expect(
      page.locator('.report-field__error', { hasText: 'One or more images exceed the 5 MB limit.' })
    ).toBeVisible();
  });

  test('selecting a non-image file (PDF) shows INVALID_TYPE error', async ({ page }) => {
    const pdfFile = path.join(tmpDir, 'doc.pdf');
    fs.writeFileSync(pdfFile, Buffer.from('%PDF-1.4 dummy'));

    const fileInput = page.locator('.report-file-input');
    await fileInput.setInputFiles([{ name: 'doc.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(pdfFile) }]);

    await expect(
      page.locator('.report-field__error', { hasText: 'Only JPEG, PNG, WebP, and GIF images are allowed.' })
    ).toBeVisible();
  });
});

// ── Section 5: errorCode mapping ─────────────────────────────────────────────

test.describe('FAB modal — errorCode mapping (stubbed)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.goto('/');
    await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });
  });

  test('429 with REPORT_RATE_LIMITED → shows rate-limited localized message (NOT generic)', async ({ page }) => {
    // Stub the endpoint to return 429 with REPORT_RATE_LIMITED errorCode
    await page.route(USABILITY_ENDPOINT, (route) => {
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ errorCode: 'REPORT_RATE_LIMITED', message: 'Rate limited' }),
      });
    });

    await page.locator('#report-description').fill('Test description for rate limit check');
    await page.locator('.report-modal button[type="submit"]').click();

    // Must show the specific rate-limited message, not the generic one
    const expectedMsg = 'You have submitted too many reports recently. Please wait before trying again.';
    await expect(page.locator('.report-submit-error')).toContainText(expectedMsg, { timeout: 10_000 });

    // Modal must stay open (not close on error)
    await expect(page.locator('.report-modal-backdrop')).toBeVisible();
  });

  test('401 with no recognized errorCode → shows GENERIC message', async ({ page }) => {
    await page.route(USABILITY_ENDPOINT, (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
    });

    await page.locator('#report-description').fill('Test description for generic error');
    await page.locator('.report-modal button[type="submit"]').click();

    await expect(page.locator('.report-submit-error')).toContainText(
      'Something went wrong. Please try again.',
      { timeout: 10_000 }
    );
  });
});

// ── Section 6: Success flow ───────────────────────────────────────────────────

test.describe('FAB modal — success flow (stubbed)', () => {
  test('201 response → success toast + modal closes', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));

    // Stub the submit endpoint to return 201
    await page.route(USABILITY_ENDPOINT, (route) => {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(RECEIPT_STUB),
      });
    });

    await page.goto('/');
    await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('.report-fab').click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });

    await page.locator('#report-description').fill('Everything looks great but this button is odd');
    await page.locator('.report-modal button[type="submit"]').click();

    // Modal must close
    await expect(page.locator('.report-modal-backdrop')).not.toBeVisible({ timeout: 10_000 });

    // Success toast must appear (SweetAlert2 or the app's AlertService)
    // AlertService typically renders a SweetAlert — wait for it
    const toast = page.locator('.swal2-popup, .swal2-toast');
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(toast).toContainText('report');
  });
});

// ── Section 7: i18n ───────────────────────────────────────────────────────────

test.describe('FAB + modal — i18n translations', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
  });

  test('Thai (th): FAB label and modal title are translated', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'th'); });
    await page.goto('/');

    const fab = page.locator('.report-fab');
    await fab.waitFor({ state: 'visible', timeout: 15_000 });

    // FAB label should be Thai, not the key
    const fabLabel = page.locator('.report-fab__label');
    await expect(fabLabel).toContainText('รายงานปัญหา');
    await expect(fabLabel).not.toContainText('USABILITY_REPORT');

    // Open modal and verify title
    await fab.click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });
    await expect(page.locator('.report-modal__title')).toContainText('รายงานปัญหาการใช้งาน');
    await expect(page.locator('.report-modal__title')).not.toContainText('USABILITY_REPORT');
  });

  test('Chinese (zh): FAB label and modal title are translated', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'zh'); });
    await page.goto('/');

    const fab = page.locator('.report-fab');
    await fab.waitFor({ state: 'visible', timeout: 15_000 });

    const fabLabel = page.locator('.report-fab__label');
    await expect(fabLabel).toContainText('报告问题');
    await expect(fabLabel).not.toContainText('USABILITY_REPORT');

    await fab.click();
    await page.locator('.report-modal').waitFor({ state: 'visible' });
    await expect(page.locator('.report-modal__title')).toContainText('报告可用性问题');
    await expect(page.locator('.report-modal__title')).not.toContainText('USABILITY_REPORT');
  });
});

// ── Section 8: Admin triage page (stubbed) ────────────────────────────────────

test.describe('Admin usability-reports triage page (stubbed)', () => {
  test.afterEach(({ page }) => expectNoEscapedPrivateCalls(page));

  test('GET returns empty list → empty-state row renders (not error)', async ({ page }) => {
    await injectAdminAuth(page);

    const emptyResponse = {
      code: 200,
      message: 'OK',
      data: { content: [], totalElements: 0 },
    };
    await stubAdminList(page, emptyResponse);

    await page.goto('/admin/usability-reports');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.admin-table td', { hasText: 'No usability reports found.' })).toBeVisible({
      timeout: 15_000,
    });
    // Should NOT show an error state
    await expect(page.locator('p.admin-muted', { hasText: 'Failed to load' })).not.toBeVisible();
  });

  test('GET populated list → rows render with TRANSLATED status labels (not raw enum)', async ({ page }) => {
    await injectAdminAuth(page);
    await stubAdminList(page, REPORT_LIST_STUB);

    await page.goto('/admin/usability-reports');
    await page.waitForLoadState('networkidle');

    const table = page.locator('table.admin-table');
    await table.waitFor({ state: 'visible', timeout: 15_000 });

    // First row: status is 'new' → must show translated "New", not raw "new"
    const firstStatusBadge = table.locator('tbody tr').first().locator('.admin-status');
    await expect(firstStatusBadge).toHaveText('New');

    // Second row: status is 'in_review' → "In Review"
    const secondStatusBadge = table.locator('tbody tr').nth(1).locator('.admin-status');
    await expect(secondStatusBadge).toHaveText('In Review');

    // Usability Reports nav item must appear in admin sidebar
    const navItem = page.locator('[routerLink*="usability-reports"], a[href*="usability-reports"]');
    await expect(navItem.first()).toBeVisible();
  });

  test('clicking View opens detail modal with report data', async ({ page }) => {
    await injectAdminAuth(page);
    await stubAdminList(page, REPORT_LIST_STUB);

    // Opening a 'new' report silently auto-promotes it to 'in_review'
    // (`autoPromoteToInReview`, OBRS-370) — a PUT this test never asked for.
    // It has to be stubbed or it reaches the real backend. (OBRS-535)
    await page.route('**/private/admin/usability-reports/rep-001/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data: null }),
      })
    );

    // Stub the detail endpoint for rep-001
    await page.route('**/private/admin/usability-reports/rep-001', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(REPORT_DETAIL_STUB),
        });
      } else {
        route.fallback(); // OBRS-535: fallback, not continue (see stubAdminList)
      }
    });

    await page.goto('/admin/usability-reports');
    await page.waitForLoadState('networkidle');
    await page.locator('table.admin-table').waitFor({ state: 'visible', timeout: 15_000 });

    // Click "View" on the first row
    const viewBtn = page.locator('table.admin-table tbody tr').first().locator('.admin-btn', { hasText: 'View' });
    await viewBtn.click();

    const detailModal = page.locator('.admin-modal.ur-detail-modal');
    await detailModal.waitFor({ state: 'visible', timeout: 10_000 });

    // Detail should show the description
    await expect(detailModal.locator('.ur-description-text')).toContainText('Button not working on mobile');
    // Route URL should be displayed
    await expect(detailModal).toContainText('/home');
  });

  test('status save: stub PUT → optimistic update + success toast', async ({ page }) => {
    await injectAdminAuth(page);

    // The component calls store.refresh() after the PUT succeeds, triggering a second
    // GET to the list endpoint. We track the call count so we can return the original
    // list on the first call (page load) and the updated list on the second call (post-save
    // refresh), preserving the optimistic update semantics under test.
    let listGetCount = 0;
    const updatedListStub = {
      ...REPORT_LIST_STUB,
      data: {
        ...REPORT_LIST_STUB.data,
        content: [
          // OBRS-1473: 'accepted', not 'resolved'. rep-001 is 'new', and the backend's
          // ALLOWED_TRANSITIONS has no new -> resolved edge, so the save this test used to
          // drive would have answered 400 REPORT_INVALID_TRANSITION against a real server —
          // it only passed because the dropdown offered every status regardless of the
          // current one (that is the bug this card fixes) and the PUT here is stubbed 200.
          { ...REPORT_LIST_STUB.data.content[0], status: 'accepted' as const },
          REPORT_LIST_STUB.data.content[1],
        ],
      },
    };

    await page.route(isAdminListCall, (route) => {
      if (route.request().method() === 'GET') {
        listGetCount++;
        const body = listGetCount === 1 ? REPORT_LIST_STUB : updatedListStub;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      } else {
        route.fallback(); // OBRS-535: fallback, not continue (see stubAdminList)
      }
    });

    // Stub detail for rep-001
    await page.route('**/private/admin/usability-reports/rep-001', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(REPORT_DETAIL_STUB),
        });
      } else {
        route.fallback(); // OBRS-535: fallback, not continue (see stubAdminList)
      }
    });

    // Stub the status PUT endpoint
    let putCalled = false;
    await page.route('**/private/admin/usability-reports/rep-001/status', (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        putCalled = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, message: 'OK', data: null }),
        });
      } else {
        route.fallback(); // OBRS-535: fallback, not continue (see stubAdminList)
      }
    });

    await page.goto('/admin/usability-reports');
    await page.waitForLoadState('networkidle');
    await page.locator('table.admin-table').waitFor({ state: 'visible', timeout: 15_000 });

    // Open detail modal
    const viewBtn = page.locator('table.admin-table tbody tr').first().locator('.admin-btn', { hasText: 'View' });
    await viewBtn.click();
    await page.locator('.admin-modal.ur-detail-modal').waitFor({ state: 'visible', timeout: 10_000 });

    // Change status via the detail modal's dropdown to "accepted" — a LEGAL edge out of
    // 'new' (OBRS-1473; the dropdown is source-aware now, so an illegal target is not on
    // offer to click at all).
    const statusDropdown = page.locator('.ur-detail-modal .ur-status-controls app-admin-dropdown');
    await statusDropdown.locator('.admin-dropdown-trigger').click();
    const acceptedOpt = statusDropdown.locator('.admin-dropdown-option', { hasText: 'Accepted' });
    await acceptedOpt.waitFor({ state: 'visible', timeout: 5_000 });
    await acceptedOpt.click();

    // Save. Selected structurally, not by label: the copy behind
    // `ADMIN.USABILITY_REPORTS.STATUS.SAVE` has since changed from "Save
    // Status" to "Save", and the old hasText filter silently matched nothing.
    // The assertion under test is the optimistic update, not the button's
    // wording. (OBRS-535)
    const saveBtn = page.locator('.ur-detail-modal .ur-status-controls .admin-btn-primary');
    await saveBtn.click();

    // Verify PUT was called
    await page.waitForFunction(() => true); // allow micro-task queue to flush
    expect(putCalled).toBe(true);

    // After the save + refresh, the table must now show "Accepted" (from the second GET stub)
    const firstStatusBadge = page.locator('table.admin-table tbody tr').first().locator('.admin-status');
    await expect(firstStatusBadge).toHaveText('Accepted', { timeout: 10_000 });
  });

  test('"Usability Reports" appears in admin sidebar nav', async ({ page }) => {
    await injectAdminAuth(page);
    await stubAdminList(page, { code: 200, message: 'OK', data: { content: [], totalElements: 0 } });

    await page.goto('/admin/usability-reports');
    // Use domcontentloaded so we don't wait for SIT API calls
    await page.waitForLoadState('domcontentloaded');

    // The admin-layout renders nav items as <a class="admin-nav-link" [routerLink]="item.path">.
    // In rail (collapsed) mode the label span is visually hidden via CSS but the element IS in
    // the DOM. Use href attribute to find the nav item without depending on visual expansion.
    const navLink = page.locator('aside.admin-sidebar nav a.admin-nav-link[href$="usability-reports"]');
    await expect(navLink).toBeAttached({ timeout: 10_000 });
    // Verify the active class is applied because we're on the usability-reports route
    await expect(navLink).toHaveClass(/active/);
  });
});

// ── Section 9: Regression — FAB does NOT obstruct existing UI ─────────────────

test.describe('Regression — FAB z-index / overlap', () => {
  test.afterEach(({ page }) => expectNoEscapedPrivateCalls(page));

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('app_language', 'en'); });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.route('**/api/schedules/search', (route) => route.fulfill({ json: schedulesFixture }));
  });

  /**
   * OBRS-1207 — THE OCCLUSION CLAIM HAS LEFT THIS FILE.
   *
   * Three cases used to live here asserting the FAB "does not obstruct" some
   * element, and all three did it by comparing the FAB's `boundingBox()` with
   * the victim's while never pinning the scroll position. The FAB is
   * `position: fixed` and every victim scrolls, so the comparison's result was a
   * function of where the page happened to come to rest, not of the code.
   *
   * Not an argument — measured. The byte-identical tree `098022f8` PASSED on
   * PR #167, went RED on the `dev` merge `8c43dcec`, and passed 6/6 locally;
   * and the pair had been green for months while `.select-btn` really was
   * losing its click. The resting offset itself was traced to Bootstrap's
   * `:root { scroll-behavior: smooth }` plus `home.component.ts:65`'s
   * `scrollIntoView({ behavior: 'smooth' })`: the search click navigates away
   * mid-animation, so /schedule-booking inherits whatever offset the animation
   * reached — 17, 18 and 19 on three consecutive runs of one tree.
   *
   * `e2e/tests/obrs-1207-fab-occlusion.spec.ts` owns the claim now. It solves
   * for the offsets at which an element's click point falls inside the FAB band
   * rather than sampling them, asks `document.elementFromPoint()` instead of
   * comparing rectangles, and sweeps every route this lane can reach at two
   * viewports. Deleting these rather than keeping both was AC4 of that card: a
   * gate that reds at random teaches people to re-run until it is green.
   *
   * What is NOT covered there and so stays here: that the FAB is present at all
   * through the funnel, and that it sits in the bottom-right corner at both
   * viewports. Those are position claims, not occlusion claims, and neither
   * depends on the scroll offset.
   */
  test('FAB sits in the bottom-right corner on home (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('.report-fab').waitFor({ state: 'visible', timeout: 15_000 });

    const fabBox = await page.locator('.report-fab').boundingBox();
    expect(fabBox).not.toBeNull();
    expect(fabBox!.x).toBeGreaterThan(1280 / 2);
    expect(fabBox!.y).toBeGreaterThan(800 / 2);
  });

  test('B2C booking search → schedule-booking: FAB present throughout, and a 48px corner target on mobile', async ({
    page,
  }) => {
    // The FAB is present through the stub-based portion of the B2C funnel. (The
    // full booking flow including review/passenger-info is covered by
    // e2e/tests/b2c-critical-path.spec.ts.)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').waitFor();

    await expect(page.locator('.report-fab')).toBeVisible();

    await page.locator('#dropdownObrsPassenger').click();
    await page.getByAltText('Passenger Add Icon').first().click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]').click();
    await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'Nong Sak' }).click();
    await page.locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]').click();
    await page.locator('.dropdown-menu.show .dropdown-option', { hasText: 'Bangkok' }).click();
    await page.locator('.btn-search').click();
    await page.waitForURL('**/schedule-booking');
    await settleScheduleList(page);

    const fab = page.locator('.report-fab');
    await expect(fab).toBeVisible();

    // On mobile it collapses to a 48×48 circle pinned to the bottom-right.
    const fabBox = await fab.boundingBox();
    expect(fabBox).not.toBeNull();
    expect(fabBox!.x + fabBox!.width).toBeGreaterThan(375 - 80);
    expect(fabBox!.y + fabBox!.height).toBeGreaterThan(667 - 120);
  });

  test('admin shell renders FAB + new "Usability Reports" nav item without breakage', async ({ page }) => {
    await injectAdminAuth(page);

    // Stub admin list so the page loads
    await stubAdminList(page, { code: 200, message: 'OK', data: { content: [], totalElements: 0 } });

    // Also stub bookings so admin/dashboard doesn't show error from SIT
    await page.route('**/private/admin/bookings**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) });
    });

    await page.goto('/admin/usability-reports');
    await page.waitForLoadState('networkidle');

    // FAB must be visible over the admin shell
    await expect(page.locator('.report-fab')).toBeVisible({ timeout: 10_000 });

    // "Usability Reports" page heading must appear
    await expect(page.locator('h2, h3, h4', { hasText: 'Usability Reports' }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
