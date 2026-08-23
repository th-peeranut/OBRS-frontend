import { expect, Page, test } from '@playwright/test';

/**
 * OBRS-1189 -- the search bar, measured at REAL viewports.
 *
 * WHY HERE AND NOT IN KARMA. Everything this card claims is a property of the
 * cascade at a viewport width: the bar is one row above 992px and one stacked
 * column below it, and `@media` keys on the VIEWPORT, not on the fixture. Karma's
 * headless window is 800px wide, so the three component specs that measure this
 * geometry can only ever take the stacked branch -- which is the reason
 * OBRS-1038 opened this lane for the same bar in the first place. The row layout
 * is where AC#2 and AC#3 live, and it has no automated home anywhere else.
 *
 * WHAT IT PINS, and why each one is the card:
 *
 *   - AC#2 the two date fields are SEGMENTS: same height as the station halves,
 *     touching them, square where they meet. Before this card they were pills of
 *     a different height standing beside the bar.
 *   - AC#3 the search button is the LAST segment, at 1280 and still at 993 --
 *     the band where the old layout wrapped it onto a row of its own.
 *   - AC#1 every label is inside its own field's frame, and every control still
 *     has an accessible name (the risk OBRS-1028 paid for once already).
 *   - the date text is not CLIPPED at any of these widths. OBRS-1562 shipped a
 *     narrower field that read `อา., 23/08/20`, and a bar that fits by cutting
 *     the year off the field a customer picks their travel date in has not fit.
 *   - AC#4 stacked, the bar stays merged and the swap button straddles a REAL
 *     seam. (`obrs-1038-station-seam.spec.ts` measures the button; this measures
 *     the whole column it now belongs to.)
 *   - AC#8 the inline label's colour is read off the element in BOTH themes.
 *
 * HERMETIC on this lane's terms: every `/api/**` call is fulfilled from the
 * fixture below, so no backend, no seeded data, no external service.
 *
 * ASCII-only source apart from the two Thai strings the app itself renders.
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
    // `/api/provinces/stops` also ends in `/stops` -- answered explicitly for the
    // reason obrs-1038-station-seam.spec.ts spells out.
    const body = pathname.endsWith('/provinces/stops')
      ? ok([])
      : pathname.endsWith('/stops')
        ? ok(STOPS)
        : ok(null);

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
  width: number;
  height: number;
  cx: number;
  cy: number;
};

type Field = {
  key: string;
  box: Box;
  radius: string;
  /** '' when the control would be announced as an unnamed box. */
  name: string;
  /** A value wider than its own box is a value with characters off the end of it. */
  overflowPx: number;
  labelBox: Box | null;
  labelColor: string;
};

type Reading = {
  fields: Field[];
  search: Box;
  searchRadius: string;
  hint: Box | null;
  hintBtn: Box | null;
};

/**
 * Reads the boxes the browser actually laid out -- the only place the cascade
 * exists. The four fields are collected in bar order (origin, destination,
 * departure, return) so adjacency can be asserted pairwise.
 */
async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
        width: r.width,
        height: r.height,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    };

    /** The name a screen reader would announce, by either route the app offers. */
    const nameOf = (el: HTMLElement): string => {
      const aria = el.getAttribute('aria-label')?.trim();
      if (aria) return aria;
      const bound = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      return bound?.textContent?.trim() ?? '';
    };

    const field = (key: string, control: HTMLElement, frame: Element): Field => {
      const label = frame.querySelector('label.field-inline-label') as HTMLElement | null;
      return {
        key,
        box: box(control),
        radius: getComputedStyle(control).borderRadius,
        name: nameOf(control),
        // `scrollWidth - clientWidth` is the browser's own answer to "is there
        // text I could not paint", which is what a truncated year IS.
        overflowPx: control.scrollWidth - control.clientWidth,
        labelBox: label ? box(label) : null,
        labelColor: label ? getComputedStyle(label).color : '',
      };
    };

    const bar = document.querySelector('.station-section') as HTMLElement;
    const stationFrames = Array.from(
      bar.querySelectorAll('.station-group app-dropdown-group-obrs .dropdown')
    ).slice(0, 2);
    const dateFrames = Array.from(bar.querySelectorAll(':scope > .form-group-obrs'));

    const fields: Field[] = [
      ...stationFrames.map((frame, i) =>
        field(i === 0 ? 'origin' : 'destination', frame.querySelector('.dropdown-btn') as HTMLElement, frame)
      ),
      ...dateFrames.map((frame, i) =>
        field(i === 0 ? 'departure' : 'return', frame.querySelector('input') as HTMLElement, frame)
      ),
    ];

    const search = bar.querySelector(':scope > .btn-search') as HTMLElement;
    // The ROW, not the link inside it: the row is the flex item, so it is the
    // thing that takes a line of its own and the thing `order` ranks.
    const hint = bar.querySelector(':scope > .map-hint-row') as HTMLElement | null;

    const hintBtn = hint?.querySelector('[data-testid="show-route-map"]') as HTMLElement | null;

    return {
      fields,
      search: box(search),
      searchRadius: getComputedStyle(search).borderRadius,
      hint: hint ? box(hint) : null,
      hintBtn: hintBtn ? box(hintBtn) : null,
    };
  });
}

async function open(page: Page, width: number, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await mockApi(page);
  await page.goto('/');
  // The bar renders only once the stop list resolves; a bare `goto` would let the
  // first assertion fail as a timeout rather than as a measurement.
  await page.waitForSelector('.station-group app-dropdown-group-obrs .dropdown-btn');
}

/** Round-trip is the default (OBRS-1185), so both date fields are on the bar. */
const BAR_ORDER = ['origin', 'destination', 'departure', 'return'];

function assertOneRow(r: Reading): void {
  expect(r.fields.map((f) => f.key)).toEqual(BAR_ORDER);

  const heights = new Set(r.fields.map((f) => Math.round(f.box.height)));
  expect(heights.size, 'every segment is the same height').toBe(1);
  expect(Math.round(r.search.height)).toBe([...heights][0]);

  // One bar: consecutive segments touch (they overlap by the 1px that collapses
  // their two borders into one line) and every top agrees.
  const boxes = [...r.fields.map((f) => f.box), r.search];
  for (let i = 1; i < boxes.length; i++) {
    expect(Math.abs(boxes[i].left - boxes[i - 1].right)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[i].top - boxes[0].top)).toBeLessThanOrEqual(1);
  }
}

test('at 1280 the bar runs from the origin picker to the search button', async ({ page }) => {
  await open(page, 1280);
  const r = await read(page);

  assertOneRow(r);

  // Only the two ENDS are rounded. The destination half used to close the bar
  // here; the search button does now (OBRS-1038's spec pins the other half).
  expect(r.fields[0].radius).toBe('24px 0px 0px 24px');
  expect(r.fields[1].radius).toBe('0px');
  expect(r.fields[2].radius).toBe('0px');
  expect(r.searchRadius).toBe('0px 24px 24px 0px');

  // AC#3's point: the button is IN the row, so nothing is left holding a line
  // of its own except the hint, which sits under the bar.
  expect(r.hint).not.toBeNull();
  expect(r.hint!.top).toBeGreaterThanOrEqual(r.search.bottom - 1);

  // The ROW is full width because that is what forces the line break; the LINK
  // is not, because a four-word link should not be a click target the width of
  // the card. That distinction is the only reason the wrapper element exists.
  expect(r.hint!.left).toBeLessThanOrEqual(r.fields[0].box.left + 1);
  expect(r.hint!.right).toBeGreaterThanOrEqual(r.search.right - 1);
  expect(r.hintBtn!.width).toBeLessThan(r.hint!.width / 2);
});

test('every label is inside its own frame, and every control still has a name', async ({
  page,
}) => {
  await open(page, 1280);
  const r = await read(page);

  for (const f of r.fields) {
    expect(f.labelBox).not.toBeNull();
    // Inside the frame, vertically AND horizontally -- "above the field" is the
    // arrangement this card replaced, and it is exactly what an outside-the-box
    // label would read as here.
    expect(f.labelBox!.top).toBeGreaterThanOrEqual(f.box.top);
    expect(f.labelBox!.bottom).toBeLessThanOrEqual(f.box.bottom);
    expect(f.labelBox!.left).toBeGreaterThanOrEqual(f.box.left);
    expect(f.labelBox!.right).toBeLessThanOrEqual(f.box.right + 1);

    // AC#1: a control with no accessible name is a text box a screen reader
    // announces as nothing at all (OBRS-1028).
    expect(f.name.length).toBeGreaterThan(0);
  }
});

// 993 is the AC#3 boundary and the band the old layout could not hold: with a
// 230px flex basis on each date field the row wrapped below ~1090px, so the
// button spent the whole 993-1090 range on a line of its own.
for (const width of [993, 1024, 1199, 1440]) {
  test(`at ${width} it is still one row, and no date value is clipped`, async ({ page }) => {
    await open(page, width);
    const r = await read(page);

    assertOneRow(r);

    for (const f of r.fields) {
      // 1px of tolerance for sub-pixel rounding; a clipped year measures tens.
      expect(f.overflowPx).toBeLessThanOrEqual(1);
    }
  });
}

// The band where the button drops its word to give the date segments the room
// they need. `display: none` takes the text out of the accessibility tree, so
// this is the width at which an unlabelled button would ship -- and it would
// ship looking fine.
test('at 1024 the search button loses its word but not its name', async ({ page }) => {
  await open(page, 1024);

  const state = await page.evaluate(() => {
    const btn = document.querySelector('.station-section > .btn-search') as HTMLElement;
    const label = btn.querySelector('.btn-search__label') as HTMLElement;
    return {
      labelDisplay: getComputedStyle(label).display,
      name: (btn.getAttribute('aria-label') ?? '').trim(),
      width: Math.round(btn.getBoundingClientRect().width),
    };
  });

  expect(state.labelDisplay).toBe('none');
  expect(state.width).toBe(64);
  expect(state.name.length).toBeGreaterThan(0);
});

test('at 390 the bar stacks, stays merged, and the hint stays above the button', async ({
  page,
}) => {
  await open(page, 390, 780);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.station-section') as HTMLElement)
        .flexDirection === 'column'
  );
  const r = await read(page);

  // AC#4: one column with no gaps -- each segment's top is the previous one's
  // bottom. That is the seam the swap button straddles, and it did not exist
  // before this card: the lower field's label filled the gap.
  const boxes = r.fields.map((f) => f.box);
  for (let i = 1; i < boxes.length; i++) {
    expect(Math.abs(boxes[i].top - boxes[i - 1].bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[i].left - boxes[0].left)).toBeLessThanOrEqual(1);
  }

  // Only the two ends of the column are rounded.
  expect(r.fields[0].radius).toBe('24px 24px 0px 0px');
  expect(r.fields[3].radius).toBe('0px 0px 24px 24px');

  // The button is NOT a segment here (AC#3 is a desktop claim): full width, its
  // own pill, and BELOW the hint -- which is the arrangement OBRS-1562 shipped
  // and the only reason both buttons had to become siblings.
  expect(r.searchRadius).toBe('24px');
  expect(r.hint).not.toBeNull();
  expect(r.hint!.bottom).toBeLessThanOrEqual(r.search.top);
});

// AC#8. Read off the element, in both themes, rather than inferred from the
// stylesheet: `$text-lightblack` measures 3.25:1 on the dark booking card
// (variables.scss:101), so a label that kept its light colour would be a
// legibility defect no CSS parser could see.
test('the inline label is painted from the right token in each theme', async ({ page }) => {
  await open(page, 1280);
  expect((await read(page)).fields[0].labelColor).toBe('rgb(113, 117, 129)'); // $text-lightblack

  await page.evaluate(() => localStorage.setItem('app_admin_theme', 'dark'));
  await page.reload();
  await page.waitForSelector('body.is-dark .station-group app-dropdown-group-obrs .dropdown-btn');

  for (const f of (await read(page)).fields) {
    expect(f.labelColor).toBe('rgb(154, 163, 184)'); // $dk-text-muted
  }
});
