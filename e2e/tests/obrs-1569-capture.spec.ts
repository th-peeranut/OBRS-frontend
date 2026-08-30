import { Page, expect, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { seedCustomerSession } from '../support/customer-pages';
import { MEASURE, Sweep } from '../support/customer-contrast';

/**
 * OBRS-1569. The evidence for a card whose whole subject is what the SHARED fixture serves,
 * so both arms run against `seedCustomerSession` itself — no bespoke stub adds the endpoints
 * the way obrs-969-capture.spec.ts had to, because after this card the fixture has them.
 *
 * The BEFORE arm is the one that needs machinery: it puts back the state every hermetic lane
 * was actually in, by answering the two paths the fixture used to miss the way the catch-all
 * answered them (`{ code: 200, message: 'OK', data: null }`). That is a reconstruction of the
 * previous behaviour rather than the previous code — and it is exact, because the catch-all it
 * imitates is four lines below the fixture table and unchanged by this card.
 *
 * Prints the whole-page text-run count for both arms because that is the number
 * `CUSTOMER_PAGES.minText` is a floor under, and the old floor of 25 was calibrated on the
 * BEFORE arm without anyone knowing that is what they were measuring.
 */

const ASSETS = `e2e-evidence/obrs-1569`;

/**
 * Registered AFTER seedCustomerSession on purpose: Playwright matches handlers
 * most-recently-added first, so these win for their two paths and the fixture table
 * still answers everything else the page asks for.
 */
const withoutTheTwoLatePolicies = async (page: Page): Promise<void> => {
  const empty = {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message: 'OK', data: null }),
  };
  await page.route('**/reschedule-policy', (route) => route.fulfill(empty));
  await page.route('**/operations-policy', (route) => route.fulfill(empty));
};

const ARMS = [
  { phase: 'BEFORE', stub: withoutTheTwoLatePolicies, terms: 0, inlineError: 1 },
  { phase: 'AFTER', stub: undefined, terms: 1, inlineError: 0 },
] as const;

test.describe('OBRS-1569 — /business-policy under the shared hermetic fixture', () => {
  for (const arm of ARMS) {
    test(`${arm.phase}: shoot both themes and count what the gate would score`, async ({ browser }) => {
      const report: string[] = [];

      for (const dark of [true, false]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
        const sheet = await context.newPage();
        try {
          await seedCustomerSession(sheet, dark);
          // The consent BAR is `position: fixed; bottom: 0` and would sit across the bottom of
          // every shot. Same reason obrs-969-capture.spec.ts seeds it.
          await seedAnalyticsConsent(sheet);
          if (arm.stub) await arm.stub(sheet);

          await sheet.goto('/business-policy', { waitUntil: 'domcontentloaded' });
          await expect(sheet.locator('.policy-card')).toBeVisible();
          await sheet.waitForTimeout(1500);
          // The precondition, asserted rather than assumed: a renamed theme key would shoot the
          // light theme twice and both pictures would look correct.
          expect(await sheet.evaluate(() => document.body.classList.contains('is-dark'))).toBe(dark);

          // Which branch the page is in, stated rather than left to the reader of a picture.
          await expect(sheet.locator('[data-testid="business-policy-terms"]')).toHaveCount(arm.terms);
          await expect(sheet.locator('.policy-inline-error')).toHaveCount(arm.inlineError);

          // WHY THE GATE WAS GREEN OVER THE ERROR BRANCH, asserted rather than argued: both
          // selectors the pre-card `mustRender` named are present in BOTH arms, so that check
          // could not have gone red on the state the BEFORE arm is in. Together with the
          // whole-page count printed below clearing the pre-card floor of 25 in both arms, this
          // is the whole of the old gate's opinion of this page -- and it was "pass" either way.
          await expect(sheet.locator('.policy-card')).toHaveCount(1);
          await expect(sheet.locator('.policy-version')).toHaveCount(1);

          await sheet.screenshot({
            path: `${ASSETS}/OBRS-1569-${arm.phase}-business-policy-${theme}.png`,
            fullPage: true,
          });

          const whole = (await sheet.evaluate(MEASURE)) as Sweep;
          const container = (await sheet.evaluate(MEASURE, '.policy-container')) as Sweep;
          const below = container.text.filter((f) => f.ratio < f.floor);
          report.push(
            `[${arm.phase}/${theme}] whole page: ${whole.measuredText} scoreable text run(s) -- ` +
              `this is the number CUSTOMER_PAGES.minText is a floor under; the pre-card floor ` +
              `of 25 is cleared ${whole.measuredText >= 25 ? 'HERE TOO' : 'NOT'}`
          );
          report.push(
            `[${arm.phase}/${theme}] .policy-container: ${container.measuredText} scoreable text ` +
              `run(s), ${below.length} below floor`
          );
          for (const f of container.text) {
            report.push(`   ${f.ratio.toFixed(2)}:1  ${f.fg} on ${f.bg}  "${f.text}"`);
          }
        } finally {
          await context.close();
        }
      }

      console.log(report.join('\n'));
    });
  }
});
