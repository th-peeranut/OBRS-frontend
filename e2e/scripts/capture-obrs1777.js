// Standalone capture for OBRS-1777 - the boarding point that differs per operator inside one
// shared station. Not part of the Playwright suite; committed so the frames can be re-shot.
//
// usage: node e2e/scripts/capture-obrs1777.js <afterBaseUrl> <beforeBaseUrl>
//
// NO BACKEND. Auth is seeded into localStorage and every /api call is stubbed, so both surfaces
// render against fixtures. See capture-obrs1680.js for the same lane's reasoning.
//
// TWO surfaces, because the card only makes sense as a pair: an operator has to be able to WRITE
// which bay is theirs (the admin form) and a passenger has to READ it on the stop they are about
// to board at (the public route map). A frame of either alone would leave the other unproven.
//
// Everything the frames claim is read out of the DOM before the file is saved. A boarding point
// is one short line of text next to two other short lines of text; a picture of the wrong one
// looks exactly like a picture of the right one.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const AFTER_BASE = process.argv[2] || 'http://localhost:4320';
const BEFORE_BASE = process.argv[3] || 'http://localhost:4325';

const ASSETS_DIR = path.resolve(__dirname, '..', '..', '..', 'obrs-agent-office',
  '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1777');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

// ----------------------------------------------------------------- admin form fixtures
const STOPS = ok([{
  id: 7, slug: 'mo_chit',
  status: { slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' } } },
  stopType: { slug: 'station', translations: { th: { label: 'สถานี' } } },
  translations: { th: { label: 'หมอชิต' }, en: { label: 'Mo Chit' } },
}]);

const STOP_DETAIL = ok({
  id: 7,
  slug: 'mo_chit',
  status: { slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' } } },
  stopType: { slug: 'station', translations: { th: { label: 'สถานี' } } },
  province: { slug: 'bangkok', translations: { th: { label: 'กรุงเทพมหานคร' } } },
  translations: { th: { label: 'หมอชิต' }, en: { label: 'Mo Chit' } },
  latitude: 13.8079,
  longitude: 100.5490,
  primaryPhotoUrl: null,
  returnStopId: null,
  addresses: { th: 'ถ.กำแพงเพชร 2 แขวงจตุจักร กรุงเทพฯ' },
  // The row this operator published. The BEFORE build has no field to show it in, which is the
  // point of the pair: the value can already be sent and there is nowhere for it to land.
  boardingPoints: { th: 'ชานชาลา 43' },
});

const PROVINCES = ok([
  { id: 2, slug: 'bangkok', translations: { th: { label: 'กรุงเทพมหานคร' }, en: { label: 'Bangkok' } } },
]);

const LOOKUPS = ok([
  { id: 1, category: 'stop_status', slug: 'operational', translations: { th: { label: 'เปิดใช้งาน' } } },
  { id: 3, category: 'stop_type', slug: 'station', translations: { th: { label: 'สถานี' } } },
]);

// ----------------------------------------------------------------- route map fixtures
const mapStop = (order, slug, name, boardingPoint) => ({
  order,
  slug,
  name,
  address: 'ถ.กำแพงเพชร 2 แขวงจตุจักร กรุงเทพฯ',
  approxTime: order === 1 ? '06:00' : '09:00',
  distanceKmFromOrigin: order === 1 ? 0 : 133.13,
  offsetMinutesFromOrigin: order === 1 ? 0 : 139,
  latitude: 13.8079,
  longitude: 100.549,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
  description: 'ฝั่งอาคารผู้โดยสาร',
  // Omitted, not null, when there is none - that is how the backend serializes it and the FE
  // getter branches on absence.
  ...(boardingPoint ? { boardingPoint } : {}),
});

const PICKUP_STOPS = [mapStop(1, 'mo_chit', 'หมอชิต', 'ชานชาลา 43')];
const DROPOFF_STOPS = [mapStop(2, 'nong_chak', 'หนองชาก', null)];

const ROUTE_META = {
  slug: 'bangkok_chonburi',
  titleLocalized: { th: 'กรุงเทพฯ - ชลบุรี', en: 'Bangkok - Chonburi' },
  totalDistanceKm: 133.13,
  durationMinMinutes: 139,
  durationMaxMinutes: 220,
  originProvinceLabel: 'กรุงเทพมหานคร',
  destinationProvinceLabel: 'ชลบุรี',
};

const MAP_FIXTURES = [
  [/\/routes\/[^/]+\/pickup-dropoff$/, () => ok({ route: ROUTE_META, pickup: PICKUP_STOPS, dropoff: DROPOFF_STOPS })],
  [/\/stops$/, () => ok([...PICKUP_STOPS, ...DROPOFF_STOPS])],
  [/\/routes$/, () => ok([{
    id: 1, slug: 'bangkok_chonburi', status: 'active',
    translations: { th: { label: 'กรุงเทพฯ - ชลบุรี' }, en: { label: 'Bangkok - Chonburi' } },
  }])],
];

const BOARDING_IDS = ['th', 'en', 'zh'].map((l) => '#stopBoardingPoint-' + l);
const ADDRESS_IDS = ['th', 'en', 'zh'].map((l) => '#stopAddress-' + l);

async function adminPage(browser, role) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
  await page.addInitScript(([r]) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-token-for-capture');
    localStorage.setItem('auth_username', r + '@system.local');
    localStorage.setItem('auth_roles', JSON.stringify([r]));
  }, [role]);

  // Catch-all FIRST - Playwright gives the LAST registered route priority.
  await page.route('**/api/**', (route) => json(route, ok(null)));
  await page.route('**/api/stops', (route) => json(route, STOPS));
  await page.route('**/api/provinces', (route) => json(route, PROVINCES));
  await page.route('**/private/lookups**', (route) => json(route, LOOKUPS));
  await page.route('**/private/stops/return-stop-options', (route) => json(route, ok([])));
  await page.route('**/api/stops/7', (route) => json(route, STOP_DETAIL));
  return page;
}

async function mapPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/api/**', (route) => {
    const hit = MAP_FIXTURES.find(([re]) => re.test(route.request().url()));
    return json(route, hit ? hit[1]() : ok(null));
  });
  return page;
}

/** How many boarding-point boxes the form offers, and whether an operator may type in them. */
async function measureForm(page) {
  return page.evaluate(({ boarding, address }) => {
    const read = (s) => document.querySelector(s);
    return {
      boardingInputs: boarding.filter((s) => read(s) !== null).length,
      boardingEnabled: boarding.filter((s) => read(s) && !read(s).disabled).length,
      boardingThValue: read(boarding[0]) ? read(boarding[0]).value : null,
      // The physical/label split from OBRS-1680 must be untouched by this card: the address is a
      // label field an operator has always been able to edit, so 3 enabled in every frame.
      addressEnabled: address.filter((s) => read(s) && !read(s).disabled).length,
    };
  }, { boarding: BOARDING_IDS, address: ADDRESS_IDS });
}

/** What the stop card actually prints - the line, its label, and the landmark beside it. */
async function measureCard(page) {
  return page.evaluate(() => {
    const card = document.querySelector('app-route-stop-detail-card');
    const text = (sel) => {
      const el = card && card.querySelector(sel);
      return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    };
    return {
      boardingLines: card ? card.querySelectorAll('.detail-boarding-point').length : -1,
      boardingText: text('.detail-boarding-point'),
      landmarkText: text('.detail-landmark'),
    };
  });
}

async function shootForm(page, base, file) {
  await page.goto(base + '/admin/stops', { waitUntil: 'networkidle' });
  await page.locator('tbody tr:has-text("หมอชิต")').first().waitFor({ timeout: 30000 });
  await page.locator('tbody tr:has-text("หมอชิต") button:has-text("แก้ไข")').first().click();
  await page.locator('#stopAddress-th').waitFor({ timeout: 30000 });
  // NgModel applies [disabled] from a microtask; let the frame settle before reading it.
  await page.waitForTimeout(600);
  const m = await measureForm(page);
  if (m.addressEnabled !== ADDRESS_IDS.length) {
    throw new Error('refusing to save ' + file + ': the form did not render (address '
      + m.addressEnabled + '/3)');
  }
  await page.locator('.admin-modal').first().screenshot({ path: path.join(ASSETS_DIR, file) });
  return m;
}

async function shootCard(page, base, file) {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('.stop-row--pickup').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.stop-row--pickup').first().click();
  await page.locator('app-route-stop-detail-card').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500);
  const m = await measureCard(page);
  if (m.landmarkText === null) {
    throw new Error('refusing to save ' + file + ': the card did not render its existing landmark line');
  }
  await page.locator('app-route-stop-detail-card').first()
    .screenshot({ path: path.join(ASSETS_DIR, file) });
  return m;
}

/**
 * The frames are only evidence if the pair could have come out WRONG.
 *
 * Without this, the whole script exits 0 whatever it photographs: a BEFORE base pointed at a
 * stale build, at the wrong port, or at the AFTER server by mistake would produce two identical
 * frames and a report full of numbers for a human to eyeball - which is exactly the shape of
 * evidence that proves nothing. So BEFORE must show the feature ABSENT and AFTER must show it
 * present AND carrying the fixture's value; anything else refuses to be called a capture.
 */
function assertPair(label, form, card) {
  const want = label === 'AFTER'
    ? { boardingInputs: 3, boardingEnabled: 3, boardingThValue: 'ชานชาลา 43',
        boardingLines: 1, boardingText: /ชานชาลา 43/ }
    : { boardingInputs: 0, boardingEnabled: 0, boardingThValue: null,
        boardingLines: 0, boardingText: null };

  const wrong = [];
  for (const key of ['boardingInputs', 'boardingEnabled', 'boardingThValue']) {
    if (form[key] !== want[key]) {
      wrong.push(key + '=' + JSON.stringify(form[key]) + ' want ' + JSON.stringify(want[key]));
    }
  }
  if (card.boardingLines !== want.boardingLines) {
    wrong.push('boardingLines=' + card.boardingLines + ' want ' + want.boardingLines);
  }
  const textOk = want.boardingText === null
    ? card.boardingText === null
    : want.boardingText.test(card.boardingText || '');
  if (!textOk) {
    wrong.push('boardingText=' + JSON.stringify(card.boardingText));
  }
  if (wrong.length) {
    throw new Error(label + ' frames do not show what this capture claims: ' + wrong.join(' | ')
      + ' - the two builds are probably not the two builds you think they are.');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = {};
  try {
    for (const [label, base] of [['BEFORE', BEFORE_BASE], ['AFTER', AFTER_BASE]]) {
      const admin = await adminPage(browser, 'owner');
      const form = await shootForm(admin, base, 'OBRS-1777-' + label + '-owner-stop-form.png');
      report[label + '-owner-form'] = form;
      await admin.close();

      const map = await mapPage(browser);
      const card = await shootCard(map, base, 'OBRS-1777-' + label + '-passenger-stop-card.png');
      report[label + '-passenger-card'] = card;
      await map.close();

      assertPair(label, form, card);
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(ASSETS_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
