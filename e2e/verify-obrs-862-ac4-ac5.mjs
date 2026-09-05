/**
 * OBRS-862 AC#4 and AC#5 — the two the capture script does not cover.
 *
 * AC#4 "เที่ยวไป-กลับ … อย่าปล่อยให้กดแล้วขากลับเพี้ยนเงียบ ๆ": the strip drives
 * the OUTBOUND leg only, and the return leg must move by the rule that already
 * owns it (`carryReturnDate`, OBRS-1185) rather than be left in a pair the
 * backend would reject. Two taps are measured, because the rule has two arms:
 *
 *   arm 1 — tap a day BEFORE the current return date  → return must NOT move
 *   arm 2 — tap a day AFTER  the current return date  → return must be carried
 *            to `defaultReturnDate` (departure + 1, capped at the policy cap)
 *
 * The second arm is the one AC#4 is actually about: leaving it alone would put
 * `departure > return` in the form, silently.
 *
 * AC#5 "i18n ครบ th/en/zh (ชื่อวันย่อ)": the chip labels come from `Intl` via
 * `formatDayChip`, so the assertion is that the SAME date renders three
 * different weekday strings under the three languages — not that a key exists.
 *
 *   node e2e/verify-obrs-862-ac4-ac5.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const API = process.env.OBRS_API_URL ?? 'http://localhost:8080';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-862');

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

/**
 * The stop labels the two forms RENDER, per language.
 *
 * The roster carries `th` and `en` only, and the app folds `zh` onto the
 * English station label (there is no zh copy for stop names) — so a zh run must
 * filter the dropdown by the English string, exactly as a zh customer sees it.
 * Filtering by the Thai label under `en`/`zh` finds nothing and reads as "the
 * stop is missing".
 */
async function stopLabelsFor(lang) {
  const stops = (await (await fetch(`${API}/api/stops`)).json()).data ?? [];
  const label = (slug) => {
    const t = stops.find((s) => s.slug === slug)?.translations ?? {};
    const picked = (t[lang]?.label ?? t.en?.label ?? t.th?.label ?? '').trim();
    if (!picked) throw new Error(`stop '${slug}' has no label for '${lang}'`);
    return picked;
  };
  return { from: label(FROM_SLUG), to: label(TO_SLUG) };
}

async function safeClick(locator) {
  try {
    await locator.click({ timeout: 6000 });
  } catch {
    await locator.dispatchEvent('click');
  }
}

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

/** See `capture-obrs-862-date-strip.mjs` — the home hero image swallows a real
 *  click on this toggle (a pre-existing defect, reported separately). */
async function selectTripType(page, index) {
  await page.locator('.trip-type-toggle__btn').nth(index).dispatchEvent('click');
  await page.waitForTimeout(700);
}

async function searchFromHome(page, labels, { tripType, departure, ret }) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-search').waitFor({ timeout: 60000 });
  await selectTripType(page, tripType);

  const groups = page.locator('.station-group app-dropdown-group-obrs');
  await safeClick(groups.first().locator('.dropdown-btn'));
  await groups.first().locator('.dropdown-menu.show .dropdown-option').first().waitFor({ timeout: 60000 });
  await safeClick(groups.first().locator('.dropdown-menu.show .dropdown-option').filter({ hasText: labels.from }).first());
  await page.waitForTimeout(1200);
  await safeClick(groups.nth(1).locator('.dropdown-btn'));
  await page.waitForTimeout(600);
  await safeClick(groups.nth(1).locator('.dropdown-menu.show .dropdown-option').filter({ hasText: labels.to }).first());
  await page.waitForTimeout(400);

  await pickDate(page, 'home-departure-date', departure);
  const toggle = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.trip-type-toggle__btn')).map((b) => ({
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      pressed: b.getAttribute('aria-pressed'),
    }))
  );
  if ((tripType === 1) !== (toggle[1]?.pressed === 'true')) {
    throw new Error(`trip type did not take: ${JSON.stringify(toggle)}`);
  }
  if (tripType === 1 && ret) await pickDate(page, 'home-return-date', ret);

  await safeClick(page.locator('.btn-search'));
  await page.waitForURL((u) => u.pathname.includes('/schedule-booking'), { timeout: 60000 });
  await page.waitForTimeout(6000);
  return toggle;
}

const readDates = (page) =>
  page.evaluate(() => ({
    departure: document.querySelector('#filter-departure-date')?.value ?? null,
    return: document.querySelector('#filter-return-date')?.value ?? null,
    returnFieldPresent: !!document.querySelector('#filter-return-date'),
    selectedChip:
      document.querySelector('[data-testid="day-strip-chip"].is-selected')?.getAttribute('data-date') ?? null,
    rows: document.querySelectorAll('.schedule-item').length,
  }));

async function main() {
  await mkdir(OUT, { recursive: true });
  const labels = await stopLabelsFor('th');
  const browser = await chromium.launch();
  const report = { base: BASE, api: API, today: iso(new Date()) };

  // ── AC#4 ──────────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const searches = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/schedules/search')) {
      let p = null;
      try {
        p = JSON.parse(r.postData() ?? 'null');
      } catch {
        p = r.postData();
      }
      searches.push(p);
    }
  });

  // Depart today, return today+2. Both arms of the rule are then reachable from
  // one search: today+1 is before the return, today+5 is after it.
  await searchFromHome(page, labels, { tripType: 1, departure: addDays(0), ret: addDays(2) });
  const initial = await readDates(page);

  // arm 1 — a day BEFORE the return date: the return must not move.
  const before = { day: iso(addDays(1)), n: searches.length, dates: initial };
  await page.locator(`[data-testid="day-strip-chip"][data-date="${before.day}"]`).click();
  await page.waitForTimeout(7000);
  const afterArm1 = await readDates(page);

  // arm 2 — a day AFTER the return date: the return must be carried forward.
  const arm2Day = iso(addDays(5));
  const n2 = searches.length;
  await page.locator(`[data-testid="day-strip-chip"][data-date="${arm2Day}"]`).click();
  await page.waitForTimeout(7000);
  const afterArm2 = await readDates(page);

  report.ac4 = {
    initial,
    arm1: {
      tappedDay: before.day,
      note: 'a day BEFORE the current return date — the return must stay put',
      searchPostsFired: n2 - before.n,
      dates: afterArm1,
      returnMoved: initial.return !== afterArm1.return,
    },
    arm2: {
      tappedDay: arm2Day,
      note: 'a day AFTER the current return date — the return must be carried to departure+1',
      expectedReturn: iso(addDays(6)),
      searchPostsFired: searches.length - n2,
      dates: afterArm2,
      returnMoved: afterArm1.return !== afterArm2.return,
    },
    lastSearchPayload: searches[searches.length - 1] ?? null,
    allSearchPayloads: searches,
  };
  await page.screenshot({ path: path.join(OUT, 'OBRS-862-AFTER-roundtrip-return-carried.png') });
  await ctx.close();

  // ── AC#5 ──────────────────────────────────────────────────────────────────
  report.ac5 = {};
  for (const lang of ['th', 'en', 'zh']) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await c.addInitScript((l) => {
      try {
        localStorage.setItem('app_language', l);
      } catch {
        /* the read below then reports whatever actually rendered */
      }
    }, lang);
    const p = await c.newPage();
    // zh folds onto the English station label — see `stopLabelsFor`.
    await searchFromHome(p, await stopLabelsFor(lang === 'zh' ? 'en' : lang), {
      tripType: 0,
      departure: addDays(0),
    });
    report.ac5[lang] = await p.evaluate(() => ({
      htmlLang: document.documentElement.lang,
      stripAriaLabel: document.querySelector('[data-testid="day-strip"]')?.getAttribute('aria-label') ?? null,
      chips: Array.from(document.querySelectorAll('[data-testid="day-strip-chip"]')).map((el) => ({
        iso: el.getAttribute('data-date'),
        weekday: el.querySelector('.day-strip__weekday')?.textContent?.trim() ?? null,
        date: el.querySelector('.day-strip__date')?.textContent?.trim() ?? null,
      })),
      hint: document.querySelector('.sold-out-today__hint')?.innerText?.trim() ?? null,
    }));
    if (lang !== 'th') {
      await p.screenshot({ path: path.join(OUT, `OBRS-862-AFTER-i18n-${lang}.png`) });
    }
    await c.close();
  }

  await browser.close();
  await writeFile(path.join(OUT, 'obrs-862-ac4-ac5-result.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
