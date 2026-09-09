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
 *
 *     OBRS-1640 CORRECTED THE SCOPE OF THAT SENTENCE. It used to sit here
 *     unqualified while every test in this file did `goto('/')`, so it read as a
 *     claim about the app and was a claim about ONE route. The declaration it
 *     guards is global (`.p-datepicker.app-date-field--segment .p-inputtext` in
 *     styles.scss) and five call sites carry that class, so the widths above are
 *     the home bar's alone: the `/schedule-booking` filter bar is measured by the
 *     993 locale loop below and by nothing else, and the parcel wizard's lone
 *     field is measured nowhere (see the note above that loop for why that is a
 *     finding rather than an omission).
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
  /** The text `overflowPx` was taken on, so a failure names the string it failed on. */
  value: string;
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
 * OBRS-1640 -- the TWO bars the one global `--segment` rule builds.
 *
 * `schedule-booking-filter.component.html` is a copy of `home-booking.component
 * .html` and says so on four separate blocks; its stylesheet `@import`s home's
 * whole file. So the two bars share the class, the layout, the `.station-section`
 * wrapper, the `.btn-search`, and even the i18n keys -- which is why the first
 * OBRS-1586 probe measured the home bar three times and reported it as coverage
 * of both. `inputId` is the ONE thing that differs, so it is the anchor here and
 * `location.pathname` is asserted rather than assumed: a guard or a redirect is
 * free to ignore the URL a run asked for, and a wrong page would otherwise
 * report a plausible number instead of an error.
 */
type Bar = {
  route: string;
  /** `inputId` prefix -- `home-departure-date` vs `filter-departure-date`. */
  idPrefix: string;
};

const HOME_BAR: Bar = { route: '/', idPrefix: 'home' };
const FILTER_BAR: Bar = { route: '/schedule-booking', idPrefix: 'filter' };
const SEGMENT_BARS: Bar[] = [HOME_BAR, FILTER_BAR];

/**
 * Reads the boxes the browser actually laid out -- the only place the cascade
 * exists. The four fields are collected in bar order (origin, destination,
 * departure, return) so adjacency can be asserted pairwise.
 */
async function read(page: Page, bar: Bar = HOME_BAR): Promise<Reading> {
  return page.evaluate((prefix) => {
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

    const pen = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D & {
      letterSpacing?: string;
      fontKerning?: string;
    };

    /**
     * How much of a control's own text does not fit inside its content box.
     *
     * `scrollWidth - clientWidth` is the browser's own answer to "is there text
     * I could not paint" on a BLOCK, and that branch is kept for the
     * `<button class="dropdown-btn">` a station half renders when `[searchable]`
     * is false.
     *
     * On THIS bar it renders no such button. Home passes `[searchable]="true"`
     * (home-booking.component.html:56 and :78), so `dropdown-group-obrs` takes
     * its `<input role="combobox" class="btn dropdown-btn ...">` branch and all
     * FOUR fields read here are inputs. An `<input>` does not answer that
     * question: Chromium (the engine Playwright drives here)
     * reports `scrollWidth === clientWidth` on a single-line text input no
     * matter how long the value is, so on all four of them that subtraction
     * was a constant 0 and this suite reported "no date value is clipped" for
     * every width in every language -- including 993px in `zh`, where the
     * screenshots on OBRS-1586 show `周六, 2026/08/29` visibly cut. The same
     * mistake is written up in the header of
     * `probe-obrs1562-locale-clipping.js`; the lesson was in a capture script
     * and not in this suite, so it was made again here.
     *
     * So an input is measured against its own painted text: the value drawn on
     * a canvas with the input's own font, spacing and kerning, against the
     * content box the paddings leave it. Callers must await `document.fonts.ready`
     * first or the metrics are the fallback font's, not the one on screen.
     */
    const overflowOf = (el: HTMLElement): number => {
      if (!(el instanceof HTMLInputElement)) return el.scrollWidth - el.clientWidth;
      const cs = getComputedStyle(el);
      pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in pen) {
        pen.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      }
      if ('fontKerning' in pen) pen.fontKerning = cs.fontKerning || 'auto';
      const contentW =
        el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return pen.measureText(el.value).width - contentW;
    };

    const field = (key: string, control: HTMLElement, frame: Element): Field => {
      const label = frame.querySelector('label.field-inline-label') as HTMLElement | null;
      return {
        key,
        box: box(control),
        radius: getComputedStyle(control).borderRadius,
        name: nameOf(control),
        overflowPx: overflowOf(control),
        value: control instanceof HTMLInputElement ? control.value : control.textContent?.trim() ?? '',
        labelBox: label ? box(label) : null,
        labelColor: label ? getComputedStyle(label).color : '',
      };
    };

    // OBRS-1640: anchored on the date field's `inputId`, not on the first
    // `.station-section` in the document. That shortcut was correct on `/` and
    // wrong the moment this function was pointed at `/schedule-booking`, where
    // the SHARED stepper (`shared/components/stepper/stepper.component.html:4`)
    // renders a `.station-section` of its own ABOVE the filter bar -- so
    // `querySelector` returned the stepper and every read below came back null.
    // Four elements in this repo carry the class; only two of them are a bar.
    const anchor = document.getElementById(`${prefix}-departure-date`);
    if (!anchor) throw new Error(`no #${prefix}-departure-date on ${location.pathname}`);
    const bar = anchor.closest('.station-section') as HTMLElement | null;
    if (!bar) throw new Error(`#${prefix}-departure-date is not inside a .station-section`);
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
  }, bar.idPrefix);
}

/**
 * `lang` is the app's persisted language key, set BEFORE the first script runs
 * so the bar is built in that language rather than repainted into it. Left
 * unset the app takes its own default, which is what every test here did until
 * OBRS-1586 -- and `th` is the one locale of the three with room to spare, so a
 * suite that never switched was measuring the only case that could not fail.
 *
 * `bar` defaults to home: every test above the locale loop is about the home
 * page's own geometry (the hint row, the dark theme, the 390px stack) and stays
 * there.
 */
async function open(
  page: Page,
  width: number,
  height = 900,
  lang?: string,
  bar: Bar = HOME_BAR
): Promise<void> {
  await page.setViewportSize({ width, height });
  await mockApi(page);
  if (lang) {
    await page.addInitScript((l) => localStorage.setItem('app_language', l), lang);
  }
  await page.goto(bar.route);
  // The bar renders only once the stop list resolves; a bare `goto` would let the
  // first assertion fail as a timeout rather than as a measurement.
  await page.waitForSelector(`#${bar.idPrefix}-departure-date`);
  // Asked-for route vs LANDED-on route. Both bars answer to the same selectors,
  // so without this a redirect home would be measured as the filter bar.
  expect(await page.evaluate(() => location.pathname)).toBe(bar.route);
  // Both date fields carry a default value (OBRS-1185), and an empty one would
  // measure as a value that fits. Wait for the text before measuring the text.
  await page.waitForFunction((prefix) => {
    const anchor = document.getElementById(`${prefix}-departure-date`);
    const section = anchor?.closest('.station-section');
    const inputs = section
      ? section.querySelectorAll<HTMLInputElement>(':scope > .form-group-obrs input')
      : [];
    return inputs.length > 0 && [...inputs].every((i) => !!i.value);
  }, bar.idPrefix);
  // Metrics read before the webfont lands are the fallback's, not the screen's.
  await page.evaluate(() => document.fonts.ready);
}

/** Round-trip is the default (OBRS-1185), so both date fields are on the bar. */
const BAR_ORDER = ['origin', 'destination', 'departure', 'return'];

/** The two segments whose value must be printed whole; see the clipping loop. */
const dateFieldsOf = (r: Reading): Field[] =>
  r.fields.filter((f) => f.key === 'departure' || f.key === 'return');

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

    // The two DATE segments, not all four fields.
    //
    // This loop used to run over `r.fields`, and before OBRS-1586 that was free:
    // `overflowPx` was `scrollWidth - clientWidth` on four `<input>`s, i.e. a
    // constant 0, so the assertion held for all four by measuring none of them.
    // Now that it measures painted text, running it over all four would newly
    // assert that a STATION half never overflows -- which the station half is
    // built to do: `dropdown-group-obrs.component.scss:196` gives
    // `.dropdown-btn` `text-overflow: ellipsis` on purpose, so a long stop name
    // is SUPPOSED to run past its box and end in an ellipsis. It would pass
    // today only because `STOPS` above is three short synthetic names, and would
    // go red for a non-bug the day someone widens that fixture.
    //
    // A date value has no such escape: the field shows the whole date or the
    // customer reads a wrong one. That asymmetry is the reason for the split,
    // and it is a scope choice -- `overflowOf` measures a station half perfectly
    // well, there is just no threshold to hold it to that the design agrees with.
    for (const f of dateFieldsOf(r)) {
      // 1px of tolerance for sub-pixel rounding; a clipped year measures tens.
      expect(f.overflowPx, `${f.key} "${f.value}"`).toBeLessThanOrEqual(1);
    }
  });
}

/**
 * OBRS-1586 -- the same question at the same width, asked in each language.
 *
 * 993px is where the one-row bar is narrowest, and the date segments carry a
 * translated weekday: `ส.,` in th, `Sat,` in en, `周六,` in zh, against one
 * content box. The band 993-~1001px was clipping `zh` outright and `en` on the
 * days of the month whose abbreviation is the widest.
 *
 * A headroom FLOOR, not a bare "does it fit": at zero the layout is one font
 * revision away from clipping again, and it has now shipped clipped twice from
 * exactly that position. 8px is the floor the card set -- it is a chosen
 * threshold, not a measurement.
 *
 * ⚠️ The `zh` number is this runner's: the app declares two @font-face families
 * (Sarabun, Material Symbols Outlined) and neither carries a CJK glyph, so
 * `周六` is painted by whatever the HOST resolves `sans-serif` to. `en` is the
 * assertion without that caveat -- Sarabun, bundled, and the same metrics
 * everywhere.
 */
const MIN_HEADROOM_PX = 8;

/**
 * Every weekday abbreviation the locale can print, READ FROM THE LOCALE FILE.
 *
 * The assertion runs on the wider of the live value and the same date carrying
 * the widest of these, because neither alone is safe. Live-only makes the gate a
 * lottery on the calendar: on 2026-08-29 the bar showed `Sat,`/`Sun,` and the
 * unfixed layout left `en` 8.39px on the departure field, over this floor --
 * the same layout with `Wed,` is 0.27px, under it. Worst-case-only has the
 * opposite failure and OBRS-1586 hit it: a hardcoded `Wed, 08/23/2026` was
 * NARROWER than the `Mon, 08/24/2026` actually on screen, so a probe judging on
 * it called `en` safe while it overflowed.
 *
 * Fetched rather than listed here on purpose. A `{ th: 'พฤ.', en: 'Wed', ... }`
 * map is a copy of three locale files with nothing holding it to them, and this
 * suite exists because a gate drifted away from what the app renders. `D` in the
 * `dateFormat` these files also own is PrimeNG's short day name, so
 * `CALENDAR.dayNamesShort` is the same list the bar draws from.
 */
async function weekdayNames(page: Page, lang: string): Promise<string[]> {
  const names = await page.evaluate(async (l) => {
    const res = await fetch(`/i18n/${l}.json`);
    const json = await res.json();
    return json?.CALENDAR?.dayNamesShort as string[] | undefined;
  }, lang);
  // A miss here would silently degrade the assertion to live-only, which is the
  // exact failure this function exists to remove -- so it fails loudly instead.
  expect(names, `CALENDAR.dayNamesShort missing from /i18n/${lang}.json`).toBeTruthy();
  expect(names!.length).toBe(7);
  return names!;
}

/**
 * Overflow for the two date segments, judged on the widest date the locale can
 * print on this layout: the live value, and the same value with each of the
 * seven `dayNamesShort` in front of it.
 *
 * Only the weekday is swapped -- the numerals stay the ones the run actually
 * rendered, so nothing here reimplements the `dateFormat` the locale files own.
 * Widest is decided by MEASURING each candidate in the field's own font, not by
 * string length: `พฤ.` is 3 characters and wider than 4-character `อา.`, and in
 * `zh` all seven are the same width.
 */
async function dateOverflow(page: Page, weekdays: string[], idPrefix: string) {
  const rows = await page.evaluate(({ names, prefix }) => {
    const pen = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D & {
      letterSpacing?: string;
      fontKerning?: string;
    };
    // Anchored on the id, not on structure -- see the `Bar` note above.
    const anchor = document.getElementById(`${prefix}-departure-date`);
    if (!anchor) throw new Error(`no #${prefix}-departure-date on ${location.pathname}`);
    const section = anchor.closest('.station-section');
    if (!section) {
      throw new Error(`#${prefix}-departure-date is not inside a .station-section`);
    }
    const inputs = [
      ...section.querySelectorAll<HTMLInputElement>(':scope > .form-group-obrs input'),
    ];
    return inputs.map((el) => {
      const cs = getComputedStyle(el);
      pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in pen) {
        pen.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      }
      if ('fontKerning' in pen) pen.fontKerning = cs.fontKerning || 'auto';
      const contentW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const live = el.value;
      // Everything from the first comma on is the numeric part the locale file
      // formats; only the weekday in front of it is swapped.
      const candidates = [live, ...names.map((n) => live.replace(/^[^,]*/, n))];
      let worst = live;
      let widestW = -Infinity;
      for (const c of candidates) {
        const w = pen.measureText(c).width;
        if (w > widestW) {
          widestW = w;
          worst = c;
        }
      }
      // Where the value starts painting, and where the calendar icon stops --
      // both in viewport coordinates so they are directly comparable.
      const box = el.getBoundingClientRect();
      const icon = el
        .closest('.p-datepicker')
        ?.querySelector('.app-date-field-icon') as HTMLElement | null;
      const iconBox = icon ? icon.getBoundingClientRect() : null;
      return {
        // The input's own id, so a failure names the bar as well as the field.
        key: el.id,
        contentW: +contentW.toFixed(2),
        live,
        worst,
        widestTextW: +widestW.toFixed(2),
        overflowPx: +(widestW - contentW).toFixed(2),
        textLeft: +(box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)).toFixed(2),
        // `null` when the icon is missing, checked separately below. A sentinel
        // number would be worse than useless here: any low value makes
        // `textLeft >= iconRight` pass, so a vanished icon would read as a
        // comfortably-cleared one -- a check that goes green when the thing it
        // measures disappears, which is the exact shape of this card's defect.
        iconRight: iconBox ? +iconBox.right.toFixed(2) : null,
        // OBRS-1640: `null` was never the shape the defect takes. An icon hidden
        // with `display: none` is still FOUND by querySelector -- it just has a
        // zero rect, so `iconRight` is 0, the null check passes and `textLeft >=
        // 0` passes for free. Measured: with `display: none` added to
        // `.app-date-field-icon` in styles.scss this whole file was 12/12 green.
        // The width is what tells a cleared icon from an absent one.
        iconW: iconBox ? +iconBox.width.toFixed(2) : null,
      };
    });
  }, { names: weekdays, prefix: idPrefix });

  // The weekday swap above is `live.replace(/^[^,]*/, name)`, which needs the
  // comma the three `dateFormat`s put after `D`. Without one, `[^,]*` eats the
  // whole value, every candidate collapses to a bare weekday, `Math.max` falls
  // back to the live string and the worst-case half of this gate stops existing
  // -- silently, with the test still green. The format is the app's to change,
  // so this fails loudly and points at the reason instead of guarding it.
  for (const r of rows) {
    expect(
      r.live,
      `${r.key}: no comma in "${r.live}" -- the weekday-swap in dateOverflow assumes ` +
        `CALENDAR.dateFormat starts with "D, "; if that changed, rewrite the swap`
    ).toContain(',');
  }
  return rows;
}

/**
 * OBRS-1640 -- the loop runs on BOTH bars now, and the parcel wizard is
 * deliberately not a third entry.
 *
 * The three call sites are not three of a kind. The two here are four-segment
 * flex rows whose date fields hold `flex: 1 1 0; min-width: 0`, so the box the
 * value gets is whatever the row has left -- 137px of content box before
 * OBRS-1586, 165px after, at a 993px viewport. `parcel-trip-form`'s field is a
 * plain block in the wizard card's own column: it is the only thing on its line,
 * so its box IS the column. Measured at the same 993px in the same run
 * (`bars-1640.json`, this card's captures): 704px wide, 652px of content box, and
 * a value that measures 94.14px. The widest value either bar prints anywhere in
 * this file is 139.05px (`zh`), which that box would clear by 512px. It cannot
 * clip by the mechanism this loop measures, and admitting it here would mean
 * asserting the loop's other claim -- `assertOneRow` -- about a field that is not
 * part of any row.
 *
 * What the parcel field DOES share is the icon clearance below, and that half is
 * a property of the global rule (`padding-left: $app-date-field-segment-inset`
 * against `.app-date-field-icon`'s `left`/`width`), identical at all five sites
 * and pinned here.
 */
for (const { bar, lang } of SEGMENT_BARS.flatMap((b) =>
  ['th', 'en', 'zh'].map((l) => ({ bar: b, lang: l }))
)) {
  test(`at 993 on ${bar.route} in ${lang} every date value keeps ${MIN_HEADROOM_PX}px of headroom`, async ({
    page,
  }) => {
    await open(page, 993, 900, lang, bar);
    const r = await read(page, bar);

    assertOneRow(r);

    // The two DATE segments only -- a SCOPE choice, not a limit of the
    // measurement. The station halves are `<input>`s here too (see `overflowOf`),
    // so a signed headroom IS available for them and a floor could be asserted.
    // It deliberately is not: they carry `text-overflow: ellipsis` by design
    // (dropdown-group-obrs.component.scss:196) because an over-long station name
    // is meant to ellipsize into a panel you can still open, where a
    // half-printed travel date is the defect this card exists for.
    //
    // KNOWN BLIND SPOT, older than this card and not closed by it: nothing here
    // asserts the station halves' WIDTH either. `assertOneRow` checks height,
    // top alignment and adjacency, so a change that quietly took width from them
    // would pass everything in this file.
    const dates = await dateOverflow(page, await weekdayNames(page, lang), bar.idPrefix);
    expect(dates).toHaveLength(2);
    // The ids, not just the count: this is the assertion that a run which landed
    // on the wrong bar fails ON, rather than passing with the other bar's numbers.
    expect(dates.map((d) => d.key)).toEqual([
      `${bar.idPrefix}-departure-date`,
      `${bar.idPrefix}-return-date`,
    ]);

    for (const f of dates) {
      expect(
        f.overflowPx,
        `${f.key}: "${f.worst}" measures ${f.widestTextW}px in a ${f.contentW}px box`
      ).toBeLessThanOrEqual(-MIN_HEADROOM_PX);

      // The OTHER end of the same clearance. Everything above is about the
      // inset on the RIGHT, and a headroom floor keyed on
      // `clientWidth - padLeft - padRight` gets LARGER as the left padding
      // shrinks -- so narrowing `$app-date-field-segment-inset` would make every
      // assertion above greener while sliding the date underneath the calendar
      // icon, which sits at `left: $space-xs` and is 20px wide. The stylesheet
      // says the icon and the inset "are one clearance, not two numbers"
      // (styles.scss, the `--segment` block); this is the assertion that makes
      // that true of the gate as well as of the comment.
      expect(f.iconRight, `${f.key}: no .app-date-field-icon to clear`).not.toBeNull();
      // OBRS-1640: and it has to be DRAWN. Without this the clearance assertion
      // is vacuous the moment the icon is hidden -- proven, not argued: adding
      // `display: none` to `.app-date-field-icon` left this file 12/12 green.
      expect(
        f.iconW,
        `${f.key}: .app-date-field-icon is present but ${f.iconW}px wide -- the clearance below would pass on an icon nobody can see`
      ).toBeGreaterThan(0);
      expect(
        f.textLeft,
        `${f.key}: value starts at ${f.textLeft}px, under the calendar icon that ends at ${f.iconRight}px`
      ).toBeGreaterThanOrEqual(f.iconRight!);
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

  const dark = await read(page);
  for (const f of dark.fields) {
    expect(f.labelColor).toBe('rgb(154, 163, 184)'); // $dk-text-muted
  }

  // And it is still ONE bar in dark. This is not a restatement of the 1280 test:
  // dark-theme.scss puts a 2px accent ring on `.btn-search` (the brand fill needs
  // it to clear 3:1 on the dark card) while every other segment carries a 1px
  // border, and the segments overlap by exactly 1px. A theme that widens one
  // segment's border is precisely how a bar comes apart at one end only.
  assertOneRow(dark);
});
