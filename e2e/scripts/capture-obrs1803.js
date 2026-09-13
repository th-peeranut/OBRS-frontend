// Standalone capture script for OBRS-1803 visual evidence (not a Playwright test, not committed
// to the suite - the SCRIPT is committed, the PNGs are not).
//
// Approach: NO backend, NO Postgres. AuthService.isAuthenticated() is a pure localStorage check,
// so seeding auth_token/auth_roles walks the guard, and page.route() stubs every API call. That
// matters more than usual here: the state this card is about - "this day was already settled, and
// these are the figures that were sent" - would otherwise need a seeded box, a settle POST and a
// wage rate configured before a single pixel could be shot.
//
// AFTER  = this branch on :4200 - the form opens on the previous submission, the banner says the
//          next press CORRECTS it, and the button says so too.
// BEFORE = origin/dev on :4305 with the SAME mocks. `lastSubmission` is a key it has never heard
//          of, so it renders an EMPTY form under a banner warning that submitting again stacks a
//          second set of rows on top - which is exactly the behaviour this card removes.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1803');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const BUSINESS_DATE = '2026-09-10';

const VEHICLES = ok([{ id: 3, numberPlate: '16-8747', active: true }]);
const DRIVERS = ok([{ id: 44, name: 'สมชาย ใจดี' }]);

// A day that HAS been settled once: two rounds, a wage rate in force, and a submission behind it.
const DAY_CONTEXT = ok({
  businessDate: BUSINESS_DATE,
  vehicleId: 3,
  vehiclePlate: '16-8747',
  assignedDriverId: 44,
  assignedDriverName: 'สมชาย ใจดี',
  driverId: 44,
  driverName: 'สมชาย ใจดี',
  schedules: [
    {
      scheduleId: 101,
      departureDateTime: '2026-09-10T06:00:00+07:00',
      routeId: 1,
      routeName: 'บ้านบึง - เอกมัย',
      firstRoundOfRoute: true,
    },
    {
      scheduleId: 102,
      departureDateTime: '2026-09-10T13:00:00+07:00',
      routeId: 1,
      routeName: 'บ้านบึง - เอกมัย',
      firstRoundOfRoute: false,
    },
  ],
  legCount: 2,
  driverWageRateConfigured: true,
  driverWageRatePerLeg: '500.00',
  driverWageTotal: '1000.00',
  parkingFeeEligible: true,
  day: {
    dayId: 77,
    driverId: 44,
    driverName: 'สมชาย ใจดี',
    holderRole: 'DRIVER',
    businessDate: BUSINESS_DATE,
    vehicleId: 3,
    status: 'OPEN',
    entries: [],
    advanceTotal: '0.00',
    perHeadTotal: '0.00',
    expensePaidTotal: '2280.00',
    parcelRemitTotal: '0.00',
    parcelClawbackTotal: '0.00',
    deferredTicketCashTotal: '0.00',
    advanceFundedOut: '0.00',
    expectedReturnAmount: '-2280.00',
    returnedAmount: null,
    returnedAt: null,
    returnedByUserId: null,
    returnedByName: null,
    discrepancy: null,
    discrepancyReason: null,
    perHeadRates: [],
    hasUnmappedSalesPointRemit: false,
    reopenCount: 0,
    reopens: [],
  },
  alreadySettled: true,
  // The whole point of the card: what the counter SENT the first time, handed back so the screen
  // can open on it instead of on a blank form.
  lastSubmission: {
    businessDate: BUSINESS_DATE,
    vehicleId: 3,
    driverId: 44,
    expenses: [
      { category: 'DRIVER_WAGE', amount: null, note: null },
      { category: 'FUEL', amount: '1200.00', note: 'เติมที่ปั๊มบางจาก' },
      { category: 'PARKING_FEE', amount: '80.00', note: null },
    ],
    repairBills: [],
  },
});

async function newSeededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-salesperson-token-for-capture');
    localStorage.setItem('auth_username', 'salesperson@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  });

  // Catch-all FIRST - Playwright gives the LAST registered route priority.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
  await page.route('**/private/vehicles**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VEHICLES) })
  );
  await page.route('**/private/users/drivers**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DRIVERS) })
  );
  await page.route('**/driver-cash/day-context**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DAY_CONTEXT) })
  );
  return page;
}

async function openSettlement(page, baseUrl) {
  await page.goto(`${baseUrl}/staff/settlement`, { waitUntil: 'networkidle' });
  await page.waitForSelector('app-driver-settlement-page', { timeout: 20000 });
  await page.waitForTimeout(1000);

  // The van is picked through the component rather than the UI: the plate control is
  // `app-admin-dropdown`, a custom component, so Playwright's selectOption has nothing to grab -
  // and clicking it would only be testing that dropdown, which is not what this shot is evidence
  // of. window.ng is present because this is a DEV build (`ng serve`, no --configuration).
  await page.evaluate((date) => {
    const host = document.querySelector('app-driver-settlement-page');
    const component = window.ng.getComponent(host);
    component.selectedDate = new Date(date);
    component.onVehicleChange('3');
    window.ng.applyChanges(component);
  }, BUSINESS_DATE);

  // The context is fetched through a switchMap on a Subject, so the answer lands a tick later.
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const host = document.querySelector('app-driver-settlement-page');
    window.ng.applyChanges(window.ng.getComponent(host));
  });
  await page.waitForTimeout(600);
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(ASSETS_DIR, name), fullPage: true });
  console.log('captured', name);
}

async function main() {
  const browser = await chromium.launch();
  const after = (process.env.AFTER_URL || 'http://localhost:4200').replace(/\/$/, '');
  const before = (process.env.BEFORE_URL || '').replace(/\/$/, '');

  {
    const page = await newSeededPage(browser);
    await openSettlement(page, after);
    await shoot(page, 'OBRS-1803-AFTER-settlement-prefilled.png');
    await page.close();
  }

  if (before) {
    const page = await newSeededPage(browser);
    await openSettlement(page, before);
    await shoot(page, 'OBRS-1803-BEFORE-settlement-empty-form.png');
    await page.close();
  }

  await browser.close();
  console.log('DONE ->', ASSETS_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
