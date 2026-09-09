// OBRS-1574 BEFORE/AFTER evidence - the outbound heading that printed over an empty list.
//
// Everything on screen is this branch's real build served by `ng serve --configuration sit`:
// real router, real component, real template, real CSS, real station roster from the SIT
// backend behind the search form. The ONE stubbed thing is the search RESPONSE, and the
// reason is measured rather than convenient: the defect needs `departureSchedules: []`
// together with a NON-empty `arrivalSchedules`, a pair the live data only produces after the
// day's last outbound round has left (~17:30 ICT). Waiting for the clock is not a test. The
// fixture below is the response the owner's prod search actually returned, measured
// 2026-08-23 17:47 ICT and recorded on the card: 0 outbound rounds, 6 return rounds at
// 08:00-18:00 with 20 seats each.
//
//   CAPTURE_MODE=before node e2e/scripts/capture-obrs1574.js
//   CAPTURE_MODE=after  node e2e/scripts/capture-obrs1574.js
//
// BEFORE is this same script against the same serve with the template reverted, so the two
// frames differ only in the one `@if` this card changes.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.env.CAPTURE_MODE || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4274';
const API = process.env.CAPTURE_API || 'https://sit-obrs-backend.koyeb.app';
const OUT = process.env.CAPTURE_OUT || __dirname;

const FROM_SLUG = 'nong_chak'; // หนองชาก - the owner's origin
const TO_SLUG = 'mo_chit_2_bus_terminal'; // บขส. หมอชิต (หมอชิต 2) - the owner's destination

/** today+n in the Asia/Bangkok calendar, as YYYY-MM-DD - the clock the page compares against. */
function bangkokDatePlus(days) {
  const bangkokNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  bangkokNow.setDate(bangkokNow.getDate() + days);
  return bangkokNow.toISOString().slice(0, 10);
}

function returnRounds(date) {
  return ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].map((hhmm, i) => ({
    id: 900 + i,
    vehicleType: 'van',
    departureDateTime: date + 'T' + hhmm + ':00+07:00',
    arrivalDateTime: date + 'T' + hhmm + ':00+07:00',
    pricePerSeat: '200',
    availableSeats: 20,
    availableSeatNumbers: [],
    routeSlug: 'bangkok-chonburi',
  }));
}

const log = [];
const say = (m) => {
  console.log(m);
  log.push(m);
};

/**
 * Paints what was read out of the live DOM into the frame itself. A screenshot of an empty
 * list proves nothing on its own - the reader has to be able to see that the heading is the
 * only thing that changed, and that the sold-out copy and the missing next-day button
 * (OBRS-1217, untouched here) are still exactly where they were.
 */
async function banner(page, heading) {
  return page.evaluate((heading) => {
    const old = document.getElementById('obrs1574-banner');
    if (old) old.remove();

    const titles = Array.from(document.querySelectorAll('h3.title')).map((h) =>
      (h.textContent || '').trim()
    );
    const rows = document.querySelectorAll('.schedule-item').length;
    const soldOut = document.querySelector('.sold-out-today');
    const action = document.querySelector('.sold-out-today__action');

    const lines = [
      'h3.title on page    : ' + (titles.length ? titles.join(' | ') : '(none)'),
      '.schedule-item rows : ' + rows,
      '.sold-out-today     : ' +
        (soldOut ? (soldOut.textContent || '').replace(/\s+/g, ' ').trim() : 'ABSENT'),
      'next-day button     : ' +
        (action ? 'present' : 'absent (OBRS-1217 AC-4, round trip - unchanged)'),
    ];

    const box = document.createElement('div');
    box.id = 'obrs1574-banner';
    box.style.cssText = [
      'position:fixed',
      'left:0',
      'right:0',
      'top:0',
      'z-index:2147483647',
      'background:#101418',
      'color:#e8eaf0',
      'font:12px/1.55 Consolas,monospace',
      'padding:10px 14px',
      'white-space:pre-wrap',
      'border-bottom:3px solid #4da3ff',
    ].join(';');
    box.textContent = heading + '\n' + lines.join('\n');
    document.body.appendChild(box);
    return { titles: titles, rows: rows };
  }, heading);
}

(async () => {
  const departureDate = bangkokDatePlus(0); // TODAY - what makes it the sold-out-today case
  const returnDate = bangkokDatePlus(1);
  say('OBRS-1574 capture - mode=' + MODE + ' base=' + BASE + ' api=' + API);
  say('  departureDate=' + departureDate + ' (today) returnDate=' + returnDate);

  const stops = await fetch(API + '/api/stops', { headers: { 'Accept-Language': 'th' } });
  const payload = await stops.json();
  const bySlug = new Map((payload && payload.data ? payload.data : []).map((s) => [s.slug, s.id]));
  const startStationId = bySlug.get(FROM_SLUG);
  const stopStationId = bySlug.get(TO_SLUG);
  if (!startStationId || !stopStationId) {
    throw new Error('could not resolve stop ids from ' + API + '/api/stops');
  }
  say('  stop ids: ' + FROM_SLUG + '=' + startStationId + ' ' + TO_SLUG + '=' + stopStationId);

  const fixture = {
    code: 200,
    message: 'ok',
    data: {
      departureSchedules: [],
      arrivalSchedules: returnRounds(returnDate),
      returnBoardingStop: null,
    },
  };

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.route('**/api/schedules/search', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture),
    })
  );
  await page.addInitScript(
    (ctx) => {
      localStorage.setItem('obrs.booking_context', JSON.stringify(ctx));
      localStorage.setItem('lang', 'th');
    },
    {
      version: 1,
      savedAt: Date.now(),
      value: {
        filter: {
          roundTrip: { id: 2, name: 'ไป-กลับ' },
          passengerInfo: [{ type: 'ADULT', count: 1 }],
          startStationId: startStationId,
          stopStationId: stopStationId,
          departureDate: departureDate,
          returnDate: returnDate,
          adultCount: 1,
          kidsCount: 0,
        },
        searchPayload: null,
        selection: null,
      },
    }
  );

  await page.goto(BASE + '/schedule-booking', { waitUntil: 'networkidle' });
  // Press the page's own Search button rather than trusting the restored filter to
  // auto-search: on a COLD Playwright profile the station roster is still in flight when the
  // restored filter emits, so the id->slug mapping is not ready yet and the auto-search is
  // skipped (the same reason capture-obrs1343.js clicks).
  await page.waitForTimeout(2500);
  await page.locator('button.btn-search').click();
  await page.waitForSelector('.sold-out-today', { timeout: 30000 });
  await page.waitForTimeout(1200);

  const seen = await banner(
    page,
    'OBRS-1574 ' + MODE.toUpperCase() + ' - ' + FROM_SLUG + ' -> ' + TO_SLUG +
      ', round trip, outbound sold out'
  );
  say('  h3.title: ' + (seen.titles.length ? seen.titles.join(' | ') : '(none)'));
  say('  .schedule-item rows: ' + seen.rows);

  // Fail here rather than upload a frame that shows something else: the whole card is how
  // many headings stand over an empty outbound list.
  if (seen.rows !== 0) throw new Error('expected 0 outbound rows, got ' + seen.rows);
  if (MODE === 'before' && seen.titles.length !== 1) {
    throw new Error('BEFORE must show the stranded heading; got ' + seen.titles.length);
  }
  if (MODE === 'after' && seen.titles.length !== 0) {
    throw new Error('AFTER must show no heading at all; got ' + JSON.stringify(seen.titles));
  }

  const out = path.join(OUT, 'OBRS-1574-' + MODE.toUpperCase() + '.png');
  await page.screenshot({ path: out });
  say('  saved ' + out);

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'capture-log-' + MODE + '.txt'), log.join('\n') + '\n');
  say('done');
})().catch((err) => {
  console.error('CAPTURE FAILED: ' + err.message);
  process.exit(1);
});
