// OBRS-1343 BEFORE/AFTER evidence — a round trip to BTS หมอชิต can be bought both ways.
//
// Live stack, nothing stubbed. The ONLY difference between the two runs is which backend is
// listening on :8080: the base commit this branch forked from (BEFORE) or this branch
// (AFTER). Same database, same seeded rows, same frontend build, same script. Run as:
//
//   CAPTURE_MODE=before node e2e/scripts/capture-obrs1343.js
//   CAPTURE_MODE=after  node e2e/scripts/capture-obrs1343.js
//
// The frontend is this branch's build in both runs, and that is honest rather than a
// shortcut: the client change is purely additive — with no `returnBoardingStop` in the
// response (which is exactly what the old backend sends) every new branch is skipped and
// the page renders as it did before. Serving the old client too would have proved the same
// thing twice while adding a second variable to the comparison.
//
// THE CASE, which needs no invented data: `data.sql` puts `bts_mo_chit` on
// `chonburi_bangkok` at stop_order 24, and does NOT put it on `bangkok_chonburi` at all —
// the bus home leaves from `ds293_chatuchak_bus_stop` at stop_order 2, 233 m away. Searching
// the way back by swapping the request's two stop ids therefore looked for a bus that does
// not exist.
//
// Every frame carries a banner printing what was read out of the live DOM and off the live
// API at that instant, because a screenshot of a list proves nothing on its own — an empty
// return list looks the same whether the route has no rounds, the date is wrong, or the
// query asked the wrong question.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.env.CAPTURE_MODE || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4200';
const API = process.env.CAPTURE_API || 'http://localhost:8080';
const OUT = process.env.CAPTURE_OUT || __dirname;

// The card's AC-1 names ตลาดเนื่องจำนงค์ as the origin, and it cannot be one: measured on the
// seeded database, `talat_nueang_chamnong` appears ONLY on `bangkok_chonburi` (stop_order 23) —
// it is a drop-off on the way home, never a pickup on the way out, so no `segments` row sells
// from it and the booking form cannot offer it. `nong_chak` is that route's real origin
// (stop_order 1) and the same village; it reproduces the defect exactly, because what the card
// is actually about is the DESTINATION half of the pair.
const FROM_SLUG = 'nong_chak'; // หนองชาก (Chonburi) — chonburi_bangkok stop_order 1
const TO_SLUG = 'bts_mo_chit'; // BTS หมอชิต (Bangkok) — drop-off only
const EXPECTED_BOARDING_SLUG = 'ds293_chatuchak_bus_stop'; // 233 m away, on the route home

// Must match e2e/fixtures/obrs1343-return-boarding-fixture.sql exactly.
const OUTBOUND_DAY_OFFSET = 5;
const RETURN_DAY_OFFSET = 6;

const log = [];
const say = (m) => {
  console.log(m);
  log.push(m);
};

/** today+n in the Asia/Bangkok calendar, as YYYY-MM-DD — the same clock the fixture uses. */
function bangkokDatePlus(days) {
  const bangkokNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
  bangkokNow.setDate(bangkokNow.getDate() + days);
  return bangkokNow.toISOString().slice(0, 10);
}

async function api(pathname, body) {
  const res = await fetch(API + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'th' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function stopIdBySlug() {
  const res = await fetch(API + '/api/stops', { headers: { 'Accept-Language': 'th' } });
  const payload = await res.json();
  const rows = payload?.data ?? [];
  const bySlug = new Map(rows.map((s) => [s.slug, s.id]));
  return bySlug;
}

/**
 * Reads the three things this card is about straight out of the rendered page — how many
 * return rows exist, whether the boarding notice is there and what it says, and which stop
 * the return leg is headed from — and paints them into a fixed banner, so the PNG carries
 * its own evidence rather than asking the reader to trust the caption.
 */
async function banner(page, heading, extraLines) {
  await page.evaluate(
    ({ heading, extraLines }) => {
      document.getElementById('obrs1343-banner')?.remove();

      const titles = Array.from(document.querySelectorAll('h3.title')).map((h) =>
        (h.textContent || '').trim()
      );
      const notice = document.querySelector('.return-boarding-notice');
      const rows = document.querySelectorAll('.schedule-item').length;
      const noResults = Array.from(document.querySelectorAll('.no-results')).map((p) =>
        (p.textContent || '').trim()
      );

      const lines = [
        `h3.title on page      : ${titles.length ? titles.join(' | ') : '(none)'}`,
        `.schedule-item rows   : ${rows}`,
        `.no-results text      : ${noResults.length ? noResults.join(' | ') : '(none)'}`,
        `.return-boarding-notice: ${
          notice
            ? (notice.textContent || '').replace(/\s+/g, ' ').trim()
            : 'ABSENT — nothing tells the customer the way back boards elsewhere'
        }`,
        ...extraLines,
      ];

      const box = document.createElement('div');
      box.id = 'obrs1343-banner';
      box.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:2147483647',
        'background:#101418', 'color:#e8eaf0', 'font:12px/1.55 Consolas,monospace',
        'padding:10px 14px', 'white-space:pre-wrap', 'border-bottom:3px solid #4da3ff',
      ].join(';');
      box.textContent = `${heading}\n${lines.join('\n')}`;
      document.body.prepend(box);
    },
    { heading, extraLines }
  );
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  say(`  wrote ${path.basename(file)}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const departureDate = bangkokDatePlus(OUTBOUND_DAY_OFFSET);
  const returnDate = bangkokDatePlus(RETURN_DAY_OFFSET);
  say(`OBRS-1343 capture — mode=${MODE} api=${API} base=${BASE}`);
  say(`  departureDate=${departureDate} returnDate=${returnDate}`);

  // ── the API half, measured before any browser is involved ──────────────────
  const search = await api('/api/schedules/search', {
    bookingType: 'return',
    numberOfPassengers: 1,
    fromStop: FROM_SLUG,
    toStop: TO_SLUG,
    departureDate,
    returnDate,
  });
  const data = search.json?.data ?? {};
  const departureCount = (data.departureSchedules ?? []).length;
  const arrivalCount = (data.arrivalSchedules ?? []).length;
  const boarding = data.returnBoardingStop ?? null;

  say(`  POST /api/schedules/search -> ${search.status}`);
  say(`    departureSchedules : ${departureCount}`);
  say(`    arrivalSchedules   : ${arrivalCount}`);
  say(`    returnBoardingStop : ${boarding ? JSON.stringify(boarding) : 'null'}`);

  // The query the OLD code issued for the return leg, run here in both modes so the two
  // logs can be diffed: swap the two stops and ask for the return date. It is empty in
  // both, which is the point — the stop the swap names has no bus home, and the AFTER run
  // finds rounds only because it stopped asking this question.
  const mirrored = await api('/api/schedules/search', {
    bookingType: 'one_way',
    numberOfPassengers: 1,
    fromStop: TO_SLUG,
    toStop: FROM_SLUG,
    departureDate: returnDate,
  });
  const mirroredCount = (mirrored.json?.data?.departureSchedules ?? []).length;
  say(`  the old mirrored query (${TO_SLUG} -> ${FROM_SLUG} on ${returnDate}): ${mirroredCount} round(s)`);

  fs.writeFileSync(
    path.join(OUT, `probe-${MODE}.json`),
    JSON.stringify(
      {
        mode: MODE,
        departureDate,
        returnDate,
        search: { status: search.status, departureCount, arrivalCount, returnBoardingStop: boarding },
        mirroredQuery: { fromStop: TO_SLUG, toStop: FROM_SLUG, date: returnDate, count: mirroredCount },
      },
      null,
      2
    ) + '\n'
  );

  // ── the browser half ───────────────────────────────────────────────────────
  const bySlug = await stopIdBySlug();
  const startStationId = bySlug.get(FROM_SLUG);
  const stopStationId = bySlug.get(TO_SLUG);
  if (!startStationId || !stopStationId) {
    throw new Error(`could not resolve stop ids from ${API}/api/stops`);
  }
  say(`  stop ids: ${FROM_SLUG}=${startStationId} ${TO_SLUG}=${stopStationId}`);

  // Seed the customer's saved search rather than driving the two PrimeNG dropdowns and the
  // two calendars. `/schedule-booking` re-runs a restored filter on arrival (OBRS-903), so
  // the search that follows is the real one, issued by the app against the real backend —
  // only the typing is skipped.
  const bookingContext = {
    version: 1,
    savedAt: Date.now(),
    value: {
      filter: {
        roundTrip: { id: 2, name: 'ไป-กลับ' },
        passengerInfo: [{ type: 'ADULT', count: 1 }],
        startStationId,
        stopStationId,
        departureDate,
        returnDate,
        adultCount: 1,
        kidsCount: 0,
      },
      searchPayload: null,
      selection: null,
    },
  };

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  await page.addInitScript((ctx) => {
    localStorage.setItem('obrs.booking_context', JSON.stringify(ctx));
    localStorage.setItem('lang', 'th');
  }, bookingContext);

  await page.goto(BASE + '/schedule-booking', { waitUntil: 'networkidle' });
  // Press the page's own Search button rather than relying on the restored filter to
  // auto-search: on a COLD profile the station roster is still in flight when the restored
  // filter emits, so `getStationCodeById` cannot map the two ids to slugs yet and the
  // auto-search is skipped. A real customer's browser has the roster cached, so this is a
  // property of a brand-new Playwright profile, not of the product. Clicking issues the
  // same request the same way.
  await page.waitForTimeout(2500);
  await page.locator('button.btn-search').click();
  await page.waitForSelector('.schedule-item', { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Pick the outbound — the return list only renders once a first leg is chosen. Skipped
  // when there is no return leg at all: that click opens OBRS-1336's "continue as one-way?"
  // dialog, which would cover the very list this frame is evidence of.
  if (arrivalCount > 0) {
    await page.locator('.select-btn').first().click();
    await page.waitForTimeout(1500);
  }

  await banner(page, `OBRS-1343 ${MODE.toUpperCase()} — ${FROM_SLUG} -> ${TO_SLUG}, round trip`, [
    `API returnBoardingStop : ${boarding ? `${boarding.slug} (${boarding.distanceMeters} m, sameAsDropOff=${boarding.sameAsDropOff})` : 'null'}`,
    `API arrivalSchedules   : ${arrivalCount}`,
    `expected boarding stop : ${EXPECTED_BOARDING_SLUG}`,
  ]);
  await shot(page, `OBRS-1343-${MODE.toUpperCase()}-0-return-list.png`);

  // The last screen before payment. Reachable only when there IS a return leg to pick, so
  // in BEFORE mode this stops at the "no return schedules" state, which is the defect.
  const returnRows = await page.locator('.select-btn').count();
  if (arrivalCount > 0 && returnRows > 0) {
    await page.locator('.select-btn').last().click();
    await page.waitForURL('**/review-schedule-booking', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await banner(page, `OBRS-1343 ${MODE.toUpperCase()} — review, the last screen before payment`, [
      `API returnBoardingStop : ${boarding ? `${boarding.slug} (${boarding.distanceMeters} m)` : 'null'}`,
    ]);
    await shot(page, `OBRS-1343-${MODE.toUpperCase()}-1-review.png`);
  } else {
    say('  no return leg to pick — stopping at the trip list (this IS the defect)');
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, `capture-log-${MODE}.txt`), log.join('\n') + '\n');
  say('done');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
