import { test, Page, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';

/**
 * OBRS-637 -- BEFORE/AFTER evidence for the Jira card, and the measurements its
 * ACs ask for.
 *
 * Two servers, two trees, one spec. It runs UNCHANGED against both, which is why
 * it asserts almost nothing: the whole claim is that the same question gives a
 * different answer on the two runtimes, and an assertion true of only one of them
 * would turn the BEFORE pass red instead of recording it.
 *
 *   OBRS637_STAGE=BEFORE OBRS637_PORT=4637 npx playwright test --config=playwright.obrs637capture.config.ts
 *   OBRS637_STAGE=AFTER  OBRS637_PORT=4638 npx playwright test --config=playwright.obrs637capture.config.ts
 *
 * :4637 serves ../OBRS-frontend-wt-obrs-637-before, a detached worktree at the
 * `origin/dev` this branch is merged up to; :4638 serves this one. Same shape as
 * obrs-1432 and obrs-1388: a real previous runtime rather than a reconstruction
 * pushed back through a late <style>, so nothing about the BEFORE frame depends
 * on anyone having remembered the old declarations correctly.
 *
 * The viewport is the card's own 390x664 (iPhone 14 CSS px), set in the config's
 * project rather than the top-level `use` -- see the note in
 * playwright.obrs1372capture.config.ts for what happens otherwise.
 *
 * WHAT IT RECORDS, per page, into OBRS-637-<STAGE>-measurements.json:
 *  - the primary CTA's box at five scroll offsets from top to bottom (AC1),
 *  - its height (AC3),
 *  - what `elementFromPoint` returns at the CTA's own right end, which is where
 *    the report-usability FAB is parked (z-index 900, above the bar),
 *  - whether the last footer link is still the thing under its own centre at
 *    maximum scroll (AC2),
 *  - and, in `notes.fabAtMaxScroll`, where the report-usability FAB sits and what
 *    is under ITS centre -- the regression this card had to avoid, not a feature
 *    it ships,
 *  - the CTA's computed `position` at 1280x720 (AC5).
 *
 * ASCII-only source.
 */

const STAGE = process.env['OBRS637_STAGE'] ?? 'AFTER';
const ASSETS = path.join('e2e-evidence', 'OBRS-637');

interface Probe {
  page: string;
  cta: string;
  scrollHeight: number;
  innerHeight: number;
  ctaHeight: number;
  ctaDisabled: boolean | null;
  offsets: { scrollY: number; top: number; bottom: number; inViewport: boolean }[];
  atCtaRightEnd: string;
  lastFooterLink: { text: string; hitIsItself: boolean } | null;
  desktopPosition: string;
  pagePaddingBottom: string;
}

const probes: Probe[] = [];
const notes: Record<string, unknown> = {};

/** Bootstrap's reboot sets `scroll-behavior: smooth`; the shutter can beat it. */
async function killSmoothScroll(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after, :root { scroll-behavior: auto !important }',
  });
}

async function pin(page: Page, y: number): Promise<void> {
  await page.evaluate(
    (top) => window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior }),
    y
  );
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
}

async function openCustomerPage(page: Page, key: string): Promise<void> {
  const target = CUSTOMER_PAGES.find((p) => p.key === key)!;
  await seedCustomerSession(page, false);
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.goto(target.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (target.seed) {
    await seedStore(page, target.storeOverride?.());
    await page.waitForTimeout(1500);
  }
  await killSmoothScroll(page);
}

async function probeCta(page: Page, pageKey: string, cta: string, host: string): Promise<Probe> {
  await page.locator(cta).first().waitFor({ state: 'attached', timeout: 30_000 });

  const geometry = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLButtonElement;
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      ctaHeight: Math.round(el.getBoundingClientRect().height),
      ctaDisabled: el.disabled ?? null,
    };
  }, cta);

  const maxScroll = Math.max(0, geometry.scrollHeight - geometry.innerHeight);
  const offsets: Probe['offsets'] = [];
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.round(maxScroll * fraction);
    await pin(page, y);
    offsets.push(
      await page.evaluate(
        (args) => {
          const r = document.querySelector(args.sel)!.getBoundingClientRect();
          return {
            scrollY: args.y,
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
          };
        },
        { sel: cta, y }
      )
    );
    if (fraction === 0) {
      await page.screenshot({ path: path.join(ASSETS, `OBRS-637-${STAGE}-${pageKey}-1-top.png`) });
    }
  }
  await page.screenshot({ path: path.join(ASSETS, `OBRS-637-${STAGE}-${pageKey}-2-bottom.png`) });

  // The FAB is parked bottom-right at z-index 900. Ask the browser what a tap on
  // the CTA's own right end actually reaches -- `elementFromPoint` is the only
  // oracle that accounts for stacking and `pointer-events` at once, which is the
  // argument report-usability-fab.component.ts makes for its own hit test.
  const atCtaRightEnd = await page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.right - 8, (r.top + r.bottom) / 2);
    if (!hit) return '(nothing)';
    const cls = (hit.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3);
    return hit.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '');
  }, cta);

  const lastFooterLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('app-footer a')).filter(
      (a) => a.getBoundingClientRect().height > 0
    );
    const last = links[links.length - 1];
    if (!last) return null;
    const r = last.getBoundingClientRect();
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return {
      text: (last.textContent ?? '').trim().slice(0, 40),
      hitIsItself: !!hit && (hit === last || last.contains(hit)),
    };
  });

  const pagePaddingBottom = await page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel)!).paddingBottom,
    host
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(800);
  const desktopPosition = await page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel)!).position,
    cta
  );
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(400);

  return {
    page: pageKey,
    cta,
    ...geometry,
    offsets,
    atCtaRightEnd,
    lastFooterLink,
    desktopPosition,
    pagePaddingBottom,
  };
}

test.describe.configure({ mode: 'serial' });

test('passenger-info: the next button at five scroll offsets', async ({ page }) => {
  await openCustomerPage(page, 'passenger-info');
  probes.push(
    await probeCta(page, 'passenger-info', 'app-passenger-info-summary .btn-next', 'app-passenger-info')
  );
});

test('schedule-booking: the search button at five scroll offsets', async ({ page }) => {
  await openCustomerPage(page, 'schedule-booking');
  probes.push(
    await probeCta(page, 'schedule-booking', 'app-schedule-booking-filter .btn-search', 'app-schedule-booking')
  );
});

test('the report FAB is still the thing under its own centre', async ({ page }) => {
  // The regression this card had to avoid rather than the feature it ships. The
  // FAB is `position: fixed; bottom: 24px; right: 24px; z-index: 900`, i.e. ON
  // TOP of anything pinned to the bottom of the screen -- and its own yield does
  // not fire here, because `isClickableUnderFab` triggers on the CANDIDATE'S
  // CENTRE being under the pill and a bar spanning the screen has its centre in
  // the middle of it. So both directions are asked, at maximum scroll:
  // what is under the FAB's centre, and what is under the CTA's right end.
  await openCustomerPage(page, 'schedule-booking');
  await pin(page, 99_999);
  notes['fabAtMaxScroll'] = await page.evaluate(() => {
    const fab = document.querySelector('.report-fab') as HTMLElement | null;
    if (!fab) return { present: false };
    const r = fab.getBoundingClientRect();
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return {
      present: true,
      bottomGap: Math.round(window.innerHeight - r.bottom),
      height: Math.round(r.height),
      yielding: fab.classList.contains('report-fab--yield'),
      underItsOwnCentre: hit
        ? hit.tagName.toLowerCase() +
          ((hit.className || '').toString().trim()
            ? '.' + (hit.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.')
            : '')
        : '(nothing)',
      hitIsTheFab: !!hit && (hit === fab || fab.contains(hit)),
    };
  });
  await page.screenshot({
    path: path.join(ASSETS, `OBRS-637-${STAGE}-schedule-booking-3-fab-and-cta.png`),
  });
});

// A fifth test stood here: /passenger-info opened WITHOUT the consent answer
// seeded, to photograph the defect the gate found -- the CTA behind the PDPA
// consent bar. It is gone because it measured nothing of the sort. This lane
// serves the DEFAULT `ng serve` environment, whose measurement ids are blank, so
// `hasAnyMeasurementId()` is false and the bar never renders here at all
// (`consentBarUp: false`, recorded before the test was removed); skipping
// `seedCustomerSession` to leave consent unanswered also skipped the API stubs,
// so what the probe actually found under the button was `div.swal2-container` --
// an error modal, not a consent bar. A number that looks like a finding and is
// not is worse than no number.
//
// The proof of that half lives where it can go red instead:
// obrs-639-stepper-geometry.spec.ts on the GATE lane, which fails all four
// mobile cases without the `--app-bottom-reserved` term and passes with it, and
// passes on the pre-card tree.

test.afterAll(() => {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.writeFileSync(
    path.join(ASSETS, `OBRS-637-${STAGE}-measurements.json`),
    JSON.stringify({ stage: STAGE, probes, notes }, null, 2)
  );
});

// The one assertion true of BOTH trees, so it can live here: the two pages have
// to have rendered at all. Without it a selector typo produces two empty
// measurement files, and "no difference" is exactly what this run must not be
// able to say by accident.
test('both trees rendered the two CTAs', () => {
  expect(probes.map((p) => p.page).sort()).toEqual(['passenger-info', 'schedule-booking']);
});
