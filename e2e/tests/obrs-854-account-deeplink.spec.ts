import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, Locator, Page, Route, test } from '@playwright/test';
import { ANALYTICS_CONSENT_KEY } from '../support/analytics-consent';
import { scrollToInstantly, stabilizeScrolling } from '../support/fab-occlusion';

/**
 * OBRS-854 AC-2 / AC-3 — the counter QR and the email footer both point one place: `/account`.
 *
 * A customer who asks a salesperson to delete their data cannot be helped at the counter
 * (ADR-0114: staff hold no rights over a passenger account, and `DELETE /users/{id}` 404s for
 * every passenger). The only route that exists is the one the customer walks themselves, from a
 * phone, starting logged OUT — which means `/account` is reached through `AuthGuard`, a bounce to
 * `/login`, and a return trip. Every previous card asserted the pieces; nothing asserted that the
 * trip completes, and "the URL is correct" is not the claim being made — "you can finish the
 * deletion from a phone" is.
 *
 * So this spec walks the whole path at a phone viewport and presses the destructive button for
 * real (against a stubbed DELETE): bounce -> login -> land back on /account -> open the dialog ->
 * type the translated confirm phrase -> submit -> assert the request that actually left the page.
 *
 * The discriminating assertion is `landsBackOnAccount` vs `landsHomeWithoutAReturnUrl`. A customer
 * role's `getHomeRoute()` is `/`, so if the stored return URL ever stopped being consumed the
 * first test would land on `/` — exactly where AC-3 says a customer must not be abandoned — and
 * the second proves `/account` is not simply where every login goes.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

const EMAIL = 'counter-deletion@example.test';
const PASSWORD = 'Str0ng-Passw0rd!';

/**
 * Read the confirm phrase from the shipped bundle rather than hardcoding it. The dialog compares
 * against the TRANSLATED string (deliberately — OBRS-632 refused to make a Thai reader type an
 * English word), so a hardcoded copy here would pin this spec to today's wording and would quietly
 * pass a Thai customer a phrase they cannot type.
 */
function confirmPhrase(lang: 'th' | 'en'): string {
  // Resolved from __dirname, not process.cwd() — trip-details-edit.spec.ts reads the same bundles
  // this way, and cwd depends on which config invoked the run.
  const i18nDir = resolve(__dirname, '../../public/i18n');
  const bundle = JSON.parse(readFileSync(join(i18nDir, `${lang}.json`), 'utf8')) as {
    ACCOUNT: { CLOSE_CONFIRM_PHRASE: string };
  };
  return bundle.ACCOUNT.CLOSE_CONFIRM_PHRASE;
}

const PROFILE = {
  id: 4242,
  title: 'MR',
  firstName: 'Somchai',
  middleName: null,
  lastName: 'Counter',
  email: EMAIL,
  phoneNumber: '0812345678',
  preferredLocale: 'th',
  // Current version, so the re-consent banner does not sit between the customer and the button.
  pdpaConsentVersion: '1.0',
};

const LOGIN_RESPONSE = ok({
  accessToken: 'obrs-854-e2e-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: {
    id: PROFILE.id,
    fullName: 'Somchai Counter',
    email: EMAIL,
    preferredLocale: 'th',
    status: 'active',
    roles: ['customer'],
  },
});

/** Every DELETE that reached `/api/private/users/me`, recorded off the wire. */
type Wire = { deletes: string[] };

// OBRS-882 replaced a local copy of this key with the shared one. This spec found the
// consent-bar overlap FIRST and handled it here, which was right for this page and is why
// it stayed green — but the copy meant the knowledge lived in one spec. Hours later
// OBRS-867's merge took out 23 cases in three OTHER specs against the same bar, and a
// second copy of the key string would then have had to move with it. One home, one string.
type Consent = 'granted' | 'denied' | 'unset';

async function prepare(page: Page, lang: 'th' | 'en', consent: Consent = 'denied'): Promise<Wire> {
  const wire: Wire = { deletes: [] };

  await page.addInitScript(
    ({ language, consentDecision, consentKey }) => {
      localStorage.setItem('app_language', language);
      // Deliberately NO auth_token: the whole point is arriving logged out, off a QR code.
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_username');
      localStorage.removeItem('auth_roles');

      // OBRS-867's consent bar is `position: fixed; bottom: 0; z-index: 1000`, and this page
      // puts the close-account card LAST on purpose (it is the one irreversible action here).
      // On a 390px phone the two occupy the same pixels, so an unanswered banner really does
      // swallow the click — measured, not assumed. Most tests below seed an ANSWERED decision,
      // which is the state a customer is in from their second page view onward; the first-visit
      // overlap gets its own test rather than being papered over everywhere.
      if (consentDecision === 'unset') {
        localStorage.removeItem(consentKey);
      } else {
        localStorage.setItem(consentKey, consentDecision);
      }
    },
    { language: lang, consentDecision: consent, consentKey: ANALYTICS_CONSENT_KEY }
  );

  // Google Identity Services is a real remote script on /login. Aborting it keeps this spec in the
  // hermetic GATE lane; the password form under test does not need it.
  await page.route('https://accounts.google.com/**', (route: Route) => route.abort());

  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.endsWith('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LOGIN_RESPONSE),
      });
    }

    if (url.pathname.endsWith('/api/private/users/me')) {
      if (method === 'DELETE') {
        wire.deletes.push(url.pathname);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ok(null)),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(PROFILE)),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(null)),
    });
  });

  return wire;
}

async function logIn(page: Page): Promise<void> {
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button.login-btn[type="submit"]');
}

/**
 * OBRS-1436. `logIn()` above leaves an overlay behind, and it is not scenery: `errorInterceptor`
 * raises `AlertService.showLoading()` for EVERY `/api/` request, so arriving on `/account` puts a
 * full-viewport `.swal2-container` on screen for as long as `GET /api/private/users/me` is in
 * flight, plus sweetalert2's close animation — it removes the container from `didClose`, which it
 * runs on the popup's `animationend`, not when `Swal.close()` is called.
 *
 * MEASURED (`e2e/probe-obrs-1436-overlay-linger.mjs`, 5 runs on the `gate` build): the container
 * is in the DOM for 231-272 ms, and in 5 runs out of 5 it was STILL THERE at the moment this spec
 * has the button attached and starts measuring. This assertion never had margin — it passed only
 * because the settling below usually outlasts the overlay, and in the red run's trace that
 * settling took 134 ms. On a loaded CI box it does not, and `elementFromPoint` returns the overlay
 * instead of the consent bar: the GATE lane went red that way on `d52b9f29` and again on `dev`
 * `408a2ebe`, green on a re-run of the same tree.
 *
 * So wait for it to leave the DOM rather than sampling whichever side of the race the machine
 * produced — the same move OBRS-1383 made for the scroll offset. The wait is bounded and its
 * failure is deliberately NOT thrown: an overlay that never leaves is worth reporting as what it
 * is, and the read below names it, which a bare timeout here would not.
 */
const OVERLAY_SETTLE_TIMEOUT_MS = 5_000;

async function waitForNoOverlay(page: Page): Promise<void> {
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-container').length === 0, null, {
      timeout: OVERLAY_SETTLE_TIMEOUT_MS,
    })
    .catch(() => undefined);
}

/**
 * OBRS-1383. What `document.elementFromPoint` returns at the centre of `target`, as
 * `tag.class[data-testid]` — the element that would receive the tap, named well enough that a
 * failure says WHAT took it rather than just "something did".
 */
async function hitAtCentre(target: Locator): Promise<string> {
  await waitForNoOverlay(target.page());

  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!top) return '<nothing: the centre is outside the viewport>';
    const testid = top.getAttribute('data-testid');
    const named = `${top.tagName.toLowerCase()}.${top.className}${testid ? `[${testid}]` : ''}`;
    // OBRS-1436 AC-5. `div.swal2-container swal2-...` on its own says a modal took the tap but not
    // WHICH one — every sweetalert2 container carries the same classes, and the app's only popup
    // that sets a custom class does it on the popup, not the container. So when the winner is an
    // overlay, name the popup and its title too.
    const overlay = top.closest('.swal2-container');
    if (!overlay) return named;
    const popup = overlay.querySelector('.swal2-popup');
    const title = overlay.querySelector('.swal2-title')?.textContent?.trim();
    return `${named} — a SweetAlert2 overlay outlived the wait: popup "${popup?.className ?? '(none)'}"${title ? `, title "${title}"` : ''}`;
  });
}

test.describe('OBRS-854: the counter QR lands a logged-out phone on a working close-account page', () => {
  // A real handset, not the default desktop viewport. AC-2 is about someone holding a phone at a
  // ticket counter; asserting the button exists at 1280px would evidence a screen nobody uses.
  test.use({ viewport: { width: 390, height: 844 } });

  test('logged out -> /account bounces to /login and comes BACK to /account', async ({ page }) => {
    await prepare(page, 'th');

    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);

    await logIn(page);

    // The assertion AC-3 exists for. Without the stored return URL this lands on '/'.
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator('[data-testid="close-account-card"]')).toBeVisible();
  });

  test('reaching /login directly still lands home - /account is not simply where every login goes', async ({
    page,
  }) => {
    await prepare(page, 'th');

    await page.goto('/login');
    await logIn(page);

    // A customer's getHomeRoute() is '/'. If this ever became '/account' the test above would be
    // passing for the wrong reason and would stop covering the return-url machinery at all.
    await expect(page).toHaveURL(/\/$/);
  });

  test('the close-account button is reachable and tappable inside a 390px viewport', async ({
    page,
  }) => {
    await prepare(page, 'th');
    await page.goto('/account');
    await logIn(page);
    await expect(page).toHaveURL(/\/account$/);

    const button = page.locator('[data-testid="close-account-open"]');
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    // Inside the viewport horizontally (an overflowing danger card is the failure that a
    // toBeVisible() check alone would happily pass) and big enough to hit with a thumb.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(30);
  });

  test('first visit off the QR: the consent bar covers the close-account button until answered', async ({
    page,
  }) => {
    // The QR scenario is a phone that has never been here: no session AND no consent answer.
    await prepare(page, 'th', 'unset');
    await page.goto('/account');
    await logIn(page);
    await expect(page).toHaveURL(/\/account$/);

    const banner = page.locator('app-analytics-consent-banner .consent-banner');
    const openButton = page.locator('[data-testid="close-account-open"]');
    await expect(banner).toBeVisible();
    // OBRS-1436, and not only for the hit-test below: sweetalert2 puts `overflow: hidden` on
    // `body.swal2-shown`, so while that overlay is up this page cannot be scrolled at all — every
    // scroll step from here down would be measuring a document that is pinned.
    await waitForNoOverlay(page);
    await stabilizeScrolling(page);

    // OBRS-1383. This was `scrollIntoViewIfNeeded()` followed by one immediate read, and it
    // measured 30/30 red on clean `dev` (99d70923). The read was never the race: the rect and
    // the hit-test run in ONE synchronous task, so nothing can move between them. What moved
    // was the DOCUMENT. OBRS-1372 gives the page back the pixels the bar covers by writing the
    // bar's measured height onto `body { padding-bottom }` from a ResizeObserver, and the
    // browser's MINIMUM scroll then stops somewhere else: with that write landed the page rests
    // with the button 73px CLEAR of the bar (measured: bar top y=597, button centre y=524,
    // scrollY=720=max); with it removed on the same bundle the same scroll clamps 247px lower
    // and the button rests underneath (measured: scrollY=473, covered — 10/10). So the old
    // assertion was not sampling a settled state, it was passing only while that write was
    // still in flight, and it goes red for good once the machine is quick enough.
    //
    // Solve for the offset where the two meet instead of accepting whichever one the race
    // produced — the same move OBRS-1207 made for the FAB, using its helpers.
    const overlap = await openButton.evaluate((el) => {
      const bar = document.querySelector('.consent-banner')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const doc = document.documentElement;
      const max = Math.round(doc.scrollHeight - doc.clientHeight);
      // The bar is `position: fixed`, so its viewport rect does not move with the page: the
      // offset that puts the button's centre in the middle of the bar is just the distance
      // between the two, read in document coordinates. Clamped to what the document can
      // actually scroll, so a premise that has gone away surfaces as the hit-test below naming
      // what it found instead, rather than as a bare number nobody can act on.
      const centre = window.scrollY + r.y + r.height / 2;
      const solved = Math.round(centre - (bar.y + bar.height / 2));
      return { target: Math.min(Math.max(solved, 0), max), max };
    });
    await scrollToInstantly(page, overlap.target);

    // Not an assumption about z-index: ask the browser what is actually on top of the button's
    // own centre point. OBRS-867's bar is fixed to the bottom and this card is deliberately the
    // last thing on the page, so on a 390px viewport they land on the same pixels.
    expect(await hitAtCentre(openButton)).toContain('consent-banner');

    // The other half of what OBRS-1372 changed, on the one customer page its sweep cannot reach
    // (`consent-banner-reachability.spec.ts` logs nobody in): the room it reserves is what lets
    // this page's one irreversible control be scrolled clear WITHOUT answering the question.
    // The bottom of the document is where that room is, so that is where this is asked.
    await scrollToInstantly(page, overlap.max);
    expect(await hitAtCentre(openButton)).toContain('close-account-open');

    // A real visitor answers it. Decline, not accept — the path must not require agreeing to be
    // measured in order to exercise a privacy right.
    await page.locator('.consent-banner__btn').first().click();
    await expect(banner).toHaveCount(0);

    await openButton.scrollIntoViewIfNeeded();
    expect(await hitAtCentre(openButton)).toContain('close-account-open');

    await openButton.click();
    await expect(page.locator('[data-testid="close-account-submit"]')).toBeVisible();
  });

  test('the customer can press it through to the end - DELETE /users/me really leaves the page', async ({
    page,
  }) => {
    const wire = await prepare(page, 'th');
    await page.goto('/account');
    await logIn(page);
    await expect(page).toHaveURL(/\/account$/);

    await page.locator('[data-testid="close-account-open"]').scrollIntoViewIfNeeded();
    await page.click('[data-testid="close-account-open"]');

    const submit = page.locator('[data-testid="close-account-submit"]');
    await expect(submit).toBeVisible();
    // Guard against a vacuous pass: the button must be disabled BEFORE the phrase is typed, or
    // "it submitted" would prove nothing about the confirmation step.
    await expect(submit).toBeDisabled();

    await page.fill('[data-testid="close-account-confirmation"]', confirmPhrase('th'));
    await expect(submit).toBeEnabled();
    await submit.click();

    // The effect, not a proxy: the request that actually left the page, and the session it killed.
    await expect.poll(() => wire.deletes).toEqual(['/api/private/users/me']);
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });
});
