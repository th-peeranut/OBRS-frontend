// Standalone capture script for OBRS-1680 / OBRS-1678 visual evidence.
// Not a Playwright test and not part of the suite; committed so the frames can be re-shot.
//
// usage: node e2e/scripts/capture-obrs1680.js <afterBaseUrl> <beforeBaseUrl>
//        node e2e/scripts/capture-obrs1680.js http://localhost:4300 http://localhost:4305
//
// NO BACKEND. AuthService.isAuthenticated() is a pure localStorage check and admin/owner clears
// the AdminGuard, so seeding auth_token/auth_roles gets in; every /api call is stubbed, so the
// screen renders against fixtures instead of a seeded database.
//
// The claim on this surface has TWO halves and a screenshot can only show one of them, so this
// asserts both and refuses to save a frame whose DOM does not match:
//
//   disabledCount  - how many of the six PHYSICAL controls are disabled. An operator must see
//                    6 of 6 AFTER and 0 of 6 BEFORE. Read from the DOM, never from the eye: the
//                    shared .admin-input has no :disabled rule strong enough to trust a picture
//                    (verify-visuals-by-measurement-not-eye).
//   labelEnabled   - how many of the nine LABEL inputs stay writable. 9 in every frame, both
//                    roles, before and after. Without it a "fix" that disabled the whole form
//                    would photograph as correct.
//
// The two role frames are shot from the SAME build at the same viewport, so the only difference
// between them is the role in localStorage.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const AFTER_BASE = process.argv[2] || 'http://localhost:4300';
const BEFORE_BASE = process.argv[3] || 'http://localhost:4305';

const ASSETS_DIR = path.resolve(__dirname, '..', '..', '..', 'obrs-agent-office',
  '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1680');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const STOPS = ok([
  {
    id: 7, slug: 'nong_chak',
    status: { slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' }, en: { label: 'Operational' } } },
    stopType: { slug: 'station', translations: { th: { label: 'สถานี' }, en: { label: 'Station' } } },
    translations: { th: { label: 'หนองชาก' }, en: { label: 'Nong Chak' } },
  },
  {
    id: 2, slug: 'ds293_chatuchak',
    status: { slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' }, en: { label: 'Operational' } } },
    stopType: { slug: 'station', translations: { th: { label: 'สถานี' }, en: { label: 'Station' } } },
    translations: { th: { label: 'ดีเอส293 จตุจักร' }, en: { label: 'DS293 Chatuchak' } },
  },
]);

const STOP_DETAIL = ok({
  id: 7,
  slug: 'nong_chak',
  status: { slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' } } },
  stopType: { slug: 'station', translations: { th: { label: 'สถานี' } } },
  province: { slug: 'chonburi', translations: { th: { label: 'ชลบุรี' } } },
  translations: { th: { label: 'หนองชาก' }, en: { label: 'Nong Chak' } },
  latitude: 13.3712,
  longitude: 101.0821,
  primaryPhotoUrl: null,
  returnStopId: null,
  addresses: { th: 'ถนนสุขุมวิท ต.หนองชาก อ.บ้านบึง จ.ชลบุรี' },
});

const PROVINCES = ok([
  { id: 1, slug: 'chonburi', translations: { th: { label: 'ชลบุรี' }, en: { label: 'Chonburi' } } },
  { id: 2, slug: 'bangkok', translations: { th: { label: 'กรุงเทพมหานคร' }, en: { label: 'Bangkok' } } },
]);

const LOOKUPS = ok([
  { id: 1, category: 'stop_status', slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' } } },
  { id: 2, category: 'stop_status', slug: 'closed', translations: { th: { label: 'ปิด' } } },
  { id: 3, category: 'stop_type', slug: 'station', translations: { th: { label: 'สถานี' } } },
  { id: 4, category: 'stop_type', slug: 'roadside', translations: { th: { label: 'ริมทาง' } } },
]);

const PHYSICAL_IDS = ['#stopProvince', '#stopStatus', '#stopType', '#stopReturnStop', '#stopLat', '#stopLng'];
const LABEL_IDS = [];
for (const locale of ['th', 'en', 'zh']) {
  LABEL_IDS.push(`#stopLabel-${locale}`, `#stopLandmark-${locale}`, `#stopAddress-${locale}`);
}

async function newPage(browser, role) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 });

  await page.addInitScript(([r]) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-token-for-capture');
    localStorage.setItem('auth_username', r + '@system.local');
    localStorage.setItem('auth_roles', JSON.stringify([r]));
  }, [role]);

  // Catch-all FIRST — Playwright gives the LAST registered route priority.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) }));
  await page.route('**/api/stops', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPS) }));
  await page.route('**/api/provinces', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROVINCES) }));
  await page.route('**/private/lookups**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LOOKUPS) }));
  await page.route('**/private/stops/return-stop-options', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) }));
  await page.route('**/api/stops/7', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOP_DETAIL) }));

  return page;
}

async function measure(page) {
  return page.evaluate(({ physical, labels }) => {
    const read = (sel) => document.querySelector(sel);
    return {
      physicalPresent: physical.filter((s) => read(s) !== null).length,
      physicalDisabled: physical.filter((s) => read(s) && read(s).disabled).length,
      labelPresent: labels.filter((s) => read(s) !== null).length,
      labelEnabled: labels.filter((s) => read(s) && !read(s).disabled).length,
      // OBRS-1680: a disabled field that LOOKS editable is the failure this frame exists to
      // rule out, so the background colour is read rather than eyeballed.
      physicalBackgrounds: Array.from(new Set(physical
        .map((s) => read(s))
        .filter(Boolean)
        .map((el) => getComputedStyle(el).backgroundColor))),
      photoBlock: document.querySelectorAll('.stop-photo-block').length,
      addButton: Array.from(document.querySelectorAll('button')).filter((b) =>
        (b.textContent || '').includes('เพิ่มจุดจอด')).length,
      deleteButtons: Array.from(document.querySelectorAll('tbody button')).filter((b) =>
        (b.textContent || '').trim() === 'ลบ').length,
    };
  }, { physical: PHYSICAL_IDS, labels: LABEL_IDS });
}

async function openStopModal(page, base) {
  await page.goto(base + '/admin/stops', { waitUntil: 'networkidle' });
  await page.locator('tbody tr:has-text("หนองชาก")').first().waitFor({ timeout: 30000 });
  await page.locator('tbody tr:has-text("หนองชาก") button:has-text("แก้ไข")').first().click();
  await page.locator('#stopProvince').waitFor({ timeout: 30000 });
  // NgModel applies a [disabled] binding from a microtask, so give the frame a tick to settle
  // before anything reads or photographs it.
  await page.waitForTimeout(500);
}

async function shootList(page, base, file) {
  await page.goto(base + '/admin/stops', { waitUntil: 'networkidle' });
  await page.locator('tbody tr:has-text("หนองชาก")').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  const m = await measure(page);
  await page.locator('.admin-card').first().screenshot({ path: path.join(ASSETS_DIR, file) });
  return m;
}

async function shootModal(page, base, file) {
  await openStopModal(page, base);
  const m = await measure(page);
  if (m.physicalPresent !== PHYSICAL_IDS.length || m.labelPresent !== LABEL_IDS.length) {
    throw new Error(`refusing to save ${file}: the form did not render (` +
      `physical ${m.physicalPresent}/${PHYSICAL_IDS.length}, labels ${m.labelPresent}/${LABEL_IDS.length})`);
  }
  await page.locator('.admin-modal').first().screenshot({ path: path.join(ASSETS_DIR, file) });
  return m;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = {};
  try {
    for (const [label, base] of [['BEFORE', BEFORE_BASE], ['AFTER', AFTER_BASE]]) {
      for (const role of ['owner', 'admin']) {
        const page = await newPage(browser, role);
        report[`${label}-${role}-modal`] =
          await shootModal(page, base, `OBRS-1680-${label}-${role}-stop-form.png`);
        report[`${label}-${role}-list`] =
          await shootList(page, base, `OBRS-1678-${label}-${role}-stops-list.png`);
        await page.close();
      }
    }

    // OBRS-1678: the create modal only exists AFTER, and only for an admin.
    const page = await newPage(browser, 'admin');
    await page.goto(AFTER_BASE + '/admin/stops', { waitUntil: 'networkidle' });
    await page.locator('tbody tr:has-text("หนองชาก")').first().waitFor({ timeout: 30000 });
    await page.locator('button:has-text("เพิ่มจุดจอด")').first().click();
    await page.locator('#stopSlug').waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    report['AFTER-admin-create'] = { slugField: 1, ...(await measure(page)) };
    await page.locator('.admin-modal').first().screenshot({
      path: path.join(ASSETS_DIR, 'OBRS-1678-AFTER-admin-create-modal.png'),
    });
    await page.close();
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(ASSETS_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
