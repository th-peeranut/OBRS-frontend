import { Page, expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';

/**
 * OBRS-639 — the booking stepper on a phone.
 *
 * <p>THE DEFECT. `.stepper-container` gave every `.step` a fixed `min-width` (112px,
 * 98px under 480px) and put an `overflow-x: auto` behind them, so on a 360px screen the
 * four steps laid out to a 556px scroll width and steps 3 and 4 sat off the right edge
 * with nothing on screen saying they were there. Measured on the SIT build before the
 * fix: `clientWidth 360 / scrollWidth 556`, step 3 at x=[300,398] and step 4 at
 * x=[442,540], and the "ขั้นตอนที่ N" labels at 11px — the smallest text in the app.
 *
 * <p>WHY THIS LANE. The claim is about the CASCADE at a viewport width: which media
 * query wins, what `flex` leaves each step, and where the boxes actually land. Karma
 * renders in an 800px window and cannot answer any of that, and the pages after the
 * first are unreachable on `--configuration sit` because `features.onlineTicketBooking`
 * is false there (OBRS-1302). The gate lane serves the local environment, where booking
 * is open, and mocks every call — so all four steps are walkable with no backend.
 *
 * <p>AC-6 is the reason this walks the flow instead of visiting one page: the card was
 * raised on step 1, but a stepper that fits only while step 1 is active would still hide
 * the step the customer is on later. Every page of the flow is measured.
 *
 * <p>Both shipped label sets are exercised. Thai is the product default and English has
 * the longest string in the set ("Personal information"); the fix makes step width
 * depend on the text for the first time, so measuring only one of them would leave the
 * other free to overflow.
 *
 * <p>Screenshots land in e2e-evidence/ (gitignored, the prefix the e2e lane gate allows)
 * and are written BEFORE the assertions, so a red run is also the BEFORE evidence.
 */

const ASSETS = 'e2e-evidence/obrs-639';

/**
 * The card names the first two; 360 is the narrowest phone in real use. The 800px row
 * is here because the fix also raises the ordinal from 11px inside the `max-width: 992`
 * block, and between 769 and 992 that rule lands on a stepper the two phone rows never
 * exercise (the `max-width: 768` layout does not apply there).
 */
const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740 },
  { name: '390x664', width: 390, height: 664 },
  { name: '800x900', width: 800, height: 900 },
];

const LANGUAGES = ['th', 'en'] as const;

/** AC-4. `$font-size-xs` in src/styles/variables.scss is this number. */
const MIN_LABEL_PX = 12;

interface StepBox {
  i: number;
  active: boolean;
  left: number;
  right: number;
  width: number;
  inViewport: boolean;
  titleHidden: boolean;
  titlePx: number | null;
  descPx: number | null;
  descText: string;
}

interface StepperShot {
  innerWidth: number;
  clientWidth: number;
  scrollWidth: number;
  overflowX: string;
  steps: StepBox[];
}

/** Runs in the page: the stepper described box by box, with nothing interpreted. */
function readStepper(): StepperShot | null {
  const c = document.querySelector('.stepper-container');
  if (!c) return null;

  const px = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).fontSize) : null);
  const hidden = (n: Element | null) => !n || getComputedStyle(n).display === 'none';

  return {
    innerWidth: window.innerWidth,
    clientWidth: c.clientWidth,
    scrollWidth: c.scrollWidth,
    overflowX: getComputedStyle(c).overflowX,
    steps: [...c.querySelectorAll('.step')].map((el, i) => {
      const r = el.getBoundingClientRect();
      const title = el.querySelector('.title');
      const desc = el.querySelector('.desc');
      return {
        i: i + 1,
        active: el.classList.contains('active'),
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
        width: +r.width.toFixed(1),
        // The viewport, not the container's padding box: a step inside a scroller
        // but past the screen edge is exactly the thing this card is about.
        inViewport: r.left >= -0.5 && r.right <= window.innerWidth + 0.5,
        titleHidden: hidden(title),
        titlePx: px(title),
        descPx: px(desc),
        descText: (desc?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    }),
  };
}

async function shoot(page: Page, tag: string): Promise<StepperShot> {
  // Scroll to the stepper BEFORE anything is read or shot. A page-coordinate `clip`
  // does not scroll, so on /payment -- where the flow arrives part-way down the page --
  // both the "stepper" shot and the page shot were of the footer.
  const stepper = page.locator('.stepper-container').first();
  await stepper.scrollIntoViewIfNeeded();

  // Two frames after that: a stepper measured mid-transition is narrower than the
  // settled one and would under-report.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  const shot = await page.evaluate(readStepper);
  expect(shot, `${tag}: no .stepper-container on the page`).not.toBeNull();

  await stepper.screenshot({ path: `${ASSETS}/OBRS-639-${tag}-stepper.png` });
  await page.screenshot({ path: `${ASSETS}/OBRS-639-${tag}-page.png` });
  return shot as StepperShot;
}

/** The card's four acceptance numbers, asserted in one place per page of the flow. */
function assertStepperFits(shot: StepperShot, tag: string, expectedActive: number): void {
  const detail = shot.steps
    .map(
      (s) =>
        `step ${s.i}${s.active ? '*' : ''} x=[${s.left},${s.right}] w=${s.width} ` +
        `inView=${s.inViewport} title=${s.titleHidden ? 'hidden' : s.titlePx + 'px'} ` +
        `desc=${s.descPx}px "${s.descText}"`
    )
    .join(' | ');
  const where = `${tag} (client=${shot.clientWidth} scroll=${shot.scrollWidth}) ${detail}`;

  expect(shot.steps.length, `${where}: the stepper has four steps`).toBe(4);

  // AC-1. No horizontal scroll is left to discover, and all four boxes are on screen.
  expect(shot.scrollWidth, `${where}: AC-1 nothing to scroll to`).toBeLessThanOrEqual(
    shot.clientWidth + 1
  );
  for (const s of shot.steps) {
    expect(s.inViewport, `${where}: AC-1 step ${s.i} is on screen`).toBe(true);
  }

  // AC-2. The step the customer is on is highlighted and in view.
  const active = shot.steps.filter((s) => s.active);
  expect(active.map((s) => s.i), `${where}: AC-2 exactly the current step is active`).toEqual([
    expectedActive,
  ]);
  expect(active[0].inViewport, `${where}: AC-2 the active step is on screen`).toBe(true);

  // AC-4. Every label a customer can read is at least 12px.
  for (const s of shot.steps) {
    expect(s.descPx, `${where}: AC-4 step ${s.i} name >= ${MIN_LABEL_PX}px`).toBeGreaterThanOrEqual(
      MIN_LABEL_PX
    );
    if (!s.titleHidden) {
      expect(
        s.titlePx,
        `${where}: AC-4 step ${s.i} ordinal >= ${MIN_LABEL_PX}px`
      ).toBeGreaterThanOrEqual(MIN_LABEL_PX);
    }
  }
}

/* --------------------------------------------------------------------- flow */

async function seedSignedInCustomer(page: Page, language: string): Promise<void> {
  await page.addInitScript((lang) => {
    localStorage.setItem('auth_token', 'obrs-639-gate-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
    // Registered after mockPublicPageApis, whose own init script pins 'en'.
    localStorage.setItem('app_language', lang);
  }, language);
}

/** The booking POST /passenger-info makes on its way to /payment. */
async function mockBookingCreate(page: Page): Promise<void> {
  await page.route('**/api/private/bookings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { bookingId: 9639, bookingNumber: 'BK9639' },
      }),
    })
  );
}

/** Home → search. Mirrors e2e/tests/b2c-critical-path.spec.ts, which walks this same
 *  path in this same lane; the dropdown ids and the round-trip confirm come from there. */
async function searchAndPickATrip(page: Page): Promise<void> {
  await page.goto('/');

  // Origin and destination are the two `app-dropdown-group-obrs` in `.station-group`
  // (OBRS-1224 turned the origin into a real combobox; the scoped selectors here are
  // the ones obrs-1224-origin-combobox.spec.ts uses). Options are picked by POSITION,
  // not by name: this spec runs in two label sets and the stop names are localized, so
  // the English strings b2c-critical-path matches on are absent in the Thai pass.
  const groups = page.locator('.station-group app-dropdown-group-obrs');
  await groups.first().locator('.dropdown-btn').click();
  const origin = groups.first().locator('.dropdown-menu.show .dropdown-option').first();
  const originName = ((await origin.textContent()) ?? '').trim();
  await origin.click();

  await groups.nth(1).locator('.dropdown-btn').click();
  await groups
    .nth(1)
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasNotText: originName })
    .first()
    .click();

  await page.locator('.btn-search').click();
  await page.waitForURL('**/schedule-booking');
}

async function fillPassengerForm(page: Page): Promise<void> {
  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', 'John');
  await page.fill('#booker-lastName', 'Doe');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.fill('#booker-email', 'john.doe@example.com');
  await page.locator('#booker-gender_male').click();
  await page.locator('#title-0 .dropdown-btn').click();
  await page.locator('#title-0 .dropdown-option').first().click();
  await page.fill('#firstName-0', 'John');
  await page.fill('#lastName-0', 'Doe');
  await page.locator('#gender_male-0').click();
}

/** Walks all four pages, shooting and measuring the stepper on each. */
async function walkTheFlow(page: Page, tagPrefix: string): Promise<Map<number, StepperShot>> {
  const shots = new Map<number, StepperShot>();

  await searchAndPickATrip(page);
  shots.set(1, await shoot(page, `${tagPrefix}-step1-schedule-booking`));

  await page.locator('.select-btn').first().click();
  // OBRS-1336: schedules.json has no return leg and the home form defaults to a round
  // trip, so choosing the outbound raises the one-way confirm instead of navigating.
  await page.locator('.nrc-modal .btn-primary').click();
  await page.waitForURL('**/review-schedule-booking');
  shots.set(2, await shoot(page, `${tagPrefix}-step2-review`));

  await page.locator('.btn-confirm').click();
  await page.waitForURL('**/passenger-info');
  await page.locator('#booker-firstName').waitFor();
  shots.set(3, await shoot(page, `${tagPrefix}-step3-passenger-info`));

  await fillPassengerForm(page);
  await expect(page.locator('.btn-next')).not.toBeDisabled();
  await page.locator('.btn-next').click();
  await page.waitForURL('**/payment');
  await page.locator('.total-container').waitFor();
  shots.set(4, await shoot(page, `${tagPrefix}-step4-payment`));

  return shots;
}

/* -------------------------------------------------------------------- tests */

test.beforeEach(async ({ page }) => {
  mkdirSync(ASSETS, { recursive: true });
  await mockPublicPageApis(page);
  await mockBookingCreate(page);
});

for (const phone of VIEWPORTS) {
  for (const language of LANGUAGES) {
    test.describe(`OBRS-639 stepper at ${phone.name} in ${language}`, () => {
      test.use({ viewport: { width: phone.width, height: phone.height } });

      test(`all four steps stay on screen through the whole flow (${phone.name}, ${language})`, async ({
        page,
      }) => {
        await seedSignedInCustomer(page, language);
        const tag = `${phone.name}-${language}`;
        const shots = await walkTheFlow(page, tag);

        writeFileSync(
          `${ASSETS}/OBRS-639-${tag}.json`,
          JSON.stringify(Object.fromEntries(shots), null, 2)
        );

        for (const [step, shot] of shots) {
          assertStepperFits(shot, `${tag} step ${step}`, step);
        }
      });
    });
  }
}

/**
 * The control arm. Desktop is not what the card is about, so this asserts only that the
 * stepper still lays out as four steps on one line at the lane's own 1280x720 — the
 * before/after numbers in the JSON are what prove nothing moved.
 */
test('desktop is untouched: four steps, one line, no scroll', async ({ page }) => {
  await seedSignedInCustomer(page, 'th');
  const shots = await walkTheFlow(page, 'desktop-1280x720-th');

  writeFileSync(
    `${ASSETS}/OBRS-639-desktop-1280x720-th.json`,
    JSON.stringify(Object.fromEntries(shots), null, 2)
  );

  for (const [step, shot] of shots) {
    expect(shot.steps.length, `desktop step ${step}`).toBe(4);
    expect(shot.scrollWidth, `desktop step ${step} does not scroll`).toBeLessThanOrEqual(
      shot.clientWidth + 1
    );
    for (const s of shot.steps) {
      expect(s.inViewport, `desktop step ${step}: step ${s.i} on screen`).toBe(true);
    }
  }
});
