/**
 * OBRS-910 — before/after evidence for the shared button-pending indicator
 * (`[appPending]` / `PendingButtonDirective`), across the three call sites the
 * card names: (1) the payment "PAY_NOW" button, (2) the admin stop-form modal
 * Save button, (3) the admin export-button trigger.
 *
 *   node e2e/capture-obrs-910-pending-buttons.mjs --label before --base http://localhost:PORT
 *   node e2e/capture-obrs-910-pending-buttons.mjs --label after  --base http://localhost:PORT
 *
 * Run once against a `ng serve` on the BEFORE worktree (origin/dev, no directive) and
 * once against a `ng serve` on the AFTER worktree (this card's branch) — two separate
 * servers, not one, because the two worktrees are two different checkouts.
 *
 * HOW EACH BUTTON IS FORCED INTO "PENDING" AND HELD THERE
 * Every surface's own state flag flips to `true` SYNCHRONOUSLY inside the click
 * handler, before the network call that eventually flips it back. So the technique is:
 * stub the one HTTP call each button is waiting on and NEVER resolve it (the route
 * handler returns a promise that never settles) — the button is then provably pending
 * for as long as this script cares to look, with no reliance on a slow network or a
 * race against a real backend.
 *
 * WHY EVERY OTHER /api CALL IS ALSO STUBBED
 * All three pages are real routed Angular pages (not isolated component harnesses), so
 * each one fires several unrelated API calls on load (schedule/station data on
 * /payment, stops/provinces/lookups on /admin/stops, the report's own load on
 * /admin/eod-sales-report). None of those calls affect the button under test, so they
 * get a generic `ok([])` fallback — good enough to stop the page from hanging on
 * something irrelevant, not meant to be a faithful mock of those endpoints.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (LABEL !== 'before' && LABEL !== 'after') {
  throw new Error('--label <before|after> is required - an unlabelled pair proves nothing');
}
const BASE = arg('--base', process.env.OBRS_BASE_URL ?? 'http://localhost:4201');

const OUT = path.resolve(
  'C:\\Users\\thpee\\AppData\\Local\\Temp\\claude\\C--Users-thpee-Desktop-workshop-obrs-agent-office\\77430694-37c5-46f9-836d-c3c807d06caf\\scratchpad\\captures'
);

const ok = (data) => ({ code: 200, message: 'OK', data });

/** A promise that never settles — the route handler awaits this, so Playwright
 *  leaves the request perpetually in-flight and the caller's own `isX = true`
 *  (set synchronously before the await) never gets a chance to flip back. */
const HANG = new Promise(() => {});

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const STOP_LOOKUP = (slug, label) => ({ id: 1, slug, translations: [{ locale: 'th', label }] });

const STOP_SUMMARY = {
  id: 1,
  slug: 'mo-chit',
  status: STOP_LOOKUP('active', 'เปิดใช้งาน'),
  stopType: STOP_LOOKUP('terminal', 'สถานี'),
  translations: [{ locale: 'th', label: 'หมอชิต', description: '' }],
};

const STOP_DETAIL = {
  ...STOP_SUMMARY,
  province: STOP_LOOKUP('bangkok', 'กรุงเทพมหานคร'),
  latitude: 13.8,
  longitude: 100.55,
  primaryPhotoUrl: null,
  addresses: {},
  returnStopId: null,
};

const LOOKUPS = [
  { id: 1, category: 'stop_status', slug: 'active', translations: [{ locale: 'th', label: 'เปิดใช้งาน' }] },
  { id: 2, category: 'stop_type', slug: 'terminal', translations: [{ locale: 'th', label: 'สถานี' }] },
];

const PROVINCES = [{ id: 1, slug: 'bangkok', translations: [{ locale: 'th', label: 'กรุงเทพมหานคร' }] }];

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-910-capture-token');
    localStorage.setItem('auth_username', 'owner@system.local');
    // 'owner' expands (ROLE_GRANTS) to admin/salesperson/driver/customer, so one
    // identity clears the /admin route guard, the export-button requiredRole and
    // the online-booking-preview role check — all three surfaces need it.
    localStorage.setItem('auth_roles', JSON.stringify(['owner']));
    localStorage.setItem('active_booking_id', '9001');
  });

  await page.route('**/api/**', (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });

    // --- surface 1: payment ---------------------------------------------
    // resolveAmountDue() is called BEFORE the (never-configured-here) Omise
    // dialog, so it must succeed with a real outstanding amount or
    // submitPayment() throws before isSubmittingPayment ever has a chance to
    // stay up.
    if (/\/private\/bookings\/\d+\/payments$/.test(p) && method === 'GET') {
      return send({
        bookingId: 9001,
        paymentSummary: { totalAmount: '250.00', paidAmount: '0.00', outstandingAmount: '250.00', currency: 'THB', status: 'PENDING' },
        transactions: [],
      });
    }
    // Never reached in practice (the payments GET above hangs first), kept as
    // a safety net in case the resolver order ever changes.
    if (/cdn\.omise\.co/.test(req.url())) {
      return HANG.then(() => route.abort());
    }

    // --- surface 2: admin stops -------------------------------------------
    if (/\/api\/stops$/.test(p) && method === 'GET') return send([STOP_SUMMARY]);
    if (/\/api\/stops\/\d+$/.test(p) && method === 'GET') return send(STOP_DETAIL);
    if (/\/private\/stops\/return-stop-options$/.test(p)) return send([]);
    if (/\/api\/provinces$/.test(p)) return send(PROVINCES);
    if (/\/private\/lookups$/.test(p)) return send(LOOKUPS);
    if (/\/private\/stops\/\d+$/.test(p) && method === 'PUT') {
      return HANG.then(() => send({})); // never resolves
    }

    // --- surface 3: export button -------------------------------------------
    // The report store does `response.data ?? emptyReport()` — an empty ARRAY is
    // truthy, so the generic `send([])` fallback below produces a shape whose
    // `.salespersons` is undefined and breaks every change-detection cycle
    // (`Cannot read properties of undefined (reading 'length')`), which in turn
    // stops the export button's own click handler from running at all.
    if (/\/private\/admin\/reports\/eod-salesperson$/.test(p)) {
      return send({
        date: '2026-09-05',
        timezone: 'Asia/Bangkok',
        salespersons: [],
        grandTotal: {
          bookingCount: 0,
          ticketsSold: 0,
          cashAmount: '0.00',
          nonCashAmount: '0.00',
          byMethod: {},
          revenue: { net: '0.00', paid: '0.00', refunded: '0.00', currency: 'THB' },
        },
      });
    }
    if (/\/private\/exports\//.test(p)) {
      return HANG.then(() =>
        route.fulfill({ status: 200, contentType: 'text/csv', body: 'a,b\n1,2' })
      );
    }

    // --- everything else: enough to stop the page hanging on the unrelated ---
    return send([]);
  });

  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/fonts.googleapis.com/**', (route) => route.abort());
}

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

/** Rect + aria-busy + (if present) the ring's computed style, read off a single
 *  button element handed in as a Playwright Locator. */
async function readButton(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const ring = el.querySelector('.loading-state-ring');
    const ringCs = ring ? getComputedStyle(ring) : null;
    return {
      widthPx: Math.round(r.width * 100) / 100,
      heightPx: Math.round(r.height * 100) / 100,
      ariaBusy: el.getAttribute('aria-busy'),
      // The ring is meant to inherit the button's own label colour (currentColor).
      // Recording both is what makes that provable instead of asserted: the global
      // override and the component's own rule have EQUAL specificity, so before the
      // fix the component rule won on source order and the ring painted --accent.
      buttonColor: getComputedStyle(el).color,
      hasPendingSlot: el.classList.contains('app-pending-slot'),
      ring: ringCs
        ? {
            visibility: ringCs.visibility,
            width: ringCs.width,
            height: ringCs.height,
            borderTopColor: ringCs.borderTopColor,
            borderLeftColor: ringCs.borderLeftColor,
          }
        : null,
    };
  });
}

async function shoot(locator, file) {
  await locator.screenshot({ path: file });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const results = { label: LABEL, base: BASE, surfaces: {} };
await mkdir(OUT, { recursive: true });

async function withPage(fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(120000);
  await stub(page);
  try {
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

// 1. Payment "PAY_NOW" button --------------------------------------------------
results.surfaces.payment = await withPage(async (page) => {
  await page.goto(`${BASE}/payment`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator('.payment-btn');
  await btn.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500);

  const normal = await readButton(btn);
  await shoot(btn, path.join(OUT, `OBRS-910-${LABEL.toUpperCase()}-payment-normal.png`));

  await btn.click();
  await page.waitForTimeout(1200); // the payments GET is stubbed to HANG forever
  const pending = await readButton(btn);
  await shoot(btn, path.join(OUT, `OBRS-910-${LABEL.toUpperCase()}-payment-pending.png`));

  return { normal, pending };
});

// 2. Admin stop-form modal Save button -----------------------------------------
results.surfaces.adminSave = await withPage(async (page) => {
  await page.goto(`${BASE}/admin/stops`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('tr.stop-row', { state: 'visible', timeout: 30000 });
  await page.locator('tr.stop-row .admin-btn-sm').first().click();
  await page.waitForSelector('.admin-modal-backdrop .admin-modal', { state: 'visible', timeout: 15000 });
  const btn = page.locator('.admin-modal button[type="submit"].admin-btn-primary');
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);

  const normal = await readButton(btn);
  await shoot(btn, path.join(OUT, `OBRS-910-${LABEL.toUpperCase()}-admin-save-normal.png`));

  await btn.click();
  await page.waitForTimeout(1200); // the PUT is stubbed to HANG forever
  const pending = await readButton(btn);
  await shoot(btn, path.join(OUT, `OBRS-910-${LABEL.toUpperCase()}-admin-save-pending.png`));

  return { normal, pending };
});

// 3. Export button trigger -------------------------------------------------------
results.surfaces.exportButton = await withPage(async (page) => {
  await page.goto(`${BASE}/admin/eod-sales-report`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator('app-export-button .export-button-trigger').first();
  await btn.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);

  const normal = await readButton(btn);
  await shoot(btn, path.join(OUT, `OBRS-910-${LABEL.toUpperCase()}-export-normal.png`));

  await btn.click(); // opens the p-menu popup
  const csvItem = page.locator('.p-menu-item-label', { hasText: 'CSV' }).first();
  await csvItem.waitFor({ state: 'visible', timeout: 10000 });
  await csvItem.click(); // fires doExport('csv') -> loading = true synchronously
  await page.waitForTimeout(1200); // the exports GET is stubbed to HANG forever
  const pending = await readButton(btn);
  await shoot(btn, path.join(OUT, `OBRS-910-${LABEL.toUpperCase()}-export-pending.png`));

  return { normal, pending };
});

await browser.close();

await writeFile(path.join(OUT, `OBRS-910-result-${LABEL}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
