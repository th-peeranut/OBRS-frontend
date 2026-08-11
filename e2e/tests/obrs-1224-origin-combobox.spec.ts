import { expect, Locator, Page, test } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-1224 -- the box you type a station into must be AT the field.
 *
 * WHAT WAS WRONG. The filter box existed (OBRS-562) and worked. It was mounted at
 * the TOP of the dropdown panel, and the panel is capped at `max-height: 60vh`
 * with more stops than fit, so Popper flips it upward on desktop -- putting the
 * one control that had to be near the field 525-585 px ABOVE it (measured on
 * prod, 2026-08-10, 1440x900 and 1907x1000). The customer clicked one place and
 * had to type in another.
 *
 * WHAT THIS SPEC MEASURES. Not "can I filter" -- the old build could filter. It
 * measures WHERE the typing happens relative to the field, in px, with the panel
 * flipped, which is the only thing that was ever broken. The AC threshold is one
 * field-height; the fix makes the distance 0 by construction, because the field
 * IS the box, and the `sameElement` assertion is what pins that construction
 * rather than a number that a second box could also hit by sitting close.
 *
 * WHY THE PANEL MUST STILL FLIP. Option C on the card was "stop the flip"
 * (shrink max-height / `data-bs-display="static"`), rejected: it undoes OBRS-561
 * and drops the panel on top of the page content. So this spec ASSERTS the flip
 * still happens on desktop (`data-popper-placement` starts with "top"). Without
 * that assertion the whole suite would pass on a build that quietly took the
 * forbidden route.
 *
 * WHY 24 STOPS AND NOT THE SHARED FIXTURE. `stations.json` carries two stops --
 * a panel that short never overflows 60vh, so it never flips, so a spec built on
 * it would measure the one geometry that was never broken and pass on the
 * unfixed build. The stubs below are registered AFTER `mockPublicPageApis`, which
 * is how Playwright lets a spec sharpen a shared stub (last registration wins).
 *
 * HERMETIC on this lane's terms (playwright.gate.config.ts): every /api/ call is
 * answered here or by the shared helper. No backend, no seeded data.
 *
 * ASCII-only source.
 */

/** 24 stops: the count OBRS-1213 left on the origin list, and enough to overflow
 *  60vh at every viewport this spec uses. */
const STOP_COUNT = 24;

const STOPS = Array.from({ length: STOP_COUNT }, (_, i) => ({
  id: i + 1,
  slug: `stop-${i + 1}`,
  status: 'active',
  stopType: 'station',
  createdBy: 'system',
  createdDate: '2024-01-01',
  lastUpdatedBy: 'system',
  lastUpdatedDate: '2024-01-01',
  display: [
    { locale: 'en', label: `Stop ${i + 1} ${i % 2 === 0 ? 'Riverside' : 'Hillside'}` },
    { locale: 'th', label: `Stop ${i + 1}` },
  ],
}));

/** Two provinces so the grouped branch OBRS-1212 shipped is the one under test --
 *  headers make the panel taller, which is exactly why that card asked for this
 *  geometry to be re-measured after it landed. */
const PROVINCES = [
  {
    id: 1,
    slug: 'riverside',
    translations: { en: { label: 'Riverside', description: null } },
    stops: STOPS.filter((_, i) => i % 2 === 0).map((s) => ({ id: s.id, code: s.slug })),
  },
  {
    id: 2,
    slug: 'hillside',
    translations: { en: { label: 'Hillside', description: null } },
    stops: STOPS.filter((_, i) => i % 2 === 1).map((s) => ({ id: s.id, code: s.slug })),
  },
];

const DESKTOP_VIEWPORTS = [
  { label: 'laptop 1440x900', width: 1440, height: 900 },
  { label: 'owner screenshot 1907x1000', width: 1907, height: 1000 },
];

const MOBILE = { label: 'phone 390x844', width: 390, height: 844 };

async function stubStops(page: Page): Promise<void> {
  await page.route('**/api/stops', (route) =>
    route.fulfill({ json: { code: 200, message: 'OK', data: STOPS } })
  );
  await page.route('**/api/provinces/stops', (route) =>
    route.fulfill({ json: { code: 200, message: 'OK', data: PROVINCES } })
  );
}

/** The origin field on /home -- first of the two station triggers in the bar. */
function originField(page: Page): Locator {
  return page.locator('.station-group app-dropdown-group-obrs .dropdown-btn').first();
}

function openPanel(page: Page): Locator {
  return page.locator('.station-group app-dropdown-group-obrs .dropdown-menu.show').first();
}

type Geometry = {
  /** px between the typing box and the nearest edge of the field. 0 when they
   *  are the same element, which is the shape of the fix. */
  gap: number;
  fieldHeight: number;
  /** Popper's own account of which way the panel opened. */
  placement: string;
  /** Is the box the customer types into the very element they clicked? */
  sameElement: boolean;
  /** Boxes that accept typed text inside this one station group. More than one
   *  means the panel row came back and the fix became a third box. */
  typeableBoxes: number;
  focusedIsField: boolean;
  panelTop: number;
  fieldBottom: number;
};

async function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const group = document.querySelector('.station-group app-dropdown-group-obrs');
    if (!group) throw new Error('station group not found');
    const field = group.querySelector('.dropdown-btn') as HTMLElement;
    const menu = group.querySelector('.dropdown-menu.show') as HTMLElement;
    if (!field || !menu) throw new Error('field or open panel not found');

    // The typing box is whatever accepts text: the trigger itself after this
    // card, a row inside the panel before it. Asking the DOM this way -- rather
    // than for a class name -- is what lets the same measurement describe both
    // builds, so the number can be compared with the card's prod figures.
    const boxes = Array.from(
      group.querySelectorAll('input:not([type="hidden"]), textarea')
    ) as HTMLElement[];
    const box = boxes[0];
    if (!box) throw new Error('no typeable box found in the station group');

    const fieldRect = field.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    // Vertical distance between the two rectangles; 0 when they overlap, which
    // includes "they are the same element".
    const gap = Math.max(0, fieldRect.top - boxRect.bottom, boxRect.top - fieldRect.bottom);

    return {
      gap: Math.round(gap),
      fieldHeight: Math.round(fieldRect.height),
      placement: menu.getAttribute('data-popper-placement') ?? '',
      sameElement: box === field,
      typeableBoxes: boxes.length,
      focusedIsField: document.activeElement === field,
      panelTop: Math.round(menu.getBoundingClientRect().top),
      fieldBottom: Math.round(fieldRect.bottom),
    };
  });
}

test.describe('OBRS-1224 -- the origin field is the search box', () => {
  test.beforeEach(async ({ page }) => {
    await seedAnalyticsConsent(page);
    await mockPublicPageApis(page);
    await stubStops(page);
  });

  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`AC1 desktop ${viewport.label}: typing happens AT the field, with the panel still flipped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      const field = originField(page);
      await expect(field).toBeVisible();
      await field.click();
      await expect(openPanel(page)).toBeVisible();

      const geometry = await measure(page);

      // The panel still flips upward -- option C (stop the flip) was rejected on
      // the card, and a build that took it would pass every other assertion here.
      expect(geometry.placement.startsWith('top')).toBe(true);

      // The AC: no further than one field-height from the field's edge. Before
      // this card the same measurement read 525 px (1440x900) and 585 px
      // (1907x1000) against a 48 px field.
      expect(geometry.gap).toBeLessThanOrEqual(geometry.fieldHeight);

      // ...and the reason it is 0: there is no second box to travel to.
      expect(geometry.gap).toBe(0);
      expect(geometry.sameElement).toBe(true);
      expect(geometry.typeableBoxes).toBe(1);
      // Opening the panel must also put the caret there, or "you can type at the
      // field" is only true for someone who clicks it a second time.
      expect(geometry.focusedIsField).toBe(true);
    });
  }

  test(`AC2 ${MOBILE.label}: no regression -- the panel still opens BELOW the field, and the box is still the field`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: MOBILE.width, height: MOBILE.height });
    await page.goto('/');

    const field = originField(page);
    await expect(field).toBeVisible();
    await field.click();
    await expect(openPanel(page)).toBeVisible();

    const geometry = await measure(page);

    // Mobile never had the defect (the card measured the box 67 px BELOW the
    // field), so the only thing to prove here is that nothing moved.
    expect(geometry.placement.startsWith('bottom')).toBe(true);
    expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.fieldBottom - 1);
    expect(geometry.sameElement).toBe(true);
    expect(geometry.typeableBoxes).toBe(1);
  });

  test('AC3: filtering still works from the field -- narrow, clear, Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const field = originField(page);
    await field.click();
    const panel = openPanel(page);
    await expect(panel).toBeVisible();

    const options = panel.locator('.dropdown-option');
    await expect(options).toHaveCount(STOP_COUNT);

    await field.fill('Stop 7');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText(/Stop 7/);

    await field.fill('');
    await expect(options).toHaveCount(STOP_COUNT);

    await field.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('AC3: the chosen station is shown in the field, and re-opening does not make you delete it first', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const field = originField(page);
    await field.click();
    await field.fill('Stop 3');
    await openPanel(page).locator('.dropdown-option').first().click();

    await expect(openPanel(page)).toBeHidden();
    await expect(field).toHaveValue(/Stop 3/);

    // Re-open: the box empties so the next query can be typed straight away, and
    // the current station moves to the placeholder rather than disappearing.
    await field.click();
    await expect(openPanel(page)).toBeVisible();
    await expect(field).toHaveValue('');
    await expect(field).toHaveAttribute('placeholder', /Stop 3/);
    // The list is not pre-filtered by the existing choice.
    await expect(openPanel(page).locator('.dropdown-option')).toHaveCount(STOP_COUNT);
  });

  test('keyboard: ArrowDown highlights, Enter takes it -- without ever touching the panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const field = originField(page);
    await field.click();
    await expect(openPanel(page)).toBeVisible();

    await field.press('ArrowDown');
    const active = openPanel(page).locator('.dropdown-option.is-active-option');
    await expect(active).toHaveCount(1);
    // aria-activedescendant is how a screen reader is told what ArrowDown just
    // did; a highlight the assistive layer cannot see is half a control.
    await expect(field).toHaveAttribute('aria-activedescendant', await active.getAttribute('id') ?? '');

    const label = (await active.textContent())?.trim() ?? '';
    await field.press('Enter');

    await expect(openPanel(page)).toBeHidden();
    await expect(field).toHaveValue(label);
  });
});
