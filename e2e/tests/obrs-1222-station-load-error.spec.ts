import { expect, Page, test } from '@playwright/test';

/**
 * OBRS-1222 -- what a customer sees when GET /api/stops fails.
 *
 * The card's answer is that there is no single right surface, because there are
 * two populations and the same treatment lies to one of them:
 *
 *   - RETURNING visitor. station.reducer.ts hydrates the roster from
 *     localStorage SYNCHRONOUSLY as the NgRx initialState, so the booking form
 *     is fully usable from the first paint even though the fetch died. A modal
 *     here interrupts someone for whom nothing is wrong.
 *   - FIRST-TIME visitor. The roster is empty, so both station dropdowns are
 *     empty and the form only LOOKS usable. Silence here is the same lie
 *     OBRS-642 was opened to remove -- so the failure is stated INLINE, in the
 *     form, with a retry.
 *
 * WHY E2E AND NOT ONE MORE COMPONENT SPEC. The claim is "no SweetAlert2 modal
 * reaches the page", and SweetAlert2 is raised by the HTTP interceptor into
 * document.body, outside any component fixture. A Karma spec for
 * StationLoadErrorComponent cannot see it, and the component spec that asserts
 * `.swal2-container` is absent proves only that the COMPONENT did not raise one.
 * The interceptor, the effect, the reducer and the surface only meet in a real
 * app -- which is exactly the seam OBRS-642 shipped a defect through.
 *
 * HERMETIC on this lane's terms (playwright.gate.config.ts): every /api/ call is
 * answered from here, /api/stops by an explicit failure. No backend, no seeded
 * data, no external service.
 *
 * ASCII-only source.
 */

/** Three stops is the minimum that gives both dropdowns a non-empty list. */
const STOPS = [1, 2, 3].map((id) => ({
  id,
  slug: `e2e-stop-${id}`,
  nameTh: `Test Stop ${id}`,
  nameEn: `Test Stop ${id}`,
  status: 'operational',
  stopType: 'station',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}));

const STATION_CACHE_KEY = 'obrs.stations.v1';

const ERROR_BOX = '[data-testid="station-load-error"]';
const RETRY_BUTTON = '[data-testid="station-load-error-retry"]';
const SWAL = '.swal2-container';
const STATION_OPTION = 'app-home-booking .station-group li.option-items';

function ok(data: unknown) {
  return { code: 200, message: 'OK', data };
}

/**
 * Answers every /api/ call, then overrides /api/stops.
 *
 * ORDER MATTERS AND IS THE OPPOSITE OF THE OBVIOUS ONE: Playwright runs the
 * LAST-registered matching handler first, so the specific /stops route has to be
 * registered AFTER the catch-all or the catch-all wins and this spec silently
 * measures a healthy page.
 *
 * `stopsHandler` returns true when it has answered the call. Returning false
 * lets it fall through to the catch-all, which is how the retry case serves a
 * failure and then a success from one handler.
 */
async function mockApi(
  page: Page,
  stopsHandler: (attempt: number) => 'fail' | 'ok'
): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith('/stops') ? ok(STOPS) : ok(null);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  let attempt = 0;
  await page.route('**/api/stops**', async (route) => {
    attempt += 1;
    if (stopsHandler(attempt) === 'fail') {
      // abort(), not a 500: it raises the same `status: 0` HttpErrorResponse a
      // dead connection and the OBRS-642 timeout both raise, which is the case
      // this card is about. A 500 would exercise a different branch of
      // resolveApiAlertMessage.
      await route.abort('connectionfailed');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(STOPS)),
    });
  });
}

/** Seeds the localStorage roster a returning visitor already has. */
async function seedCache(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, stations]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({
          version: 'v1',
          fetchedAt: '2026-01-01T00:00:00Z',
          stations,
        })
      );
    },
    [STATION_CACHE_KEY, STOPS] as const
  );
}

/** Clears it, which is the first-time visitor. */
async function clearCache(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key as string);
  }, STATION_CACHE_KEY);
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('app-home-booking').waitFor({ state: 'visible' });
  // The failure is dispatched by an effect, so give the store a beat to settle
  // before measuring absence -- an assertion that runs before the action lands
  // passes for the wrong reason.
  await page.waitForTimeout(1500);
}

test.describe('OBRS-1222 station-load failure', () => {
  test('AC1 -- cache already filled the form: NO modal, and the dropdowns still have options', async ({
    page,
  }) => {
    await seedCache(page);
    await mockApi(page, () => 'fail');
    await gotoHome(page);

    expect(await page.locator(SWAL).count()).toBe(0);
    expect(await page.locator(ERROR_BOX).count()).toBe(0);

    // The positive control. Without it, "0 modals" is equally consistent with a
    // page that failed to render at all -- which is how an absence assertion
    // passes while proving nothing.
    expect(await page.locator(STATION_OPTION).count()).toBeGreaterThan(0);
  });

  test('AC2 -- empty cache: an INLINE message in the form, and still no modal', async ({
    page,
  }) => {
    await clearCache(page);
    await mockApi(page, () => 'fail');
    await gotoHome(page);

    expect(await page.locator(SWAL).count()).toBe(0);
    await expect(page.locator(ERROR_BOX)).toBeVisible();
    await expect(page.locator(RETRY_BUTTON)).toBeVisible();

    // The dropdowns really are empty -- this is the population for whom silence
    // would have been the lie.
    expect(await page.locator(STATION_OPTION).count()).toBe(0);

    // AC2's reachability clause. `elementFromPoint` at the centre of the form
    // answers what a FINGER would hit, which `count() === 0` on an overlay class
    // cannot: an overlay with a different class name, or one rendered by a
    // future library, still shows up here.
    const onTop = await page.evaluate(() => {
      const form = document.querySelector('app-home-booking');
      if (!form) return 'NO-FORM';
      const box = form.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + Math.min(box.height / 2, window.innerHeight / 2 - box.top)
      );
      if (!hit) return 'NOTHING';
      return hit.closest('.swal2-container') ? 'OVERLAY' : 'PAGE';
    });
    expect(onTop).toBe('PAGE');
  });

  test('AC3 -- the retry button refetches, and a second-attempt success fills the dropdowns without a reload', async ({
    page,
  }) => {
    await clearCache(page);
    // First attempt dies, every attempt after it succeeds.
    await mockApi(page, (attempt) => (attempt === 1 ? 'fail' : 'ok'));
    await gotoHome(page);

    await expect(page.locator(ERROR_BOX)).toBeVisible();
    expect(await page.locator(STATION_OPTION).count()).toBe(0);

    await page.locator(RETRY_BUTTON).click();

    // No reload happens anywhere in this test -- if one did, the assertion below
    // would be about a fresh page rather than about the retry.
    await expect(page.locator(ERROR_BOX)).toHaveCount(0);
    await expect(page.locator(STATION_OPTION).first()).toBeAttached();
    expect(await page.locator(STATION_OPTION).count()).toBeGreaterThan(0);
    expect(await page.locator(SWAL).count()).toBe(0);
  });

  test('control -- a healthy load shows neither the modal nor the inline message', async ({
    page,
  }) => {
    // The test that fails if the inline surface is wired to the wrong condition
    // and starts accusing a working network of being down.
    await clearCache(page);
    await mockApi(page, () => 'ok');
    await gotoHome(page);

    expect(await page.locator(SWAL).count()).toBe(0);
    expect(await page.locator(ERROR_BOX).count()).toBe(0);
    expect(await page.locator(STATION_OPTION).count()).toBeGreaterThan(0);
  });
});
