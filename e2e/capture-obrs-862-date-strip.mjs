/**
 * OBRS-862 verification + visual evidence — the /schedule-booking day strip.
 *
 * Run TWICE with nothing changed but `--label` and which worktree is serving
 * 4200. Both worktrees resolve `environment.base.ts:13 apiUrl` to
 * http://localhost:8080, so the pair is a controlled comparison against ONE
 * backend and one database (`obrs862qa`) — not two different systems.
 *
 *   # BEFORE worktree (detached at origin/dev 5950c448) serving 4200:
 *   node e2e/capture-obrs-862-date-strip.mjs --label before
 *   # AFTER worktree (ao/obrs-862-schedule-date-strip 995e6dba) serving 4200:
 *   node e2e/capture-obrs-862-date-strip.mjs --label after
 *
 * Every claim it makes is a MEASUREMENT, printed into `result.json` next to the
 * PNGs:
 *   - AC-1  the strip's box sits above the list's box, and the selected chip
 *           differs from an available chip in computed background/colour/weight.
 *   - AC-2  a tap on an available chip fires EXACTLY ONE POST
 *           /api/schedules/search (two = the OBRS-1503 double dispatch) and
 *           patches `#filter-departure-date`.
 *   - AC-3  the greyed set is compared against the availability response the
 *           APP ITSELF received, so the picture is proven to match the data,
 *           and a greyed chip is clicked to prove it fires nothing.
 *   - AC-6  at 360 px the PAGE does not scroll sideways while the strip does.
 *   - AC-7  the chips' computed colours are read in dark mode, not assumed.
 *
 * The fixture (`e2e/fixtures/obrs862-date-strip-fixture.sql`) places departures
 * relative to CURRENT_DATE: today none, +1/+2 trips, +3/+4 none, +5/+6 trips,
 * +7/+8 none, +9 trips. So the DEFAULT search — today — is the empty state this
 * card is about, and its 7-day window holds available, unavailable and selected
 * chips at once. Nothing here hard-codes a date.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const API = process.env.OBRS_API_URL ?? 'http://localhost:8080';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-862');

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();
const UP = LABEL.toUpperCase();

const FROM_SLUG = 'nong_chak';
const TO_SLUG = 'bts_mo_chit';

const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const addDays = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};
const TODAY = iso(new Date());

/** The Thai labels the two forms render, resolved from the SAME backend the app
 *  talks to — picking by slug and translating, because option ORDER differs
 *  between the home form and the results filter bar. */
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
  return { from: label(FROM_SLUG), to: label(TO_SLUG) };
}

/** Ground truth straight from the endpoint, for the AC-3 cross-check. */
async function availabilityFromApi(fromDate, days) {
  const res = await fetch(`${API}/api/schedules/availability`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fromStop: FROM_SLUG,
      toStop: TO_SLUG,
      numberOfPassengers: 1,
      fromDate,
      days,
    }),
  });
  return (await res.json()).data ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The walk to a results page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Click, falling back to a DIRECT event dispatch on the element.
 *
 * The home hero's decorative `<img class="home-bg" role="presentation">` paints
 * over the booking card's trip-type toggle: measured 2026-09-05 at 1440x1000 the
 * image is 1440x540 at y=80 and the one-way button is at y=568, both
 * `position: static` with `z-index: auto`, so `document.elementFromPoint` at the
 * button's centre returns the IMAGE. `force: true` does NOT help — it skips the
 * actionability WAIT but still dispatches at coordinates, so the image eats it
 * and the click silently no-ops. Only `dispatchEvent` reaches the handler.
 *
 * This is a REAL pre-existing home-page defect (it reproduces on the BEFORE
 * worktree at origin/dev 5950c448, at 7 of 8 viewports — see
 * `probe-obrs-862-toggle.mjs`), reported separately. It is dispatched around
 * here so that an unrelated stacking bug on a DIFFERENT page cannot masquerade
 * as a verdict about the day strip.
 *
 * Used ONLY on the home form. Never on a day chip, where "can this actually be
 * clicked" is the thing under test — those use a real `.click()`.
 */
async function safeClick(locator) {
  try {
    await locator.click({ timeout: 6000 });
  } catch {
    await locator.dispatchEvent('click');
  }
}

/** The trip-type toggle always goes through a direct dispatch: a real click is
 *  known-swallowed above, and `select()` early-returns when the option is
 *  already selected, so a silent no-op is indistinguishable from success unless
 *  the resulting state is asserted — which `tripTypeState` does. */
async function selectTripType(page, index) {
  await page.locator('.trip-type-toggle__btn').nth(index).dispatchEvent('click');
  await page.waitForTimeout(700);
}

const tripTypeState = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.trip-type-toggle__btn')).map((b) => ({
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      pressed: b.getAttribute('aria-pressed'),
    }))
  );

async function pickDate(page, inputId, date) {
  await safeClick(page.locator(`#${inputId}`));
  await page.waitForTimeout(400);
  await safeClick(
    page
      .locator('.app-date-field-panel td:not(.p-datepicker-other-month) span')
      .filter({ hasText: new RegExp(`^${date.getDate()}$`) })
      .first()
  );
  await page.waitForTimeout(400);
}

/**
 * Fills the HOME form and presses ค้นหา. `tripType` 0 = one-way, 1 = round trip.
 * The form defaults to a round trip (OBRS-1185), so one-way is an explicit tap.
 */
async function searchFromHome(page, labels, { tripType = 0, departure, ret } = {}) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-search').waitFor({ timeout: 60000 });

  await selectTripType(page, tripType);

  const groups = page.locator('.station-group app-dropdown-group-obrs');
  await safeClick(groups.first().locator('.dropdown-btn'));
  // The roster arrives from GET /api/stops, so a cold first load can open the
  // menu EMPTY and a label filter then just times out — which reads as "the stop
  // is missing" when it only means "not yet". Wait for the list itself.
  await groups.first().locator('.dropdown-menu.show .dropdown-option').first().waitFor({ timeout: 60000 });
  await safeClick(
    groups.first().locator('.dropdown-menu.show .dropdown-option').filter({ hasText: labels.from }).first()
  );

  // The destination list is rebuilt from the chosen origin — without this pause
  // the click lands on the PREVIOUS list.
  await page.waitForTimeout(1200);
  await safeClick(groups.nth(1).locator('.dropdown-btn'));
  await page.waitForTimeout(600);
  await safeClick(
    groups.nth(1).locator('.dropdown-menu.show .dropdown-option').filter({ hasText: labels.to }).first()
  );
  await page.waitForTimeout(400);

  await pickDate(page, 'home-departure-date', departure);

  const toggle = await tripTypeState(page);
  const wantOneWay = tripType === 0;
  const oneWayPressed = toggle[0]?.pressed === 'true';
  if (wantOneWay !== oneWayPressed) {
    throw new Error(
      `trip type did not take: asked for ${wantOneWay ? 'one-way' : 'round trip'} but the toggle reads ${JSON.stringify(toggle)}`
    );
  }
  if (tripType === 1 && ret) await pickDate(page, 'home-return-date', ret);

  await safeClick(page.locator('.btn-search'));
  await page.waitForURL((u) => u.pathname.includes('/schedule-booking'), { timeout: 60000 });
  await page.waitForTimeout(6000);
  return toggle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Readers — every one of them returns numbers, never an impression
// ─────────────────────────────────────────────────────────────────────────────

const readChips = (page) =>
  page.evaluate(() => {
    const strip = document.querySelector('[data-testid="day-strip"]');
    if (!strip) return null;
    return Array.from(strip.querySelectorAll('[data-testid="day-strip-chip"]')).map((el) => {
      const cs = getComputedStyle(el);
      const dateEl = el.querySelector('.day-strip__date');
      return {
        iso: el.getAttribute('data-date'),
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        selected: el.classList.contains('is-selected'),
        unavailable: el.classList.contains('is-unavailable'),
        ariaPressed: el.getAttribute('aria-pressed'),
        ariaDisabled: el.getAttribute('aria-disabled'),
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        borderColor: cs.borderTopColor,
        fontWeight: cs.fontWeight,
        dateDecoration: dateEl ? getComputedStyle(dateEl).textDecorationLine : null,
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      };
    });
  });

const readEmptyState = (page) =>
  page.evaluate(() => {
    const block = document.querySelector('.sold-out-today');
    if (!block) return { present: false };
    const q = (s) => document.querySelector(s);
    return {
      present: true,
      title: q('.sold-out-today__title')?.innerText?.trim() ?? null,
      noResults: q('.sold-out-today .no-results')?.innerText?.trim() ?? null,
      hint: q('.sold-out-today__hint')?.innerText?.trim() ?? null,
      // The jump BUTTON — deliberately absent on a round trip (canJumpToNextDay).
      actionPresent: !!q('.sold-out-today__action'),
      actionTestId: q('.sold-out-today__action')?.getAttribute('data-testid') ?? null,
      actionText: q('.sold-out-today__action')?.innerText?.trim() ?? null,
    };
  });

const readLayout = (page) =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
    };
    const strip = document.querySelector('[data-testid="day-strip"]');
    return {
      stripBox: box('[data-testid="day-strip"]'),
      listBox: box('app-schedule-booking-list'),
      filterBox: box('app-schedule-booking-filter'),
      stripPresent: !!strip,
      stripRole: strip?.getAttribute('role') ?? null,
      stripAriaLabel: strip?.getAttribute('aria-label') ?? null,
      rows: document.querySelectorAll('.schedule-item').length,
      filterDate: document.querySelector('#filter-departure-date')?.value ?? null,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      stripScrollWidth: strip?.scrollWidth ?? null,
      stripClientWidth: strip?.clientWidth ?? null,
    };
  });

/** Puts the strip (or, on BEFORE, the filter bar) near the top of the shot so
 *  the control under test and the result below it are in the same frame. */
async function frameStrip(page) {
  await page.evaluate(() => {
    const el =
      document.querySelector('[data-testid="day-strip"]') ??
      document.querySelector('app-schedule-booking-filter');
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - 140));
    }
  });
  await page.waitForTimeout(700);
}

async function shoot(page, name) {
  const file = path.join(OUT, `OBRS-862-${UP}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT, { recursive: true });
  const labels = await thaiStopLabels();

  const report = {
    label: LABEL,
    base: BASE,
    api: API,
    today: TODAY,
    route: { from: FROM_SLUG, to: TO_SLUG, labels },
    shots: [],
    checks: {},
  };

  const browser = await chromium.launch();

  // Every POST the page makes, so "exactly one search" is counted and not felt.
  const wire = { search: [], availability: [] };
  const attach = (page) => {
    page.on('request', (req) => {
      if (req.method() !== 'POST') return;
      const url = req.url();
      let payload = null;
      try {
        payload = JSON.parse(req.postData() ?? 'null');
      } catch {
        payload = req.postData();
      }
      if (url.includes('/api/schedules/search')) wire.search.push({ t: Date.now(), payload });
      if (url.includes('/api/schedules/availability'))
        wire.availability.push({ t: Date.now(), payload, response: null });
    });
    page.on('response', async (res) => {
      if (!res.url().includes('/api/schedules/availability')) return;
      const hit = wire.availability.find((a) => a.response === null);
      if (!hit) return;
      try {
        hit.response = (await res.json())?.data ?? null;
      } catch {
        hit.response = 'unreadable';
      }
    });
  };

  // ── Stage A · desktop light, one-way, TODAY (the empty day) ────────────────
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  attach(page);

  const toggleA = await searchFromHome(page, labels, { tripType: 0, departure: addDays(0) });
  await frameStrip(page);

  report.checks.stageA = {
    tripType: toggleA,
    searchPayload: wire.search[0]?.payload ?? null,
    layout: await readLayout(page),
    chips: await readChips(page),
    emptyState: await readEmptyState(page),
    searchPosts: wire.search.length,
    availabilityPosts: wire.availability.length,
    availabilityRequest: wire.availability[0]?.payload ?? null,
    availabilityResponse: wire.availability[0]?.response ?? null,
  };
  report.shots.push(await shoot(page, 'desktop-light-empty-day'));

  // The endpoint's own answer for the window the app asked about — the AC-3
  // cross-check reference, fetched independently of the browser.
  const req = report.checks.stageA.availabilityRequest;
  report.checks.apiAvailability = req
    ? await availabilityFromApi(req.fromDate, req.days)
    : await availabilityFromApi(TODAY, 7);

  // ── Stage G · the SAME scenario on a NON-today empty day (today+3) ────────
  // The pair that actually isolates this card. On `today` the pre-card page
  // still offers the OBRS-1217 blind "+1 day" button, so it is not a dead end
  // — it just steps one day forward whether or not that day has trips. On a
  // day that is NOT today the pre-card `.sold-out-today` branch does not apply
  // and the page falls through to a bare `.no-results` paragraph: no control,
  // no hint, no button. That is the dead end this card removes, and it is the
  // state both labels are photographed in.
  const gCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const gPage = await gCtx.newPage();
  attach(gPage);
  const gSearchBefore = wire.search.length;
  const gAvailBefore = wire.availability.length;
  await searchFromHome(gPage, labels, { tripType: 0, departure: addDays(3) });
  await frameStrip(gPage);
  report.checks.stageG = {
    scenario: 'one-way, today+3 (a day the fixture leaves empty, and NOT today)',
    searchedDate: iso(addDays(3)),
    searchPayload: wire.search[gSearchBefore]?.payload ?? null,
    layout: await readLayout(gPage),
    chips: await readChips(gPage),
    emptyState: await readEmptyState(gPage),
    availabilityRequest: wire.availability[gAvailBefore]?.payload ?? null,
    availabilityResponse: wire.availability[gAvailBefore]?.response ?? null,
  };
  report.shots.push(await shoot(gPage, 'desktop-light-empty-non-today'));
  await gCtx.close();

  if (LABEL === 'before') {
    // Nothing else to measure: the control does not exist. Record the dead end.
    report.checks.before = {
      stripPresent: report.checks.stageA.layout.stripPresent,
      dayStripNodes: await page.locator('[data-testid="day-strip"]').count(),
      chipNodes: await page.locator('[data-testid="day-strip-chip"]').count(),
      availabilityPosts: wire.availability.length,
      hint: report.checks.stageA.emptyState.hint,
    };
    // Mobile, so the pair is comparable at 360 too.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(1200);
    await frameStrip(page);
    report.checks.beforeMobile = await readLayout(page);
    report.shots.push(await shoot(page, 'mobile360-empty-day'));

    await context.close();
    await browser.close();
    await writeFile(path.join(OUT, `obrs-862-${LABEL}-result.json`), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // ── Stage B · AC-2 · tap an AVAILABLE chip ────────────────────────────────
  const avail = report.checks.stageA.availabilityResponse?.availableDates ?? [];
  const target = avail.find((d) => d > TODAY);
  if (!target) throw new Error(`no available day in the window to tap — availability was ${JSON.stringify(avail)}`);

  const beforeTap = {
    filterDate: report.checks.stageA.layout.filterDate,
    searchPosts: wire.search.length,
  };
  await page.locator(`[data-testid="day-strip-chip"][data-date="${target}"]`).click();
  await page.waitForTimeout(7000);
  await frameStrip(page);

  const afterTap = await readLayout(page);
  report.checks.stageB = {
    tappedDay: target,
    searchPostsBefore: beforeTap.searchPosts,
    searchPostsAfter: wire.search.length,
    searchPostsFiredByTap: wire.search.length - beforeTap.searchPosts,
    lastSearchPayloadDate:
      wire.search[wire.search.length - 1]?.payload?.departureDate ??
      wire.search[wire.search.length - 1]?.payload?.date ??
      null,
    filterDateBefore: beforeTap.filterDate,
    filterDateAfter: afterTap.filterDate,
    rowsAfter: afterTap.rows,
    chips: await readChips(page),
    emptyState: await readEmptyState(page),
  };
  report.shots.push(await shoot(page, 'desktop-light-day-with-trips'));

  // ── Stage C · AC-3 · a GREYED chip must do nothing ────────────────────────
  const chipsNow = report.checks.stageB.chips ?? [];
  const greyed = chipsNow.find((c) => c.unavailable);
  if (greyed) {
    const before = {
      searchPosts: wire.search.length,
      availabilityPosts: wire.availability.length,
      filterDate: afterTap.filterDate,
      selected: chipsNow.find((c) => c.selected)?.iso ?? null,
    };
    await page.locator(`[data-testid="day-strip-chip"][data-date="${greyed.iso}"]`).click({ force: true });
    await page.waitForTimeout(4000);
    const after = await readLayout(page);
    const chipsAfter = await readChips(page);
    report.checks.stageC = {
      clickedGreyedDay: greyed.iso,
      searchPostsFired: wire.search.length - before.searchPosts,
      availabilityPostsFired: wire.availability.length - before.availabilityPosts,
      filterDateBefore: before.filterDate,
      filterDateAfter: after.filterDate,
      selectedBefore: before.selected,
      selectedAfter: chipsAfter?.find((c) => c.selected)?.iso ?? null,
      rowsAfter: after.rows,
    };
  } else {
    report.checks.stageC = { skipped: 'no unavailable chip in this window' };
  }

  await context.close();

  // ── Stage D · AC-6 · 360 px ───────────────────────────────────────────────
  // A FRESH walk rather than re-selecting today from the strip: every empty day
  // is greyed, and a greyed chip is (correctly) not selectable, so the strip
  // cannot navigate back to an empty day at all. That is the design, not a
  // defect — the empty state is reached through the form, which is what this
  // walk does. Searching `today` puts the empty copy and the full mix of
  // available/greyed/selected chips in ONE mobile frame.
  const mCtx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page2 = await mCtx.newPage();
  attach(page2);
  await searchFromHome(page2, labels, { tripType: 0, departure: addDays(0) });
  await frameStrip(page2);

  const mobileLayout = await readLayout(page2);
  report.checks.stageD = {
    viewport: '360x740',
    docScrollWidth: mobileLayout.docScrollWidth,
    docClientWidth: mobileLayout.docClientWidth,
    pageScrollsSideways: mobileLayout.docScrollWidth > mobileLayout.docClientWidth,
    horizontalOverflowPx: mobileLayout.docScrollWidth - mobileLayout.docClientWidth,
    stripScrollWidth: mobileLayout.stripScrollWidth,
    stripClientWidth: mobileLayout.stripClientWidth,
    stripItselfScrolls: (mobileLayout.stripScrollWidth ?? 0) > (mobileLayout.stripClientWidth ?? 0),
    chips: await readChips(page2),
    emptyState: await readEmptyState(page2),
  };
  report.shots.push(await shoot(page2, 'mobile360-day-strip'));
  await mCtx.close();

  // ── Stage E · AC-7 · dark ─────────────────────────────────────────────────
  // A fresh context with the preference written BEFORE boot: `ThemeService.init()`
  // runs from AppComponent and reads localStorage `app_admin_theme` once.
  const darkCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await darkCtx.addInitScript(() => {
    try {
      localStorage.setItem('app_admin_theme', 'dark');
    } catch {
      /* private mode — the shot would then be light and the numbers say so */
    }
  });
  const darkPage = await darkCtx.newPage();
  attach(darkPage);
  const toggleE = await searchFromHome(darkPage, labels, { tripType: 0, departure: addDays(0) });
  await frameStrip(darkPage);
  report.checks.stageE = {
    tripType: toggleE,
    bodyIsDark: await darkPage.evaluate(() => document.body.classList.contains('is-dark')),
    bodyBackground: await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor),
    chips: await readChips(darkPage),
    emptyState: await readEmptyState(darkPage),
    layout: await readLayout(darkPage),
  };
  report.shots.push(await shoot(darkPage, 'desktop-dark-empty-day'));
  await darkCtx.close();

  // ── Stage F · the round-trip asymmetry (owner's canJumpToNextDay decision) ─
  const rtCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const rtPage = await rtCtx.newPage();
  attach(rtPage);
  const toggleF = await searchFromHome(rtPage, labels, { tripType: 1, departure: addDays(0), ret: addDays(1) });
  await frameStrip(rtPage);
  report.checks.stageF = {
    tripType: 'round-trip',
    toggle: toggleF,
    emptyState: await readEmptyState(rtPage),
    chips: await readChips(rtPage),
    layout: await readLayout(rtPage),
  };
  report.shots.push(await shoot(rtPage, 'roundtrip-hint-without-button'));
  await rtCtx.close();

  await browser.close();
  await writeFile(path.join(OUT, `obrs-862-${LABEL}-result.json`), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
