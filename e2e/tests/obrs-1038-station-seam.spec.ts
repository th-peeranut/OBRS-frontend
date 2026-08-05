import { expect, Page, test } from '@playwright/test';

/**
 * OBRS-1038 -- the origin/destination bar, measured at a REAL viewport.
 *
 * WHY THIS EXISTS RATHER THAN ONE MORE UNIT TEST. The bar is one merged bar in a
 * row and two stacked fields below 992px, and `@media (max-width: 992px)` keys on
 * the VIEWPORT, not on the fixture. Karma's headless window is 800px wide, so the
 * three component specs that measure this geometry can only ever take the STACKED
 * branch in CI -- setting the fixture element to 1200px does not move a media
 * query. The row layout, which is the one the card is actually about, has no
 * automated proof anywhere else. This lane pins its viewport at 1280x720
 * (playwright.gate.config.ts rule 3), which is what makes it the right home.
 *
 * WHAT IT PINS, and why each one is a defect that already happened:
 *
 *   - the two halves TOUCH (OBRS-1038). Two boxes with a gap and a button
 *     floating in it is the state this card was opened to end.
 *   - the button's centre is on the SEAM, not merely somewhere between them.
 *   - the button's centre is level with the FIELDS, not with the taller
 *     label+field group -- that is OBRS-1035's defect, and it was hidden for
 *     months by a per-call-site `margin-top: 30px` that was correct at exactly
 *     one width out of five.
 *   - stacked, it TURNS and stays on a real edge instead of vanishing (AC#3).
 *   - the icon is arrows only: no vehicle, and no `<img>` at all (AC#2).
 *
 * HERMETIC on this lane's terms: every `/api/**` call is fulfilled from the
 * fixture below, so no backend, no seeded data, no external service.
 *
 * ASCII-only source.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

/** Three stops is the minimum that gives both dropdowns a non-empty option list. */
const STOPS = [1, 2, 3].map((id) => ({
  id,
  slug: `e2e-stop-${id}`,
  nameTh: `สถานีทดสอบ ${id}`,
  nameEn: `Test Stop ${id}`,
  status: 'operational',
  stopType: 'station',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}));

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith('/stops') ? ok(STOPS) : ok(null);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

type Box = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  cx: number;
  cy: number;
};

type Reading = {
  a: Box;
  b: Box;
  host: Box;
  direction: string;
  aRadius: string;
  bRadius: string;
  transform: string;
  glyph: string;
  imgCount: number;
};

/** Reads the boxes the browser actually laid out -- the only place the cascade exists. */
async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const bar = document.querySelector('.station-group') as HTMLElement;
    const fields = Array.from(
      bar.querySelectorAll('app-dropdown-group-obrs button.dropdown-btn')
    ).slice(0, 2) as HTMLElement[];
    const host = bar.querySelector('app-station-swap-button') as HTMLElement;
    const icon = host.querySelector('.station-swap-button__icon') as HTMLElement;

    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    };

    return {
      a: box(fields[0]),
      b: box(fields[1]),
      host: box(host),
      direction: getComputedStyle(bar).flexDirection,
      aRadius: getComputedStyle(fields[0]).borderRadius,
      bRadius: getComputedStyle(fields[1]).borderRadius,
      transform: getComputedStyle(host).transform,
      glyph: icon.textContent!.trim(),
      imgCount: host.querySelectorAll('img').length,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  // The bar renders only once the stop list resolves; a bare `goto` would let the
  // first assertion read an element that is not there yet and fail as a timeout
  // rather than as a measurement.
  await page.waitForSelector('.station-group app-dropdown-group-obrs button.dropdown-btn');
});

test('at 1280 the two halves are ONE bar and the button sits on its seam', async ({ page }) => {
  const r = await read(page);

  expect(r.direction).toBe('row');

  // One bar: the halves touch (they overlap by the 1px that collapses their two
  // borders into one line) and their tops agree.
  expect(Math.abs(r.b.left - r.a.right)).toBeLessThanOrEqual(1);
  expect(r.a.top).toBe(r.b.top);

  // ...and the corners that meet are square, which is what makes it read as one
  // box rather than two pills pushed together.
  expect(r.aRadius).toBe('24px 0px 0px 24px');
  expect(r.bRadius).toBe('0px 24px 24px 0px');

  // On the seam, horizontally.
  const seamX = (r.a.right + r.b.left) / 2;
  expect(Math.abs(r.host.cx - seamX)).toBeLessThanOrEqual(1);

  // Level with the FIELD, not with the label+field group above it (OBRS-1035).
  expect(Math.abs(r.host.cy - r.a.cy)).toBeLessThanOrEqual(1);
});

test('at 768 it stacks, and the button turns onto the upper field edge instead of vanishing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  // Wait for the media query to have APPLIED, not for a frame to have passed: a
  // `requestAnimationFrame` promise is not guaranteed to resolve in a headless
  // page and hung this test for the full 60s timeout. This also fails by naming
  // the thing that did not happen.
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.station-group') as HTMLElement)
        .flexDirection === 'column'
  );

  const r = await read(page);

  expect(r.direction).toBe('column');
  expect(r.a.left).toBe(r.b.left);

  // Still on screen, still on an edge that exists: the upper field's bottom.
  expect(Math.abs(r.host.cy - r.a.bottom)).toBeLessThanOrEqual(1);
  // At the right end, clear of the left-aligned label that sits between the two
  // boxes -- the reason this mode has no seam to straddle at all.
  expect(r.host.cx).toBeGreaterThan(r.a.cx);
  expect(r.host.right).toBeLessThanOrEqual(r.a.right);

  // Turned 90 degrees: matrix(0, 1, -1, 0, 0, 0).
  expect(r.transform.replace(/\s/g, '')).toBe('matrix(0,1,-1,0,0,0)');
});

test('the icon is two arrows and nothing else -- no vehicle, no image asset', async ({ page }) => {
  const r = await read(page);

  expect(r.glyph).toBe('swap_horiz');
  // `passenger-station-gap.svg` was a bus wrapped in two curved arrows. An
  // assertion on the glyph alone would still pass with that <img> shipped
  // alongside it.
  expect(r.imgCount).toBe(0);
});
