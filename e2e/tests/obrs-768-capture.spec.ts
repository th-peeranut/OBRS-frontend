import { Page, expect, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { MY_BOOKINGS, seedCustomerSession, seedStore } from '../support/customer-pages';
import { MEASURE, Sweep } from '../support/customer-contrast';

/**
 * OBRS-768 evidence capture - see playwright.obrs768capture.config.ts for how to run it.
 *
 * WHY THIS EXISTS WHEN THE GATE ALREADY SWEEPS BOTH PAGES
 *
 * `/my-bookings` and `/e-ticket` are both in `CUSTOMER_PAGES`, so the contrast gate already
 * measures every text run and control boundary on them, in both themes, on every run. What
 * it cannot answer is this card's actual question. The gate scores CONTRAST - a pair of
 * colours against a floor - and this card is about the SURFACE: the page is white in dark
 * mode, and white-with-dark-text scores perfectly well. The card's own evidence table is
 * not a list of failures, it is a list of IDENTITIES: the same computed colour in both
 * themes. A gate that only prints what fell below a floor can never print that.
 *
 * So this lane reads the surface directly. For each element AC-1 names it records
 * `background-color` / `color` / `border-color` in light and in dark and prints whether the
 * two are the same string. Before this card that identity is the defect; after it, the
 * absence of the identity is the proof, and neither reading depends on anyone's judgement
 * of a screenshot.
 *
 * AC-1 also says "badge ทุกสถานะ", and the shared `/bookings/me` fixture carries three
 * statuses (confirmed / refunded / cancelled) of the four `statusClass()` can return. The
 * fourth - `pending`, the only `.is-warning` - is stubbed on top here rather than added to
 * the shared fixture, which is read by six other specs whose populations would move.
 *
 * Screenshots land in e2e-evidence/ (gitignored) - the only prefix the e2e lane gate allows -
 * are uploaded to the card from there, then deleted.
 */

const PHASE = (process.env['OBRS768_PHASE'] ?? 'AFTER').toUpperCase();
const ASSETS = `e2e-evidence/obrs-768`;

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/**
 * The AC-1 inventory, one entry per named surface. `.state-card` and the two page buttons
 * are not in AC-1's list but are on the same page and take the same white background, so a
 * fix that leaves them behind would be a half-themed page that AC-1's own list calls done.
 */
const MY_BOOKINGS_SURFACES = [
  'section.my-bookings',
  '.my-bookings__header h1',
  '.my-bookings__header p',
  '.my-bookings__count',
  // `:not(.is-active)` rather than a bare `.filter-pill`: the first pill in the DOM is the
  // selected one, so `querySelector('.filter-pill')` returned the ACTIVE variant and the
  // two rows printed the same four values -- the resting pill, which is the one whose
  // boundary is on the register, was never read (measured on the BEFORE run).
  '.filter-pill:not(.is-active)',
  '.filter-pill.is-active',
  '.booking-card',
  '.booking-card__ref .label',
  '.booking-card__ref strong',
  '.booking-card__route',
  '.booking-card__route .trip-type',
  '.booking-card__meta',
  '.booking-card__meta dt',
  '.booking-card__meta dd',
  '.booking-card__meta .amount',
  '.actions-menu-btn',
  '.status-badge.is-success',
  '.status-badge.is-warning',
  '.status-badge.is-info',
  '.status-badge.is-danger',
];

/**
 * `/e-ticket`. The ticket paper is a DOCUMENTED dark-theme exemption - dark-theme.scss
 * section 15, design-system.md's "bespoke static-token button on a dark-theme-exempt
 * surface" (OBRS-269), and the OBRS-296/OBRS-857 comments in this page's own scss and
 * html - so its surfaces are probed here to RECORD what the exemption currently produces,
 * not on an assumption that they are defects. `.ticket-page` is the band around it, which
 * section 15 already darkens; that rule's effectiveness is measured here rather than read
 * off the stylesheet, which is what AC-3 asks for.
 */
const E_TICKET_SURFACES = [
  '.ticket-page',
  '.ticket-stage',
  '.ticket-shell',
  '.ticket-paper',
  '.ticket-header',
  '.ticket-subtitle',
  '.ticket-grid',
  '.ticket-item .label',
  '.ticket-item .value',
  '.ticket-divider',
  '.ticket-route',
  '.ticket-footer',
  '.ticket-total .label',
  '.download-btn',
  // Kept in the list although the seeded ticket does not reach them, so the run PRINTS
  // "ABSENT" for each rather than leaving a reader to assume the page was fully probed.
  // Same rule the /find-booking entry in customer-pages.ts follows: say what was not
  // covered instead of implying coverage with a green line.
  '.passenger-row',
  '.qr-hint',
  '.ticket-retrieval-note',
];

/**
 * One booking per badge class, so AC-1's "every status" is a population, not a sample.
 *
 * Built from the shared MY_BOOKINGS constant rather than from the answer the catch-all
 * handler would have given: `route.fetch()` goes to the REAL network, which in this lane is
 * localhost:8080 with nothing listening, and it came back "Invalid CORS request" instead of
 * the fixture. A later route handler cannot read an earlier one's reply.
 */
const withPendingBooking = async (page: Page): Promise<void> => {
  const body = JSON.parse(JSON.stringify(MY_BOOKINGS)) as {
    data: { content: Record<string, unknown>[]; totalElements: number; numberOfElements: number };
  };
  const rows = body.data.content;
  const pending = JSON.parse(JSON.stringify(rows[0])) as Record<string, unknown>;
  pending['id'] = 504;
  pending['bookingNumber'] = 'B-000504';
  pending['status'] = 'pending';
  for (const leg of (pending['bookingSchedules'] as { tickets?: { status: string }[] }[]) ?? []) {
    for (const ticket of leg.tickets ?? []) ticket.status = 'pending';
  }
  rows.push(pending);
  body.data.totalElements = rows.length;
  body.data.numberOfElements = rows.length;

  await page.route('**/bookings/me*', (route) => route.fulfill(ok(body.data)));
};

interface SurfaceReading {
  selector: string;
  found: boolean;
  bg: string;
  color: string;
  border: string;
}

const READ_SURFACES = (selectors: string[]): SurfaceReading[] =>
  selectors.map((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { selector, found: false, bg: '', color: '', border: '' };
    const cs = getComputedStyle(el);
    return {
      selector,
      found: true,
      bg: cs.backgroundColor,
      color: cs.color,
      border: cs.borderTopColor,
    };
  });

/** Findings only - MEASURE returns everything it could score, pass or fail. */
const failing = (s: Sweep) => [
  ...s.text.filter((f) => f.ratio < f.floor).map((f) => `TEXT  ${f.ratio.toFixed(2)}:1 (needs ${f.floor}) ${f.fg}-on-${f.bg} ${f.path} -- "${f.text}"`),
  ...s.placeholders.filter((f) => f.ratio < f.floor).map((f) => `PLCH  ${f.ratio.toFixed(2)}:1 (needs ${f.floor}) ${f.fg}-on-${f.bg} ${f.path}`),
  ...s.controls.filter((c) => c.boundary < 3).map((c) => `BOUND ${c.boundary.toFixed(2)}:1 (needs 3) fill ${c.fill} border ${c.border} on ${c.page} ${c.path}`),
];

const worstText = (s: Sweep) =>
  s.text
    .slice()
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 12)
    .map((f) => `      ${f.ratio.toFixed(2)}:1 (floor ${f.floor}) ${f.fg} on ${f.bg}  ${f.path} -- "${f.text.slice(0, 40)}"`);

interface Target {
  key: string;
  url: string;
  ready: string;
  seed: boolean;
  surfaces: string[];
  extraStub?: (page: Page) => Promise<void>;
}

const TARGETS: Target[] = [
  {
    key: 'my-bookings',
    url: '/my-bookings',
    ready: '.booking-card',
    seed: false,
    surfaces: MY_BOOKINGS_SURFACES,
    extraStub: withPendingBooking,
  },
  {
    key: 'e-ticket',
    url: '/e-ticket',
    ready: '.ticket-paper',
    seed: true,
    surfaces: E_TICKET_SURFACES,
  },
];

test.describe(`OBRS-768 ${PHASE} — /my-bookings and /e-ticket in dark mode`, () => {
  for (const target of TARGETS) {
    test(`${target.key}: shoot both themes and read every surface AC-1 names`, async ({
      browser,
    }) => {
      const report: string[] = [];
      const readings: Record<string, SurfaceReading[]> = {};

      for (const dark of [true, false]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
        const sheet = await context.newPage();
        try {
          await seedCustomerSession(sheet, dark);
          // The consent bar is `position: fixed; bottom: 0` and would sit across the bottom
          // of every shot. Its own reachability is OBRS-1372's question, not this card's.
          await seedAnalyticsConsent(sheet);
          // Registered AFTER seedCustomerSession on purpose: Playwright matches handlers
          // most-recently-added first, so this one wins for its path and the catch-all still
          // covers everything else on the page.
          if (target.extraStub) await target.extraStub(sheet);

          await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
          if (target.seed) {
            await sheet.waitForTimeout(2500);
            await seedStore(sheet);
            await sheet.waitForTimeout(1200);
          }
          await expect(sheet.locator(target.ready).first()).toBeVisible();
          // The precondition, asserted rather than assumed: a renamed theme key would
          // shoot the light theme twice and both pictures would look correct.
          expect(await sheet.evaluate(() => document.body.classList.contains('is-dark'))).toBe(dark);

          await sheet.screenshot({
            path: `${ASSETS}/OBRS-768-${PHASE}-${target.key}-${theme}.png`,
            fullPage: true,
          });

          readings[theme] = (await sheet.evaluate(READ_SURFACES, target.surfaces)) as SurfaceReading[];

          const sweep = (await sheet.evaluate(MEASURE)) as Sweep;
          report.push(
            `[${theme}] ${sweep.measuredText} text run(s) scored, worst twelve:`
          );
          report.push(...worstText(sweep));
          const bad = failing(sweep);
          report.push(
            bad.length
              ? `[${theme}] ${bad.length} below floor:`
              : `[${theme}] nothing below floor`
          );
          report.push(...bad.map((l) => `  !! ${l}`));
        } finally {
          await context.close();
        }
      }

      // ---- the card's actual claim: same computed colour in both themes ---------------
      //
      // Printed as a table with an explicit verdict per surface so the BEFORE and the AFTER
      // can be diffed line for line. "SAME" is the defect this card was opened for; it is
      // also the correct answer for a surface that is deliberately theme-exempt, which is
      // why the verdict column states the fact and does not grade it.
      report.push('');
      report.push('SURFACE IDENTITY (light vs dark computed values)');
      let same = 0;
      let differs = 0;
      let missing = 0;
      for (let i = 0; i < target.surfaces.length; i++) {
        const l = readings['light'][i];
        const d = readings['dark'][i];
        if (!l.found || !d.found) {
          missing++;
          report.push(`  ABSENT  ${l.selector}  (light ${l.found ? 'yes' : 'no'} / dark ${d.found ? 'yes' : 'no'})`);
          continue;
        }
        const identical = l.bg === d.bg && l.color === d.color && l.border === d.border;
        if (identical) same++;
        else differs++;
        report.push(`  ${identical ? 'SAME   ' : 'DIFFERS'} ${l.selector}`);
        report.push(`            light  bg ${l.bg} | color ${l.color} | border ${l.border}`);
        report.push(`            dark   bg ${d.bg} | color ${d.color} | border ${d.border}`);
      }
      report.push(`  totals: ${same} identical, ${differs} theme-aware, ${missing} not rendered`);

      console.log(`\n===== OBRS-768 ${PHASE} ${target.key} =====`);
      for (const line of report) console.log(line);
      console.log(`===== end ${PHASE} ${target.key} =====\n`);

      // Deliberately NOT asserted here. This lane's job is to produce the numbers and the
      // pictures; the verdict on contrast belongs to the GATE lane, which owns the allowlist
      // and fails the build. What this lane measures that the gate does not - the identity -
      // has no floor to assert against, only a before and an after.
      expect(report.length).toBeGreaterThan(0);
    });
  }
});
