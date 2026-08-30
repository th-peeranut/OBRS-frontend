// OBRS-1654 BEFORE/AFTER evidence - the RETURN heading that printed over an empty return list.
//
// NOTHING IS STUBBED. This is the mirror card of OBRS-1574 and the mirror of its evidence
// lane: that one had to fake the response because `departureSchedules: []` with a non-empty
// `arrivalSchedules` only exists after the day's last outbound has left. This one does not,
// because the SAME clock produces this card's state on the REVERSED pair, and it was measured
// before a line of this script was written (2026-08-30 16:59 ICT, live SIT):
//
//   mo_chit_2_bus_terminal -> nong_chak, round trip, both legs TODAY
//     departureSchedules = [ id 437, 18:00 ]   (Bangkok -> Chonburi, the way out)
//     arrivalSchedules   = [ id 865, 17:30 ]   (Chonburi -> Bangkok, the way back)
//
// `ScheduleRepository` filters rounds that have already departed, so between 17:30 and 18:00
// today the way back is empty while the way out still sells: `departureSchedules` non-empty,
// `arrivalSchedules: []`. That is this card's state, out of the live SIT database, and the
// script REFUSES to take a frame outside that window rather than draw it with a fixture.
//
// The one thing here that is not an ordinary customer's session is the LOGIN:
// `features.onlineTicketBooking` is false on SIT exactly as on prod (OBRS-1302), so the
// "เลือก" button - the only way to set `isSelectFirst` - renders only for the role preview
// OBRS-1583 added. admin@system.local is one of those roles. The flag itself is untouched.
//
//   CAPTURE_MODE=before node e2e/scripts/capture-obrs1654.js
//   CAPTURE_MODE=after  node e2e/scripts/capture-obrs1654.js
//
// BEFORE is this same script against the same serve with the template reverted, so the two
// frames differ only in the one `@if` this card changes.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.env.CAPTURE_MODE || 'after').toLowerCase();
const PORT = process.env.CAPTURE_PORT || '4278';
const BASE = process.env.CAPTURE_BASE || 'http://localhost:' + PORT;
const API = process.env.CAPTURE_API || 'https://sit-obrs-backend.koyeb.app';
const OUT = process.env.CAPTURE_OUT || __dirname;
const WHO = process.env.CAPTURE_USER || 'admin@system.local';
const PASS = process.env.CAPTURE_PASS || 'P@ssw0rd';

const FROM_SLUG = 'mo_chit_2_bus_terminal'; // บขส. หมอชิต (หมอชิต 2)
const TO_SLUG = 'nong_chak'; // หนองชาก

/** today in the Asia/Bangkok calendar, as YYYY-MM-DD - the clock the page and the SQL share. */
function bangkokToday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return now.toISOString().slice(0, 10);
}

const log = [];
const say = (m) => {
  console.log(m);
  log.push(m);
};

/**
 * Paints what was read out of the live DOM into the frame itself. A screenshot of a heading
 * proves nothing on its own - the reader has to be able to see that the return list really is
 * empty, that OBRS-1336's modal is the thing standing over it, and that the only difference
 * between the two frames is whether "ขากลับ" is printed over nothing.
 */
async function banner(page, heading, apiLine) {
  return page.evaluate(
    ([heading, apiLine]) => {
      const old = document.getElementById('obrs1654-banner');
      if (old) old.remove();

      const titles = Array.from(document.querySelectorAll('h3.title')).map((h) =>
        (h.textContent || '').trim()
      );
      const noResults = Array.from(document.querySelectorAll('.no-results')).map((p) =>
        (p.textContent || '').replace(/\s+/g, ' ').trim()
      );
      const rows = document.querySelectorAll('.schedule-item').length;
      const modal = document.querySelector('.nrc-backdrop');

      const lines = [
        'API (live SIT)      : ' + apiLine,
        'h3.title on page    : ' + (titles.length ? titles.join(' | ') : '(none)'),
        '.schedule-item rows : ' + rows + ' (all outbound - the return list is empty)',
        '.no-results         : ' + (noResults.length ? noResults.join(' | ') : '(none)'),
        'OBRS-1336 modal     : ' +
          (modal ? 'open, backdrop ' + getComputedStyle(modal).backgroundColor : 'ABSENT'),
      ];

      const box = document.createElement('div');
      box.id = 'obrs1654-banner';
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
      return { titles: titles, rows: rows, modal: !!modal };
    },
    [heading, apiLine]
  );
}

(async () => {
  const today = bangkokToday();
  say('OBRS-1654 capture - mode=' + MODE + ' base=' + BASE + ' api=' + API);
  say('  departureDate=returnDate=' + today + ' (both legs today) as=' + WHO);

  const stops = await fetch(API + '/api/stops', { headers: { 'Accept-Language': 'th' } });
  const payload = await stops.json();
  const bySlug = new Map((payload && payload.data ? payload.data : []).map((s) => [s.slug, s.id]));
  const startStationId = bySlug.get(FROM_SLUG);
  const stopStationId = bySlug.get(TO_SLUG);
  if (!startStationId || !stopStationId) {
    throw new Error('could not resolve stop ids from ' + API + '/api/stops');
  }
  say('  stop ids: ' + FROM_SLUG + '=' + startStationId + ' ' + TO_SLUG + '=' + stopStationId);

  // Ask the backend the same question the page is about to ask, BEFORE opening a browser. The
  // window this card needs is ~30 minutes wide and closes on its own; a frame taken outside it
  // would show a return list that is empty for the wrong reason, or not empty at all.
  const probe = await fetch(API + '/api/schedules/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'th' },
    body: JSON.stringify({
      bookingType: 'return',
      departureDate: today,
      returnDate: today,
      fromStop: FROM_SLUG,
      toStop: TO_SLUG,
      numberOfPassengers: 1,
    }),
  });
  const body = await probe.json();
  const data = (body && body.data) || {};
  const dep = data.departureSchedules || [];
  const arr = data.arrivalSchedules || [];
  const apiLine =
    'departureSchedules=' +
    dep.length +
    ' [' +
    dep.map((s) => s.departureDateTime.slice(11, 16)).join(',') +
    ']  arrivalSchedules=' +
    arr.length +
    (arr.length ? ' [' + arr.map((s) => s.departureDateTime.slice(11, 16)).join(',') + ']' : '');
  say('  ' + apiLine + '   (measured ' + new Date().toISOString() + ')');
  if (dep.length === 0 || arr.length !== 0) {
    throw new Error(
      'the live window is not open: this card needs departureSchedules non-empty AND ' +
        'arrivalSchedules empty; got ' +
        apiLine
    );
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(
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
          departureDate: today,
          returnDate: today,
          adultCount: 1,
          kidsCount: 0,
        },
        searchPayload: null,
        selection: null,
      },
    }
  );
  const page = await context.newPage();

  // OBRS-1583 role preview - see the header comment. Without it the row renders the Facebook
  // link instead of the button and `isSelectFirst` can never be set.
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(WHO);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
  say('  logged in, landed on ' + new URL(page.url()).pathname);

  await page.goto(BASE + '/schedule-booking', { waitUntil: 'networkidle' });
  // Press the page's own Search button rather than trusting the restored filter to
  // auto-search: on a COLD Playwright profile the station roster is still in flight when the
  // restored filter emits, so the id->slug mapping is not ready yet and the auto-search is
  // skipped (same reason capture-obrs1574.js and capture-obrs1343.js click).
  await page.waitForTimeout(2500);

  // The return leg has to be TODAY, and the form will not carry that in from the restored
  // context: `schedule-booking-filter` re-defaults `returnDate` to departure+1 on every
  // restore (measured - the seeded context comes back rewritten to tomorrow). So pick it the
  // way a customer does. Same-day IS a legal choice: `[minDate]` on the return picker is the
  // CURRENT departureDate (OBRS-1185), not the day after it.
  await page.locator('#filter-return-date').click();
  const panel = page.locator('.p-datepicker-panel').first();
  await panel.waitFor({ timeout: 15000 });
  await panel
    .locator('td:not(.p-datepicker-other-month) span:not(.p-disabled)')
    .filter({ hasText: new RegExp('^' + Number(today.slice(8, 10)) + '$') })
    .first()
    .click();
  await page.waitForTimeout(500);
  say('  return date set to ' + today + ' via the form picker');

  await page.locator('button.btn-search').click();
  await page.waitForSelector('.schedule-item', { timeout: 30000 });

  // The whole card is what this click leaves on screen: `isSelectFirst` goes true and, because
  // the return leg is empty on a round trip, OBRS-1336 opens its modal INSTEAD of navigating.
  await page.locator('.select-btn').first().click();
  await page.waitForSelector('.nrc-backdrop', { timeout: 30000 });
  await page.waitForTimeout(800);
  // Clicking scrolls the button into view, and the BEFORE tree is one heading taller than the
  // AFTER one - so without this the two frames sit at different scroll offsets and differ by
  // more than the thing being proved. Same offset, same viewport, one difference.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const seen = await banner(
    page,
    'OBRS-1654 ' +
      MODE.toUpperCase() +
      ' - ' +
      FROM_SLUG +
      ' -> ' +
      TO_SLUG +
      ', round trip both legs today, outbound picked, no return rounds left',
    apiLine
  );
  say('  h3.title: ' + (seen.titles.length ? seen.titles.join(' | ') : '(none)'));
  say('  .schedule-item rows: ' + seen.rows + '  OBRS-1336 modal: ' + seen.modal);

  // Fail here rather than upload a frame that shows something else.
  if (!seen.modal) throw new Error('OBRS-1336 modal is not open - this is not the state');
  const hasReturnHeading = seen.titles.some((t) => t.includes('ขากลับ'));
  if (MODE === 'before' && !hasReturnHeading) {
    throw new Error(
      'BEFORE must show the stranded return heading; got ' + JSON.stringify(seen.titles)
    );
  }
  if (MODE === 'after' && hasReturnHeading) {
    throw new Error('AFTER must show no return heading; got ' + JSON.stringify(seen.titles));
  }

  const out = path.join(OUT, 'OBRS-1654-' + MODE.toUpperCase() + '.png');
  await page.screenshot({ path: out });
  say('  saved ' + out);

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'capture-log-' + MODE + '.txt'), log.join('\n') + '\n');
  say('done');
})().catch((err) => {
  console.error('CAPTURE FAILED: ' + err.message);
  process.exit(1);
});
