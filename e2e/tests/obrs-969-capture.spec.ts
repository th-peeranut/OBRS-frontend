import { Page, expect, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { seedCustomerSession } from '../support/customer-pages';
import { MEASURE, Sweep } from '../support/customer-contrast';

/**
 * OBRS-969 evidence capture - see playwright.obrs969capture.config.ts for how to run it.
 *
 * WHY THIS EXISTS WHEN THE GATE ALREADY SWEEPS ALL FOUR PAGES
 *
 * Cloned from obrs-768-capture.spec.ts, whose header argues the point this card needs
 * again: `/refund-policy`, `/business-policy`, `/privacy-policy` and `/parcel-policy` are
 * all in `CUSTOMER_PAGES` since OBRS-970, so the contrast gate scores every text run on
 * them in both themes on every run - and it measured them GREEN, because a white surface
 * with `$text-black` on it is a perfectly legible pair. That measurement is quoted in
 * customer-pages.ts and it is why 969 is a theme-consistency defect rather than a contrast
 * one. A floor cannot express "the same colour in both themes"; this lane prints it.
 *
 * So each surface below is read in light and in dark and gets a SAME/DIFFERS verdict. In
 * the BEFORE run SAME is the defect. In the AFTER run the identity is gone and the
 * contrast numbers, which the gate DOES own, must still clear their floors - so this lane
 * prints those too, for the new dark pairs that did not exist before.
 *
 * `/parcel-policy` is measured as the FOURTH page and not as a control: OBRS-629 shipped
 * it after this card was written with the same `.policy-container { $primary-white }` copy,
 * and customer-pages.ts already notes that the card's "three policy pages" are four today.
 *
 * Served with `--configuration gate` for one reason: `analytics-consent-control` renders
 * only when `environment.analytics` carries a measurement ID (OBRS-1179), and every
 * committed environment except `gate` leaves that blank. AC-2 is about that component, so
 * a default build would print ABSENT for it and prove nothing.
 *
 * Screenshots land in e2e-evidence/ (gitignored) - the only prefix the e2e lane gate allows -
 * are uploaded to the card from there, then deleted.
 */

const PHASE = (process.env['OBRS969_PHASE'] ?? 'AFTER').toUpperCase();
const ASSETS = `e2e-evidence/obrs-969`;

/** The pair the card is about, on every one of these pages. */
const POLICY_SURFACES = [
  '.policy-container',
  '.policy-card',
  '.policy-card h1',
  '.policy-card p',
];

/**
 * The withdrawal control, whose stylesheet carries the OBRS-874 comment promising it
 * "gains its override in the same change" as the policy background. Only on
 * `/privacy-policy`.
 */
const CONSENT_SURFACES = [
  '.consent-control',
  '.consent-control__title',
  '.consent-control__status',
  '.consent-control__btn',
  '.consent-control__note',
];

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

/**
 * Every text run inside one subtree, worst first. AC-3 asks for the numbers rather than a
 * verdict, so this prints the whole population of the subtree it is given and not a
 * top-N slice: a policy card holds a few dozen runs, which is a table a reader can check.
 */
const allText = (s: Sweep) =>
  s.text
    .slice()
    .sort((a, b) => a.ratio - b.ratio)
    .map((f) => `      ${f.ratio.toFixed(2)}:1 (floor ${f.floor}) ${f.fg} on ${f.bg}  ${f.path} -- "${f.text.slice(0, 40)}"`);

/**
 * `/business-policy` forkJoins FOUR endpoints and shows one inline error if ANY of them
 * fails. `FIXTURES` in customer-pages.ts serves two of them - `/booking-policy` and
 * `/cancellation-policy` - and has never served `/reschedule-policy` (OBRS-657) or
 * `/operations-policy` (OBRS-703), both of which the page has read since those cards. So
 * the BEFORE run shot this page in its ERROR branch, with the terms absent, and that is a
 * legal surface whose body copy is exactly what the owner has to look at.
 *
 * Stubbed HERE rather than by widening the shared fixture, for the reason
 * obrs-768-capture.spec.ts gives about `/bookings/me`: that object is read by five other
 * suites whose populations would move. Shapes copied from the four `flush()` calls in
 * business-policy.component.spec.ts, which is the file that pins them.
 *
 * That the shared fixture is short two endpoints is not this card's to fix, but it is not
 * nothing either: the GATE lane sweeps this page every run and its floors were read off a
 * run in this same error branch. Raised as its own card rather than patched here.
 */
const withBusinessPolicyTerms = async (page: Page): Promise<void> => {
  const ok = (data: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message: 'OK', data }),
  });
  await page.route('**/reschedule-policy', (route) =>
    route.fulfill(
      ok({
        rescheduleWindowHours: 2,
        rescheduleMaxDaysAhead: 60,
        rescheduleFeeLateThb: 30,
        rescheduleMaxCount: 0,
      })
    )
  );
  await page.route('**/operations-policy', (route) => route.fulfill(ok({ noShowCutoffMinutes: 10 })));
};

interface Target {
  key: string;
  url: string;
  ready: string;
  surfaces: string[];
  /** Asserted ABSENT before anything is shot. See the business-policy entry for why. */
  absent?: string;
  extraStub?: (page: Page) => Promise<void>;
}

const TARGETS: Target[] = [
  { key: 'refund-policy', url: '/refund-policy', ready: '.policy-body', surfaces: POLICY_SURFACES },
  {
    key: 'business-policy',
    url: '/business-policy',
    // Nothing in the resolved-terms branch carries a class of its own, and `.policy-version`
    // renders in the error branch too - so readiness is stated the other way round: the
    // cross-link is always there, and the inline error must NOT be. Without the second half
    // a broken stub would shoot the error branch again and the picture would look deliberate.
    ready: '.policy-cross-link',
    absent: '.policy-inline-error',
    surfaces: POLICY_SURFACES,
    extraStub: withBusinessPolicyTerms,
  },
  {
    key: 'privacy-policy',
    url: '/privacy-policy',
    ready: '.policy-body',
    surfaces: [...POLICY_SURFACES, ...CONSENT_SURFACES],
  },
  { key: 'parcel-policy', url: '/parcel-policy', ready: '.policy-prohibited-list', surfaces: POLICY_SURFACES },
];

test.describe(`OBRS-969 ${PHASE} — the policy pages in dark mode`, () => {
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
          // The consent BAR is `position: fixed; bottom: 0` and would sit across the bottom
          // of every shot. Seeding it settled leaves the consent CONTROL on the privacy
          // page untouched - that is a different component and this card's AC-2.
          await seedAnalyticsConsent(sheet);
          // Registered AFTER seedCustomerSession on purpose: Playwright matches handlers
          // most-recently-added first, so this one wins for its paths and the catch-all still
          // covers everything else on the page.
          if (target.extraStub) await target.extraStub(sheet);

          await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
          await expect(sheet.locator(target.ready).first()).toBeVisible();
          if (target.absent) await expect(sheet.locator(target.absent)).toHaveCount(0);
          // The precondition, asserted rather than assumed: a renamed theme key would
          // shoot the light theme twice and both pictures would look correct.
          expect(await sheet.evaluate(() => document.body.classList.contains('is-dark'))).toBe(dark);

          await sheet.screenshot({
            path: `${ASSETS}/OBRS-969-${PHASE}-${target.key}-${theme}.png`,
            fullPage: true,
          });

          readings[theme] = (await sheet.evaluate(READ_SURFACES, target.surfaces)) as SurfaceReading[];

          // Narrowed to the card, not the whole page: the navbar and the footer are on
          // every page in CUSTOMER_PAGES and the gate already owns them. What this card
          // changes lives under `.policy-container`.
          const sweep = (await sheet.evaluate(MEASURE, '.policy-container')) as Sweep;
          report.push(`[${theme}] .policy-container: ${sweep.measuredText} text run(s) scored`);
          report.push(...allText(sweep));
          const bad = failing(sweep);
          report.push(bad.length ? `[${theme}] ${bad.length} below floor:` : `[${theme}] nothing below floor`);
          report.push(...bad.map((l) => `  !! ${l}`));
        } finally {
          await context.close();
        }
      }

      // ---- the card's actual claim: same computed colour in both themes ---------------
      //
      // Printed as a table with an explicit verdict per surface so BEFORE and AFTER diff
      // line for line. "SAME" is the defect this card was opened for.
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

      console.log(`\n===== OBRS-969 ${PHASE} ${target.key} =====`);
      for (const line of report) console.log(line);
      console.log(`===== end ${PHASE} ${target.key} =====\n`);

      // Deliberately NOT asserted here, for the reason obrs-768-capture.spec.ts gives: the
      // verdict on contrast belongs to the GATE lane, which owns the allowlist and fails
      // the build. This lane produces the numbers and the pictures.
      expect(report.length).toBeGreaterThan(0);
    });
  }
});
