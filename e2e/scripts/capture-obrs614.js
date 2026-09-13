// OBRS-614 evidence capture — the admin bookings payment-status badge.
//
//   node e2e/scripts/capture-obrs614.js <outDir> <label> <baseUrl>
//
// <label> is BEFORE or AFTER; the ONLY difference between the two runs is which commit
// the served frontend is on. Everything the page fetches is stubbed at the network layer
// and NO backend runs, on purpose: the headline case is `getBookingPayments` FAILING, and
// a live backend cannot be asked to 503 on demand — staging it in the browser is the only
// way to put both runs in front of byte-identical inputs.
//
// Five rows, chosen so one screenshot carries every branch:
//   101 CANCELLED  + payments 503          -> was a red "ไม่สำเร็จ" that no server ever said
//   102 CONFIRMED  + payments 503          -> was a green "ชำระแล้ว" during a backend outage
//   103 CANCELLED  + payments 200, no data -> the paid-then-refunded booking of the card
//   104 PENDING    + payments 200, no data -> was an amber "รอดำเนินการ"
//   105 CONFIRMED  + payments 200, fully_paid -> CONTROL: a real value, must not move
//
// The script ASSERTS what it captured and prints it as JSON; a screenshot of the wrong
// column proves nothing (the OBRS-298 capture paid for that lesson — a row carries TWO
// .admin-status badges and the payment one is index 1).
const { chromium } = require('@playwright/test');
const path = require('path');

const OUT_DIR = process.argv[2] || '.';
const LABEL = (process.argv[3] || 'AFTER').toUpperCase();
const BASE = process.argv[4] || 'http://localhost:4200';

const ROWS = [
  { id: 101, number: 'BK-101', name: 'ก. ยกเลิกแล้วคืนเงิน', status: 'cancelled', payments: 'error' },
  { id: 102, number: 'BK-102', name: 'ข. ยืนยันแล้ว', status: 'confirmed', payments: 'error' },
  { id: 103, number: 'BK-103', name: 'ค. ยกเลิก ไม่มีข้อมูล', status: 'cancelled', payments: 'empty' },
  { id: 104, number: 'BK-104', name: 'ง. รอดำเนินการ', status: 'pending', payments: 'empty' },
  { id: 105, number: 'BK-105', name: 'จ. ชำระครบ (control)', status: 'confirmed', payments: 'fully_paid' },
];

const bookingsPayload = {
  code: 200,
  message: 'OK',
  data: {
    content: ROWS.map((row) => ({
      id: row.id,
      bookingNumber: row.number,
      totalAmount: 850,
      status: row.status,
      createdAt: '2026-09-10T09:00:00+07:00',
      contact: { fullName: row.name },
      bookingSchedules: [{ departureDateTime: '2026-09-12T08:00:00+07:00' }],
    })),
    totalElements: ROWS.length,
    totalPages: 1,
    size: 100,
    number: 0,
    numberOfElements: ROWS.length,
  },
};

function paymentsFor(id) {
  const row = ROWS.find((r) => r.id === id);
  if (!row || row.payments === 'error') return null;
  if (row.payments === 'empty') return { bookingId: id };
  return { bookingId: id, paymentSummary: { overallPaymentStatus: row.payments } };
}

(async () => {
  // 1536x864 at deviceScaleFactor 1 matches the reviewer's viewport at 125% scaling.
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });

  // isAuthenticated() is `!!getToken()` (auth.service.ts), so seeding the two keys is a
  // full stand-in for a login round-trip that has no server to talk to.
  await context.addInitScript(() => {
    localStorage.setItem('auth_token', 'obrs614-capture-token');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('app_language', 'th');
  });

  const page = await context.newPage();

  // Registered first so the specific handlers below (checked first — Playwright matches
  // most-recently-registered outwards) win; this only stops unrelated calls hanging.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: null }) })
  );
  await page.route('**/api/private/admin/bookings*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bookingsPayload) })
  );
  await page.route('**/api/private/bookings/*/payments', (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').slice(-2, -1)[0]);
    const body = paymentsFor(id);
    if (body === null) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: 'Service Unavailable' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: body }) });
  });

  await page.goto(`${BASE}/admin/bookings`);
  await page.locator('tbody tr', { hasText: 'BK-105' }).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  const captured = [];
  for (const row of ROWS) {
    const tr = page.locator('tbody tr', { hasText: row.number }).first();
    const badges = tr.locator('span.admin-status');
    if ((await badges.count()) < 2) {
      throw new Error(`row ${row.number}: expected 2 status badges, found ${await badges.count()}`);
    }
    const badge = badges.nth(1); // index 1 is the PAYMENT badge, not the booking status
    captured.push({
      row: row.number,
      bookingStatus: (await badges.nth(0).innerText()).trim(),
      paymentBadge: (await badge.innerText()).trim(),
      badgeClass: await badge.getAttribute('class'),
      backgroundColor: await badge.evaluate((el) => getComputedStyle(el).backgroundColor),
      color: await badge.evaluate((el) => getComputedStyle(el).color),
    });
  }

  console.log(JSON.stringify({ label: LABEL, rows: captured }, null, 2));

  // The control row must read the same in both runs, or the two screenshots differ by
  // more than the fix and neither proves anything.
  const control = captured.find((c) => c.row === 'BK-105');
  if (!/ชำระครบ|Paid in Full|已付清/.test(control.paymentBadge)) {
    throw new Error(`control row BK-105 did not keep its real status: ${control.paymentBadge}`);
  }

  await page.screenshot({ path: path.join(OUT_DIR, `OBRS-614-${LABEL}-payment-status-badges.png`) });
  await browser.close();
})().catch((e) => {
  console.error('CAPTURE FAILED:', e.message);
  process.exit(1);
});
