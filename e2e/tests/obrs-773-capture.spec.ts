import { test, Page, expect } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { MEASURE, Sweep } from '../support/customer-contrast';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-773 -- BEFORE/AFTER evidence for the Jira card, plus the measurement its
 * AC-1 is written in.
 *
 *   OBRS_CAPTURE_STAGE=BEFORE npx playwright test --config=playwright.obrs773capture.config.ts
 *   OBRS_CAPTURE_STAGE=AFTER  npx playwright test --config=playwright.obrs773capture.config.ts
 *
 * The BEFORE run is taken with src/styles/dark-theme.scss restored to origin/dev
 * in this same worktree, so the dev server rebuilds and the frame is the real
 * previous runtime rather than a CSS override pretending to be one.
 *
 * WHY THIS EXISTS WHEN THE GATE ALREADY SWEEPS THESE PAGES. Two reasons, and
 * neither is "more coverage":
 *
 *   1. Pictures. The gate prints ratios; the card's AC-4 asks for the screen,
 *      and the owner reviews a theme change by looking at it.
 *   2. The gate reports only what FAILS against its allowlist. Four of this
 *      family's eight members pass today at 3.15:1 and 3.54:1, so the gate is
 *      silent about them in both trees -- and "silent" is exactly the wrong
 *      evidence for a change whose stated purpose is to lift those four from
 *      barely-passing to 8.29:1. This prints every row it scores, pass or fail.
 *
 * It asserts nothing about the floors on purpose: the verdict belongs to the
 * gate, which owns the allowlist and fails the build. A second, weaker judge on
 * the same question is worse than none. The only assertions here are the two
 * that decide whether a frame is evidence at all -- dark mode actually applied,
 * and the button actually rendered.
 *
 * `MEASURE` is the gate's own sweep (e2e/support/customer-contrast.ts), narrowed
 * to one selector, so a number printed here and a number printed by the gate
 * mean the same thing. One consequence worth stating: its CONTROLS filter is
 * `button, [role="button"], input, select, textarea, a.btn, a[class*="-btn"]`,
 * and payment-summary's `.btn-confirm` is a bare `<div>`. It is photographed
 * here and it is NOT scored -- by the gate or by this file. That div is a
 * separate a11y defect, not this card's.
 *
 * Screenshots land in e2e-evidence/ (gitignored -- the only prefix the e2e lane
 * gate allows), are uploaded to the card from there, then deleted.
 *
 * ASCII-only source.
 */

const STAGE = (process.env['OBRS_CAPTURE_STAGE'] ?? 'AFTER').toUpperCase();
const ASSETS = 'e2e-evidence/obrs-773';

/** Page key -> the family members to photograph on it, and which to hover. */
const SHOOT: { key: string; targets: string[]; hover: string[] }[] = [
  { key: 'home', targets: ['.btn-search'], hover: ['.btn-search'] },
  // Four auth pages, not one. /login owns its own dark rule (OBRS-774 moved it
  // into login.component.scss), the other three share _auth-split-layout.scss,
  // and that shared file's dark block themes text only -- so the two halves can
  // disagree about `.login-btn` and the card's single 3.15:1 row cannot say
  // which half it measured. Shooting both settles it.
  { key: 'login', targets: ['.login-btn'], hover: ['.login-btn'] },
  { key: 'register', targets: ['.login-btn'], hover: ['.login-btn'] },
  { key: 'login-mobile', targets: ['.login-btn'], hover: ['.login-btn'] },
  { key: 'forget-password', targets: ['.login-btn'], hover: ['.login-btn'] },
  { key: 'schedule-booking', targets: ['.select-btn'], hover: ['.select-btn'] },
  { key: 'review-schedule-booking', targets: ['.btn-confirm'], hover: ['.btn-confirm'] },
  { key: 'passenger-info', targets: ['.btn-next', '.promo-code-apply-btn'], hover: ['.btn-next'] },
  { key: 'payment', targets: ['.payment-btn', '.btn-confirm'], hover: ['.payment-btn'] },
];

function report(key: string, state: string, selector: string, sweep: Sweep): void {
  if (sweep.controls.length === 0) {
    console.log(
      `[${STAGE}] ${key} (${state}) ${selector}: NOT SCORED -- the sweep found no control ` +
        `under that selector (skipped: ${JSON.stringify(sweep.skipped)})`
    );
    return;
  }
  for (const c of sweep.controls) {
    console.log(
      `[${STAGE}] ${key} (${state}) ${selector} ${c.path}  page ${c.page}  ` +
        `fill ${c.fill ?? 'none'} ${c.fillVsPage.toFixed(2)}:1  ` +
        `border ${c.border ?? 'none'} ${c.borderVsPage === null ? '--' : c.borderVsPage.toFixed(2) + ':1'}  ` +
        `=> boundary ${c.boundary.toFixed(2)}:1`
    );
  }
}

async function settle(page: Page): Promise<void> {
  // Bootstrap's reboot sets `scroll-behavior: smooth` and these buttons declare
  // their own `transition`, so both are stopped before the shutter -- a frame
  // taken mid-transition would show a colour that is in no stylesheet.
  await page.addStyleTag({
    content:
      '*, *::before, *::after, :root { scroll-behavior: auto !important; transition: none !important }',
  });
  await page.waitForTimeout(600);
}

for (const [i, shot] of SHOOT.entries()) {
  const target = CUSTOMER_PAGES.find((p) => p.key === shot.key)!;

  test(`${STAGE} ${shot.key}: the $primary-blue family in dark mode`, async ({ page }) => {
    await seedCustomerSession(page, true);
    // Answer the PDPA question before the page opens. On /register the consent
    // banner overlaps the submit button and `hover()` retried against it for 197
    // ticks before failing -- and a banner sitting across the button would have
    // spoiled the frame even if the hover had landed.
    await seedAnalyticsConsent(page);
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    if (target.seed) {
      await seedStore(page, target.storeOverride?.());
      await page.waitForTimeout(1500);
    }
    await settle(page);

    // Preconditions, not assumptions: a light frame labelled "dark", or a frame
    // of a page that never rendered the button, is worse than no frame at all.
    expect(await page.evaluate(() => document.body.classList.contains('is-dark'))).toBe(true);
    const first = shot.targets[0]!;
    await expect(page.locator(first).first()).toBeVisible({ timeout: 15_000 });

    for (const sel of shot.targets) {
      if ((await page.locator(sel).count()) === 0) {
        console.log(`[${STAGE}] ${shot.key} (rest) ${sel}: not present on this page`);
        continue;
      }
      report(shot.key, 'rest', sel, (await page.evaluate(MEASURE, sel)) as Sweep);
    }

    await page.screenshot({
      path: `${ASSETS}/OBRS-773-${STAGE}-${i}-${shot.key}-rest.png`,
      fullPage: true,
    });
    await page
      .locator(first)
      .first()
      .screenshot({ path: `${ASSETS}/OBRS-773-${STAGE}-${i}-${shot.key}-rest-button.png` });

    for (const h of shot.hover) {
      const el = page.locator(h).first();
      if ((await el.count()) === 0) continue;
      await el.hover();
      await page.waitForTimeout(400);
      report(shot.key, 'hover', h, (await page.evaluate(MEASURE, h)) as Sweep);
      await el.screenshot({ path: `${ASSETS}/OBRS-773-${STAGE}-${i}-${shot.key}-hover-button.png` });
    }
  });
}
