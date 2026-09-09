/**
 * OBRS-1597 AC-1 repro — landing on /schedule-booking from the HOME form can
 * fire a SECOND POST /api/schedules/search whose origin is the roster's first
 * stop (`talat_nueang_chamnong`) rather than the stop the customer picked, and
 * that second answer (0 rounds) replaces the rows the first one rendered.
 *
 * It is a race, so this script does not "check once" — it runs the same walk N
 * times in a fresh browser context each round and REPORTS THE RATE. A single
 * clean round is not evidence of absence.
 *
 * Serve the frontend with the `sit` configuration on 4200 (SIT CORS is pinned
 * there), which is the substrate the defect was first measured on:
 *
 *   npx ng serve --configuration sit --port 4200
 *   node e2e/capture-obrs-1597-second-search.mjs            # 5 rounds
 *   OBRS_ROUNDS=10 node e2e/capture-obrs-1597-second-search.mjs
 *
 * Every POST /api/schedules/search is recorded with its payload, the ms since
 * the search button was pressed, and the round count its response carried, so
 * the artifact answers "what fired, with what origin, in what order" without
 * anyone re-reading a HAR by hand.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const API = process.env.OBRS_API_URL ?? 'https://sit-obrs-backend.koyeb.app';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1597');
const ROUNDS = Number(process.env.OBRS_ROUNDS ?? 5);
// Signed-in is a SEPARATE lane, not a nicety: Home prefills the top recent route
// from GET /my-bookings (home-booking.component.ts prefillTopRecentRoute), which
// only exists for a signed-in customer — so a guest-only run can only ever prove
// the guest half. Empty = guest.
const LOGIN_EMAIL = process.env.OBRS_LOGIN_EMAIL ?? '';
// Optional: run ONE earlier home search from this origin, in the SAME context,
// before the measured one. `rememberBookingFilter()` (schedule-filter.effect.ts)
// writes every filter to the cross-tab booking context, and
// `schedule-filter.reducer.ts:17` seeds `initialState` from it at MODULE
// EVALUATION time — so a full page load after an earlier search starts from that
// stored filter, not from an empty one. A fresh context per round can never
// exercise that, and the OBRS-1583 session that first saw the defect was not
// running in fresh contexts.
const PRIME_SLUG = process.env.OBRS_PRIME_ORIGIN ?? '';
// Mantra step 1: "50% flake is debuggable, 1% is not." A race between two store
// subscriptions is decided by how much CPU time lands between them, so slowing
// the renderer widens every such window at once — without a single sleep in the
// app, which the card forbids as a FIX and which would also hide the bug here.
const CPU_THROTTLE = Number(process.env.OBRS_CPU_THROTTLE ?? 1);
const PASSWORD = process.env.OBRS_SEED_PASSWORD ?? 'P@ssw0rd';

// Same route as OBRS-1583's capture: the one pair on SIT that carries rounds
// tomorrow. Picked by SLUG and translated to the rendered Thai label, because
// option position differs between the two forms.
const FROM_SLUG = process.env.OBRS_FROM_STOP ?? 'nong_chak';
const TO_SLUG = process.env.OBRS_TO_STOP ?? 'mo_chit_2_bus_terminal';

async function thaiStopLabels() {
  const res = await fetch(`${API}/api/stops`);
  const stops = (await res.json()).data ?? [];
  const label = (slug) => {
    const hit = stops.find((s) => s.slug === slug);
    if (!hit?.translations?.th?.label) {
      throw new Error(`stop '${slug}' is not in ${API}/api/stops — re-derive the route`);
    }
    return hit.translations.th.label.trim();
  };
  return {
    from: label(FROM_SLUG),
    to: label(TO_SLUG),
    prime: PRIME_SLUG ? label(PRIME_SLUG) : null,
  };
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

/** Fills the HOME form and presses ค้นหา. The walk the defect needs. */
async function searchFromHome(page, labels, fromLabel) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-search').waitFor({ timeout: 30000 });

  // One-way: the form defaults to a round trip (OBRS-1185), which drags a
  // return leg into a search this card has nothing to do with.
  await page.locator('.trip-type-toggle__btn').first().click();

  // Tomorrow — SIT's last round of the day has usually departed by the time
  // this runs, and an empty first result proves nothing about a second search.
  const tomorrow = new Date(Date.now() + 86400000);
  await page.locator('#home-departure-date').click();
  await page
    .locator('.app-date-field-panel td:not(.p-datepicker-other-month) span')
    .filter({ hasText: new RegExp(`^${tomorrow.getDate()}$`) })
    .first()
    .click();

  const groups = page.locator('.station-group app-dropdown-group-obrs');
  await groups.first().locator('.dropdown-btn').click();
  // The roster arrives from GET /api/stops, so on a cold first load the menu can
  // open EMPTY and the label filter then just times out — which reads as "the
  // stop is missing" when it only means "not yet". Wait for the list itself.
  await groups
    .first()
    .locator('.dropdown-menu.show .dropdown-option')
    .first()
    .waitFor({ timeout: 30000 });
  await groups
    .first()
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasText: fromLabel ?? labels.from })
    .first()
    .click();

  // The destination list is rebuilt from the chosen origin — without this pause
  // the click lands on the PREVIOUS list.
  await page.waitForTimeout(1000);
  await groups.nth(1).locator('.dropdown-btn').click();
  await page.waitForTimeout(500);
  await groups
    .nth(1)
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasText: labels.to })
    .first()
    .click();

  return page.locator('.btn-search').click();
}

async function runRound(browser, labels, index) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  if (CPU_THROTTLE > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }

  // Mantra step 2 — 'know the fail path'. Playwright's request event says WHAT
  // went out, never WHO sent it. Angular's HttpClient goes through XHR, so
  // wrapping send() captures a JS stack per search request: the dev build is
  // source-mapped, so the frames name the dispatch site instead of leaving the
  // second search anonymous. Removed once the fail path is known.
  // The app instruments `StoreDevtoolsModule` unconditionally (app.module.ts),
  // so a stub extension installed before boot yields the full NgRx action log —
  // which action re-wrote the filter, in order, with its payload. No source
  // change, and it works against the optimized `sit` build where a JS stack is
  // minified to nothing.
  await page.addInitScript(() => {
    window.__obrsActions = [];
    const record = (envelope, state) => {
      // redux-devtools wraps every dispatch as { type: 'PERFORM_ACTION', action }
      // — the NgRx action is the inner one. Recording the envelope's type gives
      // 12 x PERFORM_ACTION and says nothing.
      const action = envelope?.action ?? envelope;
      const payload = action?.schedule_filter;
      const slice = state?.scheduleFilter;
      window.__obrsActions.push({
        t: Date.now(),
        type: action?.type,
        payloadStart: payload?.startStationId ?? null,
        payloadStop: payload?.stopStationId ?? null,
        // The resulting slice is what the filter component's subscription reads,
        // so an action that carries no filter of its own (a lazy feature's
        // reducer update, say) still shows what it did to the origin.
        stateStart: slice?.startStationId ?? null,
        stateStop: slice?.stopStationId ?? null,
      });
    };
    const connection = {
      init: () => undefined,
      subscribe: () => () => undefined,
      unsubscribe: () => undefined,
      send: (action, state) => record(action, state),
      error: () => undefined,
    };
    window.__REDUX_DEVTOOLS_EXTENSION__ = {
      connect: () => connection,
      send: (action, state) => record(action, state),
      disconnect: () => undefined,
    };
  });

  await page.addInitScript(() => {
    window.__obrs1597 = [];
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__obrsUrl = url;
      return open.call(this, method, url, ...rest);
    };
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      if (String(this.__obrsUrl).includes('/api/schedules/search')) {
        window.__obrs1597.push({
          body: String(body ?? ''),
          stack: new Error('obrs-1597').stack,
        });
      }
      return send.call(this, body);
    };
  });
  const searches = [];
  let pressedAt = 0;

  page.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().includes('/api/schedules/search')) return;
    let payload = null;
    try {
      payload = JSON.parse(req.postData() ?? 'null');
    } catch {
      payload = req.postData();
    }
    searches.push({
      order: searches.length + 1,
      atMs: pressedAt ? Date.now() - pressedAt : null,
      fromStop: payload?.fromStop ?? null,
      toStop: payload?.toStop ?? null,
      payload,
      rounds: null,
    });
  });

  page.on('response', async (res) => {
    if (!res.url().includes('/api/schedules/search')) return;
    const hit = searches.find((s) => s.rounds === null);
    if (!hit) return;
    try {
      const body = await res.json();
      const data = body?.data;
      hit.rounds = Array.isArray(data?.departureSchedules)
        ? data.departureSchedules.length
        : Array.isArray(data)
          ? data.length
          : null;
      hit.status = res.status();
    } catch {
      hit.rounds = null;
    }
  });

  if (LOGIN_EMAIL) await login(page);

  if (PRIME_SLUG) {
    // The priming search is deliberately NOT measured: `pressedAt` is still 0,
    // and its own requests are dropped from `searches` below.
    await searchFromHome(page, labels, labels.prime);
    await page
      .waitForURL((u) => u.pathname.includes('/schedule-booking'), { timeout: 30000 })
      .catch(() => undefined);
    await page.waitForTimeout(4000);
    searches.length = 0;
  }

  pressedAt = Date.now();
  await searchFromHome(page, labels);

  // Let the page settle well past the second request's window — the defect is
  // that the LIST is wiped after it rendered, so a check taken at first paint
  // would pass on a round that fails.
  await page.waitForURL((u) => u.pathname.includes('/schedule-booking'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(8000);

  const actions = await page.evaluate(() => window.__obrsActions ?? []);
  const stacks = await page.evaluate(() => window.__obrs1597 ?? []);
  const rowsAfter = await page.evaluate(() => document.querySelectorAll('.schedule-item').length);
  const wrongOrigin = searches.filter((s) => s.fromStop && s.fromStop !== FROM_SLUG);
  const failed = searches.length > 1 || wrongOrigin.length > 0 || rowsAfter === 0;

  const shot = path.join(
    OUT,
    `${LOGIN_EMAIL ? LOGIN_EMAIL.split('@')[0] : 'guest'}-round-${index}-${failed ? 'REPRO' : 'clean'}.png`
  );
  await page.screenshot({ path: shot, fullPage: false });

  await context.close();
  return { round: index, searches, actions, stacks, rowsAfter, wrongOrigin: wrongOrigin.length, failed, shot };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const labels = await thaiStopLabels();
  const browser = await chromium.launch();
  const rounds = [];

  for (let i = 1; i <= ROUNDS; i += 1) {
    const result = await runRound(browser, labels, i);
    rounds.push(result);
    console.log(
      `round ${i}: searches=${result.searches.length} ` +
        `origins=[${result.searches.map((s) => s.fromStop).join(', ')}] ` +
        `rows=${result.rowsAfter} ${result.failed ? 'REPRO' : 'clean'}`
    );
  }

  await browser.close();

  const reproduced = rounds.filter((r) => r.failed).length;
  const summary = {
    base: BASE,
    api: API,
    identity: LOGIN_EMAIL || 'guest',
    primedOrigin: PRIME_SLUG || null,
    cpuThrottle: CPU_THROTTLE,
    route: { from: FROM_SLUG, to: TO_SLUG },
    rounds: ROUNDS,
    reproduced,
    rate: `${reproduced}/${ROUNDS}`,
    detail: rounds,
  };
  const file = path.join(OUT, `repro-${LOGIN_EMAIL ? LOGIN_EMAIL.split('@')[0] : 'guest'}.json`);
  await writeFile(file, JSON.stringify(summary, null, 2));
  console.log(`\nreproduced ${reproduced}/${ROUNDS} — ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
