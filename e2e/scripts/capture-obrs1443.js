// Visual evidence for OBRS-1443 — the `.admin-modal-header` row of all EIGHT modals
// that use the class, plus the `×` hover colour the owner picked.
//
//   node e2e/scripts/capture-obrs1443.js <port> <BEFORE|AFTER> [outDir]
//
// Lane: a REAL login against live SIT (`ng serve --configuration sit`), because the
// admin shell, the theme toggle and 3 of the 8 modals need no fixture at all — SIT
// has bookings, usability reports and settlement rounds. The other 5 have no data on
// SIT (measured 2026-08-19: `/api/private/parcel-claims` 404s — OBRS-1388's endpoint
// is not promoted yet; `/driver-cash/days` returns an empty range; every schedule
// answers "no consigned parcels"), so those five endpoints — and only those — are
// stubbed per case. The backend stays UP, so no global HTTP-error swal can overlay a
// shot the way a fully-stubbed lane risks.
//
// Every case ALSO writes a measurement, not just a picture: the computed `display` of
// `.admin-modal-header` and the close button's box relative to the title's. That is
// what separates "the × is top-right" from "the × looks top-right in this one frame".
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const PORT = process.argv[2] || 4443;
const LABEL = (process.argv[3] || 'AFTER').toUpperCase();
const ONLY = process.argv[5] || '';
const OUT = process.argv[4] || path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1443');
const BASE = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });

const ok = (data) => JSON.stringify({ code: 200, message: 'OK', data });
const json = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', body: ok(data) });

// ── fixtures (lifted from the components' own spec fixtures — contract-shaped) ──

const parcelRow = (over) => ({
  parcelId: 9001, trackingNumber: 'PCL-9001', senderName: 'สมชาย ใจดี', senderPhone: '0812345678',
  recipientName: 'สมศรี มีสุข', recipientPhone: '0898765432', pickupStop: 'หนองจั๊ก', dropoffStop: 'ขอนแก่น',
  weightKg: 3.5, deliveryStatus: 'arrived_notified', bookingStatus: 'confirmed',
  lengthCm: 30, widthCm: 20, heightCm: 15, amount: 120, leftAtStopPhotoUrl: null, ...over,
});

const CLAIM = {
  id: 7, parcelId: 9001, trackingNumber: 'PCL-9001', claimantName: 'สมศรี มีสุข',
  claimantContactPhone: '0898765432', claimReason: 'กล่องบุบ สินค้าด้านในแตก', salesPointId: null,
  status: 'PENDING', filedByUserId: 3, filedAt: '2026-08-19T10:00:00+07:00', approvedAmount: null,
  decisionNote: null, expenseId: null, decidedByUserId: null, decidedAt: null,
};

const CASH_ENTRIES = [
  { id: 102, type: 'PER_HEAD', amount: '60.00', scheduleId: 50, stopId: 3, headCount: 3, expenseCategory: null, expenseId: null, note: null, fromUnmappedSalesPoint: false, createdAt: '2026-08-18T08:00:00+07:00' },
  { id: 103, type: 'EXPENSE_PAID', amount: '40.00', scheduleId: null, stopId: null, headCount: null, expenseCategory: 'PERMIT_FEE', expenseId: 9, note: 'ค่าผ่านทาง', fromUnmappedSalesPoint: false, createdAt: '2026-08-18T09:00:00+07:00' },
];
const CASH_SUMMARY = {
  dayId: 1, driverId: 5, driverName: 'สมชาย ใจดี', holderRole: 'DRIVER', businessDate: '2026-08-18',
  vehicleId: 100, vehiclePlate: 'AB-1234', status: 'OPEN', expectedReturnAmount: '500.00',
  returnedAmount: null, discrepancy: null, overdueOpen: false, hasUnmappedSalesPointRemit: false,
};
const CASH_DETAIL = {
  dayId: 1, driverId: 5, driverName: 'สมชาย ใจดี', holderRole: 'DRIVER', businessDate: '2026-08-18',
  vehicleId: 100, status: 'OPEN', entries: CASH_ENTRIES, advanceTotal: '100.00', perHeadTotal: '60.00',
  expensePaidTotal: '40.00', parcelRemitTotal: '0.00', parcelClawbackTotal: '0.00',
  expectedReturnAmount: '500.00', returnedAmount: null, returnedAt: null, returnedByUserId: null,
  returnedByName: null, discrepancy: null, discrepancyReason: null, perHeadRates: [],
  hasUnmappedSalesPointRemit: false,
};

// ── stub sets, keyed by case. url predicates, not globs: the driver-cash list URL
// carries a query string and Playwright treats `?` as a glob wildcard. ──

const STUBS = {
  parcelClaims: async (page) => {
    await page.route((u) => u.pathname.endsWith('/api/private/parcel-claims'), (r) => json(r, [CLAIM]));
    // The approve modal re-reads the cross-counter history (OBRS-1388 AC-2) from the
    // same 404ing endpoint. Left unstubbed it prints a red "could not load" line INSIDE
    // the frame, which reads as a defect in the shot rather than a missing SIT route.
    await page.route((u) => /\/parcels\/\d+\/claim-history$/.test(u.pathname), (r) => json(r, []));
  },
  driverCash: async (page) => {
    await page.route((u) => u.pathname.endsWith('/api/private/driver-cash/days'), (r) => json(r, [CASH_SUMMARY]));
    await page.route((u) => /\/api\/private\/driver-cash\/days\/\d+$/.test(u.pathname), (r) => json(r, CASH_DETAIL));
  },
  consigned: async (page) => {
    await page.route((u) => u.pathname.endsWith('/parcels/consigned'), (r) => json(r, [parcelRow({})]));
    await page.route((u) => /\/parcels\/\d+\/claim-history$/.test(u.pathname), (r) => json(r, []));
  },
  pendingVerification: (page) => page.route(
    (u) => u.pathname.endsWith('/parcels/pending-verification'),
    (r) => json(r, [parcelRow({ parcelId: 9002, trackingNumber: 'PCL-9002', deliveryStatus: 'created' })]),
  ),
};

// ── the eight cases. `broken` = one of the 6 with no local `.admin-modal-header`
// copy, so it is the population BEFORE shots exist for. ──

const CASES = [
  {
    key: '0-staff-claim-dialog', who: 'driver@system.local', broken: true, stub: 'consigned',
    url: '/staff/parcels/schedule/5?tab=handover',
    open: async (p) => { await p.getByTestId('parcel-schedule-tab-handover').click(); await p.locator('table tbody tr button').last().click(); },
    modal: 'app-parcel-claim-dialog .admin-modal',
  },
  {
    key: '1-staff-collect-dialog', who: 'driver@system.local', broken: true, stub: 'consigned',
    url: '/staff/parcels/schedule/5?tab=handover',
    open: async (p) => { await p.getByTestId('parcel-schedule-tab-handover').click(); await p.locator('table tbody tr button').first().click(); },
    modal: 'app-parcel-collect-dialog .admin-modal',
  },
  {
    key: '2-staff-verify-dialog', who: 'driver@system.local', broken: true, stub: 'pendingVerification',
    url: '/staff/parcels/schedule/5?tab=verify',
    open: async (p) => { await p.getByTestId('parcel-schedule-tab-verify').click(); await p.locator('table tbody tr button.admin-btn').first().click(); },
    modal: 'app-parcel-verify-dialog .admin-modal',
  },
  {
    key: '3-admin-parcel-claim-approve', who: 'admin@system.local', broken: true, stub: 'parcelClaims',
    url: '/admin/parcel-claims',
    open: async (p) => { await p.locator('table.admin-table tbody tr button').first().click(); },
    modal: 'app-parcel-claim-approve-modal .admin-modal',
    hover: true,
  },
  {
    key: '4-admin-driver-cash-return', who: 'admin@system.local', broken: true, stub: 'driverCash',
    url: '/admin/settlements',
    open: async (p) => { await p.locator('app-driver-cash-days-list tbody tr').first().click(); },
    modal: 'app-driver-cash-day-return-modal .admin-modal',
  },
  {
    key: '5-admin-settlement-detail', who: 'admin@system.local', broken: true,
    url: '/admin/settlements',
    open: async (p) => { await p.locator('table.admin-table tbody tr button.admin-btn-small').first().click(); },
    modal: 'app-settlement-detail-modal .admin-modal',
  },
  {
    key: '6-admin-bookings-detail', who: 'admin@system.local', broken: false,
    url: '/admin/bookings',
    // The first CELL, not the row: `onRowActivate` ignores clicks that originate on an
    // interactive descendant, and a row-centre click lands in the actions column.
    open: async (p) => { await p.locator('tr.bk-booking-row td').first().click(); },
    modal: '.bk-detail-modal',
  },
  {
    key: '7-admin-usability-report-detail', who: 'admin@system.local', broken: false,
    url: '/admin/usability-reports',
    // The page opens on `status=owner_accepted`, which has 0 rows on SIT (measured:
    // 13 reports total, 12 of them `resolved`). 'all' is STATUS_FILTER_VALUES[0], so
    // the first dropdown option is the "see everything" filter.
    open: async (p) => {
      await p.locator('.admin-dropdown-trigger').first().click();
      await p.locator('.admin-dropdown-option').first().click();
      await p.locator('tr.ur-report-row').first().waitFor({ state: 'visible', timeout: 20000 });
      await p.locator('tr.ur-report-row td').first().click();
    },
    modal: '.ur-detail-modal',
  },
];

// ── the measurement. Runs inside the page on the modal root. ──
const PROBE = `(modal) => {
  const header = modal.querySelector('.admin-modal-header');
  if (!header) return { error: 'no .admin-modal-header inside the modal root' };
  const title = header.querySelector('.admin-modal-title');
  const btn = header.querySelector('button');
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
  const hs = getComputedStyle(header);
  const bs = getComputedStyle(btn);
  const hb = r(header), tb = r(title), bb = r(btn);
  return {
    headerDisplay: hs.display,
    headerJustify: hs.justifyContent,
    header: hb, title: tb, button: bb,
    // The two facts the card is about, stated as booleans a diff can read:
    buttonIsRightOfTitle: bb.x > tb.right,
    buttonIsOnTitleRow: Math.abs(bb.y - tb.y) <= Math.max(tb.h, bb.h),
    buttonHuggedToHeaderRight: Math.abs(hb.right - bb.right) <= 2,
    buttonColor: bs.color,
    buttonBackground: bs.backgroundColor,
    buttonClass: btn.className,
    titleTag: title.tagName.toLowerCase(),
  };
}`;

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
}

async function newPage(browser, { dark }) {
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  if (dark) {
    await page.addInitScript(() => {
      localStorage.setItem('app_admin_theme', 'dark');
      localStorage.setItem('app_theme', 'dark');
    });
  }
  return page;
}

// A shot must contain the WHOLE modal: an element screenshot taller than the
// viewport is not stitched, it comes back with the overflow unpainted. Grow the
// viewport from a live measurement and re-assert before shooting.
async function fitAndShoot(page, sel, file, results, key) {
  const modal = page.locator(sel);
  await modal.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) {
    const box = await modal.boundingBox();
    const vp = page.viewportSize();
    if (box.height + box.y <= vp.height) break;
    await page.setViewportSize({ width: vp.width, height: Math.min(2600, Math.ceil(box.height + box.y + 60)) });
    await page.waitForTimeout(400);
  }
  const swal = await page.locator('.swal2-popup').count();
  if (swal > 0) throw new Error(`${key}: a swal is on top of the modal — refusing to save ${file}`);
  const box = await modal.boundingBox();
  const vp = page.viewportSize();
  if (box.y + box.height > vp.height + 1) {
    throw new Error(`${key}: modal bottom ${Math.round(box.y + box.height)} exceeds viewport ${vp.height} — the shot would be clipped`);
  }
  const measured = await modal.evaluate(eval(PROBE));
  const count = await page.locator(sel).count();
  if (count !== 1) throw new Error(`${key}: expected exactly 1 '${sel}', found ${count}`);
  await modal.screenshot({ path: path.join(OUT, file) });
  results.push({ case: key, file, label: LABEL, ...measured });
  console.log(`  saved ${file}  display=${measured.headerDisplay} rightOfTitle=${measured.buttonIsRightOfTitle} hugRight=${measured.buttonHuggedToHeaderRight}`);
}

async function runCase(browser, c, results, { dark } = { dark: false }) {
  const page = await newPage(browser, { dark });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 100)); });
  try {
    await login(page, c.who);
    if (c.stub) await STUBS[c.stub](page);
    await page.goto(`${BASE}${c.url}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await c.open(page);
    const suffix = dark ? '-dark' : '';
    await fitAndShoot(page, c.modal, `OBRS-1443-${LABEL}-${c.key}${suffix}.png`, results, c.key + suffix);

    // The `×` hover is the owner's colour decision (red on hover only) — it has no
    // resting-state tell, so it needs its own frame and its own sampled value.
    if (c.hover) {
      const btn = page.locator(`${c.modal} .admin-modal-header button`);
      await btn.hover();
      await page.waitForTimeout(400);
      const hovered = await btn.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, background: s.backgroundColor };
      });
      await page.locator(c.modal).locator('.admin-modal-header').screenshot({
        path: path.join(OUT, `OBRS-1443-${LABEL}-hover-close-btn${suffix}.png`),
      });
      results.push({ case: `${c.key}-HOVER${suffix}`, file: `OBRS-1443-${LABEL}-hover-close-btn${suffix}.png`, label: LABEL, hovered });
      console.log(`  saved hover${suffix}  color=${hovered.color} bg=${hovered.background}`);
    }
  } finally {
    if (errs.length) console.log(`  [console.error x${errs.length}] ${errs[0]}`);
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const failures = [];
  for (const c of CASES) {
    // BEFORE only exists for the six that have no local copy of the rule; the other
    // two already render correctly on `dev`, so an unchanged frame is not evidence.
    if (ONLY && !c.key.startsWith(ONLY)) continue;
    if (LABEL === 'BEFORE' && !c.broken) { console.log(`skip ${c.key} (correct on dev — AFTER only)`); continue; }
    console.log(`${LABEL} ${c.key}`);
    try {
      await runCase(browser, c, results);
      if (c.hover) await runCase(browser, c, results, { dark: true });
    } catch (e) {
      console.log(`  FAILED ${c.key}: ${e.message.split('\n')[0]}`);
      failures.push({ case: c.key, error: e.message.split('\n')[0] });
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `measured-${LABEL}.json`), JSON.stringify({ label: LABEL, port: PORT, results, failures }, null, 2));
  console.log(`\n${LABEL}: ${results.length} shots, ${failures.length} failures -> ${OUT}`);
  if (failures.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
