// Standalone capture script for OBRS-357 visual evidence (not a Playwright test).
//
// NO backend: AuthService.isAuthenticated() is a pure localStorage check and
// admin grants owner, so seeding auth_token/auth_roles clears the guard; every
// /api call is stubbed with page.route(). The catch-all is registered FIRST -
// in Playwright the LAST matching route wins.
//
// What it photographs: the owner opens the notification bell on the vehicles
// page and clicks the "inspection found defects" row.
//   AFTER  (:4200, this branch) - the row deep-links: the vehicle is focused,
//                                 the Maintenance tab opens and the create
//                                 modal is already filled from the sheet.
//   BEFORE (:4205, origin/dev)  - the same click only marks the row read; the
//                                 page does not move.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-357');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const INSPECTION_ID = 5;
const VEHICLE_ID = 1;

const NOTIFICATIONS = ok({
  content: [
    {
      id: 91,
      message:
        'Vehicle 10-1234 (Hino) inspection at 21 Jul 2026 10:00 reported 2 defect(s):\n' +
        '• Brake pads: worn below the wear line\n' +
        '• Front tyres: tread below 1.6 mm',
      notificationType: 'INSPECTION_DEFECT_REPORTED',
      channel: 'IN_APP',
      status: 'SENT',
      bookingScheduleId: null,
      targetDate: null,
      sentAt: '2026-07-21T10:00:05+07:00',
      readAt: null,
      read: false,
      relatedEntityId: INSPECTION_ID,
    },
    {
      id: 90,
      message: 'Weekly vehicle inspection checklist is due.',
      notificationType: 'INSPECTION_WEEKLY_REMINDER',
      channel: 'IN_APP',
      status: 'SENT',
      bookingScheduleId: null,
      targetDate: null,
      sentAt: '2026-07-21T08:00:00+07:00',
      readAt: '2026-07-21T08:10:00+07:00',
      read: true,
      relatedEntityId: null,
    },
  ],
  totalElements: 2,
  totalPages: 1,
  size: 20,
  number: 0,
  numberOfElements: 2,
});

const VEHICLES = ok([
  {
    id: VEHICLE_ID,
    numberPlate: '10-1234',
    vehicleNumber: 'BUS-01',
    status: 'active',
    vehicleType: { id: 1, slug: 'bus', translations: [{ locale: 'en', label: 'Bus' }] },
  },
]);

const VEHICLE_TYPES = ok([
  { id: 1, slug: 'bus', translations: [{ locale: 'en', label: 'Bus' }] },
]);

const LOOKUPS = ok([
  { id: 5, category: 'maintenance_status', slug: 'scheduled', translations: [{ locale: 'en', label: 'Scheduled' }] },
  { id: 6, category: 'maintenance_status', slug: 'in_progress', translations: [{ locale: 'en', label: 'In progress' }] },
  { id: 7, category: 'maintenance_status', slug: 'completed', translations: [{ locale: 'en', label: 'Completed' }] },
  { id: 8, category: 'vehicle_status', slug: 'active', translations: [{ locale: 'en', label: 'Active' }] },
]);

// What the new GET /api/private/inspections/{id}/maintenance-draft answers.
// Composed by the server (InspectionMaintenanceDraftRespDto) - the reason is
// date + defect COUNT so it can never overflow reason VARCHAR(255); the defect
// lines go to notes.
const DRAFT = ok({
  inspectionId: INSPECTION_ID,
  vehicleId: VEHICLE_ID,
  suggestedReason: 'Repair from the vehicle inspection on 21 Jul 2026 10:00 (2 defect(s))',
  suggestedNotes:
    '• Brake pads: worn below the wear line\n• Front tyres: tread below 1.6 mm',
});

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function newSeededPage(browser, { dark }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
      localStorage.setItem('auth_username', 'owner@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['owner']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
    },
    [!!dark]
  );

  // Catch-all FIRST (lowest priority - last registered wins).
  await page.route('**/api/**', (route) => route.fulfill(json(ok(null))));
  await page.route('**/api/private/vehicles**', (route) => route.fulfill(json(VEHICLES)));
  // Registered AFTER the vehicles list so it wins on the nested path.
  await page.route('**/api/private/vehicles/*/maintenance**', (route) => route.fulfill(json(ok([]))));
  await page.route('**/api/private/vehicles/*/inspections**', (route) => route.fulfill(json(ok([]))));
  await page.route('**/api/private/vehicle-types**', (route) => route.fulfill(json(VEHICLE_TYPES)));
  await page.route('**/api/private/lookups**', (route) => route.fulfill(json(LOOKUPS)));
  await page.route('**/api/private/notifications**', (route) => route.fulfill(json(NOTIFICATIONS)));
  await page.route('**/api/private/notifications/unread-count**', (route) =>
    route.fulfill(json(ok({ unreadCount: 1 })))
  );
  await page.route('**/api/private/notifications/*/read**', (route) =>
    route.fulfill(json(ok({ id: 91, readAt: '2026-07-21T10:05:00+07:00', read: true })))
  );
  // Only this branch's frontend ever calls it; on BEFORE it stays untouched,
  // which is itself part of what the pair shows.
  await page.route('**/api/private/inspections/*/maintenance-draft**', (route) =>
    route.fulfill(json(DRAFT))
  );
  return page;
}

async function assertNoErrorDialog(page) {
  await page.waitForTimeout(600); // the loading swal is a real transient state
  const popups = await page.locator('.swal2-popup').count();
  if (popups > 0) {
    throw new Error(`refusing to save: ${popups} swal popup(s) over the page`);
  }
}

async function openInbox(page, baseUrl) {
  await page.goto(`${baseUrl}/admin/vehicles`, { waitUntil: 'networkidle' });
  await page.locator('table.admin-table tbody tr').first().waitFor({ state: 'visible', timeout: 20000 });
  await assertNoErrorDialog(page);
  const bell = page.locator('.notification-bell-trigger').first();
  await bell.waitFor({ state: 'visible', timeout: 15000 });
  await bell.click();
  await page.locator('.notification-row').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
}

async function shot(page, name, locator) {
  const target = locator ?? page;
  await target.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
}

async function run(baseUrl, label, { dark }, browser) {
  const page = await newSeededPage(browser, { dark });
  await openInbox(page, baseUrl);

  const suffix = dark ? 'dark' : 'light';
  await shot(page, `OBRS-357-${label}-1-inbox-open-${suffix}.png`);

  await page.locator('.notification-row').first().click();
  await page.waitForTimeout(1500);

  const modal = page.locator('.admin-modal');
  const modalCount = await modal.count();
  console.log(`${label} ${suffix}: url=${page.url()} maintenanceModal=${modalCount}`);
  await assertNoErrorDialog(page);

  await shot(page, `OBRS-357-${label}-2-after-click-${suffix}.png`);
  if (modalCount > 0) {
    // Read the two fields back from the DOM - the frame alone cannot prove the
    // text came from the server rather than from a placeholder.
    const reason = await page.locator('#reason, [formControlName="reason"]').first().inputValue();
    const notes = await page.locator('[formControlName="notes"]').first().inputValue();
    console.log(`${label} ${suffix}: reason=${JSON.stringify(reason)}`);
    console.log(`${label} ${suffix}: notes=${JSON.stringify(notes)}`);
  }

  await page.close();
}

async function main() {
  const after = process.env.AFTER_URL || 'http://localhost:4200';
  const before = process.env.BEFORE_URL || '';
  const browser = await chromium.launch();

  await run(after, 'AFTER', { dark: false }, browser);
  await run(after, 'AFTER', { dark: true }, browser);
  if (before) {
    await run(before, 'BEFORE', { dark: false }, browser);
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
