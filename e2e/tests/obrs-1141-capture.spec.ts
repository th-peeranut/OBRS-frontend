import { expect, test, Page } from '@playwright/test';
import { seedCustomerSession, seedStore } from '../support/customer-pages';
// OBRS-882's lesson, applied: without this the PDPA consent bar is UP and its
// fixed footer covers the bottom of the results panel, so a passing AC
// photographs as a truncated page.
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-1141 — BEFORE/AFTER evidence for the announced-delay disclosure, plus the
 * two things a screenshot on its own cannot prove.
 *
 * WHY THIS SPEC EXISTS AT ALL, GIVEN 24 UNIT TESTS. Two of the card's criteria
 * are about the rendered page rather than the component tree:
 *
 *   - AC2 says an ordinary round must look EXACTLY as it did, to the pixel. A
 *     Karma spec can prove the notice emits no elements; it cannot prove the
 *     host box costs no layout. This spec prints the on-time row's MEASURED
 *     geometry as an `OBRS-1141-GEOMETRY` line, so the same run on `dev` and on
 *     this branch can be compared number for number.
 *   - The badge's colours are legible only over the background that actually
 *     painted, and dark mode reaches this component through a global
 *     `.schedule-item * { color: ... !important }` rule that a component rule
 *     has to outrank (OBRS-767's whole subject). So the contrast pair is
 *     MEASURED off the painted pixels here, in both themes, not read out of
 *     variables.scss.
 *
 * HOW THE BEFORE IMAGES ARE TAKEN. Set `OBRS_1141_BEFORE=1` and re-run with the
 * src/ and public/ changes set aside (`git stash push -u -- src public`). The
 * fixture already carries `scheduledDepartureDateTime`, and a `dev` build simply
 * ignores it — so the same rows render with no disclosure at all. That is the
 * defect photographed rather than described: a customer searching after the
 * announcement sees one time and no way to know it moved. In that mode the
 * disclosure assertions are skipped (they are the thing that does not exist
 * yet) while the AC2 assertion and the geometry measurement still run, which is
 * what makes the two OBRS-1141-GEOMETRY lines comparable.
 *
 *   npx playwright test --config=playwright.obrs1141.config.ts
 */
const ASSETS = 'e2e-evidence/OBRS-1141';
/** See the header — BEFORE mode photographs `dev`, so it asserts only AC2. */
const BEFORE = !!process.env['OBRS_1141_BEFORE'];
const STAGE = BEFORE ? 'BEFORE' : 'AFTER';

/** sRGB relative luminance, per WCAG 2.x. */
function luminance([r, g, b]: number[]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: number[], bg: number[]): number {
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function parseRgb(value: string): number[] {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`not a colour: ${value}`);
  return match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Number(part.trim()));
}

/**
 * The rows this card is about, in the shape `POST /api/schedules/search`
 * returns them after OBRS-1099: `departureDateTime` is ALREADY the effective
 * time, and `scheduledDepartureDateTime` is present only on a delayed round.
 */
const row = (
  id: number,
  departure: string,
  arrival: string,
  planned: string | null
) => ({
  id,
  vehicleType: 'minibus',
  departureDateTime: departure,
  arrivalDateTime: arrival,
  ...(planned ? { scheduledDepartureDateTime: planned } : {}),
  pricePerSeat: 180,
  availableSeats: 9,
  availableSeatNumbers: ['A1', 'A2', 'A3'],
  routeSlug: 'chonburi_bangkok',
  seatingMode: 'ASSIGNED',
});

// Three outbound rows on purpose — the control and both delayed shapes on one
// screen, so a reviewer sees the difference rather than being told about it.
const ON_TIME = row(101, '2030-06-17T08:00:00+07:00', '2030-06-17T10:30:00+07:00', null);
const DELAYED = row(
  102,
  '2030-06-17T15:00:00+07:00',
  '2030-06-17T17:30:00+07:00',
  '2030-06-17T13:00:00+07:00'
);
// AC5: 23:30 announced an hour late leaves at 00:30 the NEXT day and stays in
// the searched day's results, because the sale window and the day bucket are
// both computed from the planned time (OBRS-1099 AC1/AC9). Without the date
// this row reads as a bug.
const OVERNIGHT = row(
  103,
  '2030-06-18T00:30:00+07:00',
  '2030-06-18T03:00:00+07:00',
  '2030-06-17T23:30:00+07:00'
);
// The return leg gets its own delayed row — AC3.
const RETURN_DELAYED = row(
  201,
  '2030-06-20T12:00:00+07:00',
  '2030-06-20T14:30:00+07:00',
  '2030-06-20T09:00:00+07:00'
);
const RETURN_ON_TIME = row(202, '2030-06-20T18:00:00+07:00', '2030-06-20T20:30:00+07:00', null);

/** Replace whatever `seedStore` put in the schedule list with this card's rows. */
async function seedRows(page: Page, roundTrip: boolean): Promise<void> {
  await page.evaluate(
    (list) => {
      const ng = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
      if (!ng || !ng.getComponent) throw new Error('window.ng is absent — not a development build?');
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cmp = ng.getComponent(el) as { store?: { dispatch?: unknown } } | null;
        if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
          (cmp.store as { dispatch(a: unknown): void }).dispatch({
            type: '[ScheduleList API] Set Schedule List Success',
            schedule_list: list,
          });
          return;
        }
      }
      throw new Error('no component on the page exposes an NgRx Store');
    },
    {
      departureSchedules: [ON_TIME, DELAYED, OVERNIGHT],
      arrivalSchedules: roundTrip ? [RETURN_DELAYED, RETURN_ON_TIME] : null,
    }
  );
}

async function openResults(page: Page, dark: boolean, roundTrip = false): Promise<void> {
  await seedAnalyticsConsent(page);
  await seedCustomerSession(page, dark);
  await page.goto('/schedule-booking', { waitUntil: 'domcontentloaded' });
  await seedStore(page);
  await seedRows(page, roundTrip);
  await expect(page.locator('.schedule-item').first()).toBeVisible();
  // Nothing may be floating over the panel when the shutter opens: a fixed
  // consent bar or an HTTP-error swal photographs a passing AC as a broken
  // page, and the reviewer has no way to tell the two apart.
  await expect(page.locator('.consent-banner')).toHaveCount(0);
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  // The 'Report Issue' FAB is position:fixed bottom-right and sits on top of
  // the last row's button. DISCLOSED rather than quietly composed away: it is
  // hidden for the shot only, it is not part of this card, and every state
  // these images claim is reachable with it on screen.
  await page.addStyleTag({ content: 'app-report-usability-fab { display: none !important; }' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Three ordinary rounds and nothing else — the control case for AC2. */
async function seedAllOnTime(page: Page): Promise<void> {
  await seedAnalyticsConsent(page);
  await seedCustomerSession(page, false);
  await page.goto('/schedule-booking', { waitUntil: 'domcontentloaded' });
  await seedStore(page);
  await page.evaluate(
    (list) => {
      const ng = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
      if (!ng || !ng.getComponent) throw new Error('window.ng is absent');
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cmp = ng.getComponent(el) as { store?: { dispatch?: unknown } } | null;
        if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
          (cmp.store as { dispatch(a: unknown): void }).dispatch({
            type: '[ScheduleList API] Set Schedule List Success',
            schedule_list: list,
          });
          return;
        }
      }
      throw new Error('no component on the page exposes an NgRx Store');
    },
    {
      departureSchedules: [
        ON_TIME,
        { ...ON_TIME, id: 111, departureDateTime: '2030-06-17T12:00:00+07:00', arrivalDateTime: '2030-06-17T14:30:00+07:00' },
        { ...ON_TIME, id: 112, departureDateTime: '2030-06-17T18:00:00+07:00', arrivalDateTime: '2030-06-17T20:30:00+07:00' },
      ],
      arrivalSchedules: null,
    }
  );
  await expect(page.locator('.schedule-item').first()).toBeVisible();
  // Nothing may be floating over the panel when the shutter opens: a fixed
  // consent bar or an HTTP-error swal photographs a passing AC as a broken
  // page, and the reviewer has no way to tell the two apart.
  await expect(page.locator('.consent-banner')).toHaveCount(0);
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  // The 'Report Issue' FAB is position:fixed bottom-right and sits on top of
  // the last row's button. DISCLOSED rather than quietly composed away: it is
  // hidden for the shot only, it is not part of this card, and every state
  // these images claim is reachable with it on screen.
  await page.addStyleTag({ content: 'app-report-usability-fab { display: none !important; }' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test.describe('OBRS-1141 — announced-delay disclosure on search results', () => {
  test('captures the results list in both themes and measures the badge', async ({ page }) => {
    await openResults(page, false);

    const items = page.locator('.schedule-item');
    await expect(items).toHaveCount(3);

    // The control row must carry NO disclosure at all — true in BOTH stages,
    // which is exactly what AC2 claims and why this one is never skipped.
    await expect(items.nth(0).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(0);

    if (!BEFORE) {
      // The two delayed rows must each carry exactly one (AC1) — asserted here
      // as well as in Karma, because this is the compiled cascade rather than a
      // test harness.
      await expect(items.nth(1).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(1);
      await expect(items.nth(2).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(1);

      // AC5: only the row that crosses midnight names a date.
      await expect(items.nth(1).locator('[data-testid="schedule-delay-date"]')).toHaveCount(0);
      await expect(items.nth(2).locator('[data-testid="schedule-delay-date"]')).toHaveCount(1);
    }

    await page
      .locator('.booking-container:has(.schedule-item)')
      .screenshot({ path: `${ASSETS}/${STAGE}-1-search-results-light.png` });

    // Measured off the painted pixels — the light pair is the staff shell's
    // --admin-delayed-* (#ede9fe / #4c1d95), reused so one event has one colour.
    // There is no badge to measure on `dev`, which is the point of BEFORE.
    const light = BEFORE ? null : await colourPair(page, '.schedule-delay-notice__badge');
    const lightRatio = light ? contrast(light.fg, light.bg) : 0;
    if (light) expect(lightRatio).toBeGreaterThan(4.5);

    // AC2, the part a picture cannot settle: the on-time row's geometry.
    const geometry = await page.evaluate(() => {
      const box = (sel: string, index = 0) => {
        const el = document.querySelectorAll(sel)[index];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        onTimeRow: box('.schedule-item', 0),
        onTimeTime: box('.schedule-item .time', 0),
        container: box('.booking-container:has(.schedule-item)'),
      };
    });

    // Dark mode reaches this badge only if the component rule outranks
    // `body.is-dark .schedule-item * { color: ... !important }`. Measuring it
    // here is the only way to know it did (OBRS-767).
    await openResults(page, true);
    await expect(page.locator('body.is-dark')).toHaveCount(1);
    await page
      .locator('.booking-container:has(.schedule-item)')
      .screenshot({ path: `${ASSETS}/${STAGE}-2-search-results-dark.png` });

    const dark = BEFORE ? null : await colourPair(page, '.schedule-delay-notice__badge');
    const darkRatio = dark ? contrast(dark.fg, dark.bg) : 0;
    if (dark) expect(darkRatio).toBeGreaterThan(4.5);

    if (light && dark) {
      // eslint-disable-next-line no-console
      console.log(
        `OBRS-1141-CONTRAST light=${lightRatio.toFixed(2)}:1 fg=${light.fg} bg=${light.bg} | ` +
          `dark=${darkRatio.toFixed(2)}:1 fg=${dark.fg} bg=${dark.bg}`
      );
    }
    // eslint-disable-next-line no-console
    console.log(`OBRS-1141-GEOMETRY ${STAGE} ${JSON.stringify(geometry)}`);
  });

  test('captures the RETURN leg of a round trip disclosing its own delay (AC3)', async ({
    page,
  }) => {
    await openResults(page, false, true);

    // The return list only renders once an outbound trip has been chosen. The
    // outbound rows stay on screen (their button flips to "change"), so the
    // page then holds 3 outbound + 2 return rows.
    await page.locator('.schedule-item .select-btn').first().click();
    await expect(page.locator('.schedule-item')).toHaveCount(5);

    const items = page.locator('.schedule-item');
    if (!BEFORE) {
      // 0-2 outbound: on time, delayed, delayed across midnight.
      await expect(items.nth(0).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(0);
      await expect(items.nth(1).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(1);
      await expect(items.nth(2).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(1);
      // 3-4 RETURN leg — this is what AC3 is about: the second half of a round
      // trip renders from a different block of the same template and would have
      // kept the defect if only the outbound leg had been fixed.
      await expect(items.nth(3).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(1);
      await expect(items.nth(4).locator('[data-testid="schedule-delay-notice"]')).toHaveCount(0);
    }

    await page
      .locator('.booking-container:has(.schedule-item)')
      .screenshot({ path: `${ASSETS}/${STAGE}-3-round-trip-return-leg.png` });
  });
});

/**
 * AC2, stated the only way it can be settled: a search in which NOTHING is
 * delayed must render identically on `dev` and on this branch.
 *
 * The other two tests deliberately mix delayed rows in, so their panel is taller
 * here than on `dev` BY DESIGN and cannot answer this. This one seeds three
 * ordinary rounds and prints the whole results panel's geometry plus the exact
 * length of its rendered HTML, so the BEFORE and AFTER lines can be compared
 * character for character. The empty `<app-schedule-delay-notice>` hosts DO
 * appear in that HTML — that is why the length is reported next to the geometry
 * rather than instead of it: the claim is that they cost no LAYOUT, not that
 * they are invisible to the DOM.
 */
test('AC2 — a results panel with no delayed rounds is geometrically unchanged', async ({
  page,
}) => {
  await seedAllOnTime(page);

  const items = page.locator('.schedule-item');
  await expect(items).toHaveCount(3);
  await expect(page.locator('[data-testid="schedule-delay-notice"]')).toHaveCount(0);

  const measured = await page.evaluate(() => {
    const panel = document.querySelector('.booking-container:has(.schedule-item)');
    if (!panel) throw new Error('no results panel');
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    const panelRect = panel.getBoundingClientRect();
    return {
      panel: rect(panel),
      // Row boxes RELATIVE to the panel, so a shift in the page chrome above
      // (webfont swap, scrollbar) cannot masquerade as a change in this card.
      rows: Array.from(panel.querySelectorAll('.schedule-item')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: Math.round((r.top - panelRect.top) * 100) / 100,
          left: Math.round((r.left - panelRect.left) * 100) / 100,
          width: r.width,
          height: r.height,
        };
      }),
      htmlLength: panel.innerHTML.length,
    };
  });

  // eslint-disable-next-line no-console
  console.log(`OBRS-1141-AC2 ${STAGE} ${JSON.stringify(measured)}`);

  await page
    .locator('.booking-container:has(.schedule-item)')
    .screenshot({ path: `${ASSETS}/${STAGE}-4-all-on-time.png` });
});

/** Computed colour/background-color of one element, walking up for a real background. */
async function colourPair(page: Page, selector: string): Promise<{ fg: number[]; bg: number[] }> {
  const raw = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing: ${sel}`);
    const fg = getComputedStyle(el).color;

    let node: Element | null = el;
    let bg = 'rgba(0, 0, 0, 0)';
    while (node) {
      const candidate = getComputedStyle(node).backgroundColor;
      if (candidate && !candidate.startsWith('rgba(0, 0, 0, 0)') && candidate !== 'transparent') {
        bg = candidate;
        break;
      }
      node = node.parentElement;
    }
    return { fg, bg };
  }, selector);

  return { fg: parseRgb(raw.fg), bg: parseRgb(raw.bg) };
}
