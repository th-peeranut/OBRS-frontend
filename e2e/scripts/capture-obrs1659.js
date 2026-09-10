// Standalone capture script for OBRS-1659 visual evidence (not a Playwright test, not part of the suite).
//
// Approach: NO backend (the canonical lane — see capture-obrs677.js). The boarding
// manifest reads exactly two endpoints, both stubbed here, so the rows are richer and
// more deliberate than any seed: ONE booking holding three seats (the party case the
// search exists for) alongside three single-seat bookings.
//
// AFTER = this branch on :4200. BEFORE = origin/dev checked out over the same worktree
// on :4200 as well (same mocks — the old template simply has no search box and no
// booking number, and ignores the extra JSON key).
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1659');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const PHASE = process.argv[2] === 'before' ? 'BEFORE' : 'AFTER';
const BASE_URL = process.argv[3] || 'http://localhost:4200';
const SCHEDULE_ID = 42;

const ok = (data) => ({ code: 200, message: 'OK', data });

const status = (code, label) => ({ code, label });

// Seats 1-3 are ONE booking (BK-ABC123) — the party that booked together, which is what
// `?bookingNumber=` was filtering for and what the search box now finds without a round trip.
const MANIFEST = ok([
  { ticketId: 1, ticketNumber: 'TCK-100241', bookingNumber: 'BK-ABC123', seatNumber: '1', passengerTitle: 'MR', passengerName: 'สมชาย ใจดี', fromStop: 'หนองชาก', toStop: 'BTS หมอชิต', status: status('checked_in', 'เช็คอินแล้ว'), boardedAt: '2026-08-30T01:12:00Z', boardedBy: 9, boardedByName: 'มาลี พนักงาน', fareCategory: 'adult' },
  { ticketId: 2, ticketNumber: 'TCK-100242', bookingNumber: 'BK-ABC123', seatNumber: '2', passengerTitle: 'MISS', passengerName: 'มาลี ทองดี', fromStop: 'หนองชาก', toStop: 'BTS หมอชิต', status: status('checked_in', 'เช็คอินแล้ว'), boardedAt: '2026-08-30T01:12:00Z', boardedBy: 9, boardedByName: 'มาลี พนักงาน', fareCategory: 'adult' },
  { ticketId: 3, ticketNumber: 'TCK-100243', bookingNumber: 'BK-ABC123', seatNumber: '3', passengerTitle: null, passengerName: 'ด.ช. ก้อง ใจดี', fromStop: 'หนองชาก', toStop: 'BTS หมอชิต', status: status('confirmed', 'ยืนยันแล้ว'), boardedAt: null, boardedBy: null, boardedByName: null, fareCategory: 'child' },
  { ticketId: 4, ticketNumber: 'TCK-100251', bookingNumber: 'BK-XYZ789', seatNumber: '4', passengerTitle: 'MR', passengerName: 'วิชัย สุขใจ', fromStop: 'หนองชาก', toStop: 'พัทยาใต้', status: status('confirmed', 'ยืนยันแล้ว'), boardedAt: null, boardedBy: null, boardedByName: null, fareCategory: 'adult' },
  { ticketId: 5, ticketNumber: 'TCK-100262', bookingNumber: 'BK-QRS456', seatNumber: '7', passengerTitle: 'MRS', passengerName: 'ปราณี มั่นคง', fromStop: 'บ้านบึง', toStop: 'BTS หมอชิต', status: status('checked_in', 'เช็คอินแล้ว'), boardedAt: '2026-08-30T01:20:00Z', boardedBy: 9, boardedByName: 'มาลี พนักงาน', fareCategory: 'adult' },
  { ticketId: 6, ticketNumber: 'TCK-100270', bookingNumber: 'BK-JKL321', seatNumber: '9', passengerTitle: 'MR', passengerName: 'ธนากร พูนผล', fromStop: 'หนองชาก', toStop: 'พัทยาใต้', status: status('confirmed', 'ยืนยันแล้ว'), boardedAt: null, boardedBy: null, boardedByName: null, fareCategory: 'adult' },
]);

const SCHEDULE = ok({
  id: SCHEDULE_ID,
  departureDateTime: '2026-08-30T09:00:00+07:00',
  status: 'scheduled',
  delayedDepartureDateTime: null,
  delayReason: null,
  route: { code: 'CBI-BKK', slug: 'chonburi_bangkok' },
  vehicle: { numberPlate: '30-1234 ชลบุรี', vehicleNumber: 'V-07' },
  driver: { id: 5, fullName: 'สมศักดิ์ ขับดี' },
});

async function newSeededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1500 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-driver-token-for-capture');
    localStorage.setItem('auth_username', 'driver@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['driver']));
  });

  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Catch-all FIRST (lowest priority — last-registered wins in Playwright).
  await page.route('**/api/**', (route) => json(route, ok(null)));
  await page.route(`**/schedules/${SCHEDULE_ID}`, (route) => json(route, SCHEDULE));
  await page.route('**/boarding-list**', (route) => json(route, MANIFEST));
  return page;
}

async function openManifest(page) {
  await page.goto(`${BASE_URL}/staff/boarding/${SCHEDULE_ID}`, { waitUntil: 'networkidle' });
  await page.locator('table.table tbody tr').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(400);
}

// The subject is the table card plus (on AFTER) the search row directly above it. Both live
// inside the same .card, so shooting that card frames the whole subject with no popover
// rendered outside it — the OBRS-847 clip trap does not apply here.
async function shotTable(page, name, expectedRows) {
  const card = page.locator('.card').last();
  const rows = await page.locator('table.table tbody tr').count();
  if (rows !== expectedRows) {
    throw new Error(`refusing to save ${name}: expected ${expectedRows} body rows, found ${rows}`);
  }
  await card.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name, `(${rows} rows)`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await newSeededPage(browser);
  await openManifest(page);

  if (PHASE === 'BEFORE') {
    // origin/dev: no search box at all, and no booking number anywhere on the row —
    // the only way to find a passenger is to read all six rows.
    const searchBoxes = await page.locator('#boardingSearchInput').count();
    if (searchBoxes !== 0) {
      throw new Error('refusing to save BEFORE: a search box is present, this is not origin/dev');
    }
    await shotTable(page, 'OBRS-1659-BEFORE-manifest-no-search.png', 6);
    await browser.close();
    console.log('DONE (BEFORE)');
    return;
  }

  // 1 — the whole manifest, search empty. Every row now carries its booking number as a
  //     sub-line under the ticket number; seats 1-3 visibly share BK-ABC123.
  await shotTable(page, 'OBRS-1659-AFTER-1-manifest-with-booking-numbers.png', 6);

  // 2 — the party lookup: one booking number, every seat on that booking. This is the case
  //     the retired `?bookingNumber=` filter existed for, now answered with no round trip.
  await page.locator('#boardingSearchInput').fill('BK-ABC123');
  await page.waitForTimeout(300);
  await shotTable(page, 'OBRS-1659-AFTER-2-search-booking-shows-whole-party.png', 3);

  // 3 — PARTIAL, case-insensitive: the driver types the last few characters off a phone
  //     screen. The old server-side filter compared with '=' and would have found nothing.
  await page.locator('#boardingSearchInput').fill('qrs45');
  await page.waitForTimeout(300);
  await shotTable(page, 'OBRS-1659-AFTER-3-partial-lowercase-match.png', 1);

  // 4 — searching a name, not a booking number — the old filter could not do this at all.
  await page.locator('#boardingSearchInput').fill('ปราณี');
  await page.waitForTimeout(300);
  await shotTable(page, 'OBRS-1659-AFTER-4-search-by-passenger-name.png', 1);

  // 5 — no match: its own empty-state, distinct from "this bus is empty".
  await page.locator('#boardingSearchInput').fill('BK-NOPE99');
  await page.waitForTimeout(300);
  await shotTable(page, 'OBRS-1659-AFTER-5-no-match-empty-state.png', 1);

  await browser.close();
  console.log('DONE (AFTER)');
}

main().catch((e) => { console.error(e); process.exit(1); });
