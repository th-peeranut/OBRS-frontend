// Standalone FAB visual-language measurement for OBRS-746 (not part of the
// Playwright suite).
//
// OBRS-746 is NOT a contrast defect -- OBRS-740 measured the FAB's 8 cells and
// all 8 pass. The card exists because the owner looked at the result and said
// the pill still "doesn't belong". That is a claim about VISUAL LANGUAGE, and
// the only way to argue about it honestly is to describe the language in
// numbers: what fill, what text colour, what border, what radius, what
// elevation does every other primary button on the same screen use, and how far
// is the FAB from that set.
//
// Why it has to be re-measured now rather than reasoned about: the FAB's own
// stylesheet justifies keeping the bright cyan fill with the sentence "the
// app's own primary buttons are cyan, so a navy pill read as a different visual
// language on the same screen". OBRS-752 moved $primary-blue #4bc2f7 -> #0772a2.
// If that sentence has expired, the conclusion built on it has expired too, and
// no gate anywhere would say a word (the ratios all still pass).
//
// NO BACKEND: `AuthService.isAuthenticated()` is a pure localStorage check and
// ONE `page.route('**/api/**')` stubs every call, same recipe as
// capture-obrs752.js. Nothing here writes to any environment.
//
// Usage:
//   npx ng serve --port 4460
//   CAPTURE_PHASE=before node e2e/scripts/capture-obrs746.js
//   CAPTURE_PHASE=after  node e2e/scripts/capture-obrs746.js
//   node e2e/scripts/capture-obrs746.js diff
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.argv[2] || 'capture').toLowerCase();
const PHASE = (process.env.CAPTURE_PHASE || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4460';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-746');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// --- fixtures ---------------------------------------------------------------
// Matched against the request PATHNAME (never a Playwright URL glob -- a glob
// swallows the page's own document request, OBRS-747).
const stop = (order, slug, name, lat, lng) => ({
  order,
  slug,
  name,
  address: 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี',
  approxTime: `${String(7 + order).padStart(2, '0')}:00`,
  distanceKmFromOrigin: order * 30,
  offsetMinutesFromOrigin: order * 40,
  latitude: lat,
  longitude: lng,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
});

const PICKUP_STOPS = [
  stop(1, 'nong_chak', 'หนองชาก', 13.2836, 101.0654),
  stop(2, 'ban_bueng', 'บ้านบึง', 13.3121, 101.1149),
];
const DROPOFF_STOPS = [
  stop(3, 'bts_mochit', 'BTS หมอชิต', 13.8025, 100.5537),
  stop(4, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)', 13.8117, 100.5487),
];

const ROUTE_META = {
  slug: 'chonburi_bangkok',
  titleLocalized: { en: 'Chonburi - Bangkok', th: 'ชลบุรี - กรุงเทพฯ', zh: '春武里 - 曼谷' },
  totalDistanceKm: 120,
  durationMinMinutes: 120,
  durationMaxMinutes: 150,
  originProvinceLabel: 'ชลบุรี',
  destinationProvinceLabel: 'กรุงเทพมหานคร',
};

const FIXTURES = [
  [/\/routes\/[^/]+\/pickup-dropoff$/, () => ok({ route: ROUTE_META, pickup: PICKUP_STOPS, dropoff: DROPOFF_STOPS })],
  [/\/stops$/, () => ok([...PICKUP_STOPS, ...DROPOFF_STOPS])],
  [
    /\/routes$/,
    () =>
      ok([
        {
          id: 1,
          slug: 'chonburi_bangkok',
          status: 'active',
          translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' }, en: { label: 'Chonburi - Bangkok' } },
        },
      ]),
  ],
];

// --- what "the same visual language" means, in numbers ----------------------
// Every primary call-to-action the customer can see on these routes. The FAB is
// first so it reads as the subject of the comparison, not as one row among many.
const BUTTONS = [
  '.report-fab',
  '.btn-search',
  '.btn-signup',
  '.login-btn',
  '.select-btn',
  '.btn-confirm',
  '.btn-next',
  '.payment-btn',
];

const PROFILE = (selectors) => {
  const rgba = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const paintedBg = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    if (!layers.length) return [255, 255, 255];
    let bg = layers[layers.length - 1].slice(0, 3);
    for (let i = layers.length - 2; i >= 0; i--) {
      const [tr, tg, tb, ta] = layers[i];
      bg = [tr * ta + bg[0] * (1 - ta), tg * ta + bg[1] * (1 - ta), tb * ta + bg[2] * (1 - ta)];
    }
    return bg;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return Number(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2));
  };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // What the FAB (position:fixed) actually floats over: the page surface, which
  // is what OBRS-740's "vs a white page" numbers meant. For an in-flow button
  // this is its own container, which is the right comparison there too.
  const behind = (el) => (el.parentElement ? paintedBg(el.parentElement) : [255, 255, 255]);

  const rows = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      // A gradient fill returns rgba(0,0,0,0) from backgroundColor -- report the
      // image so the row is not silently read as "transparent" (OBRS-734).
      const bgImage = cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 90);
      const fill = rgba(cs.backgroundColor);
      const fg = rgba(cs.color).slice(0, 3);
      const page = behind(el);
      // A `border: 1px solid transparent` (Bootstrap's default on .btn) has a
      // width but no colour. Reading borderTopColor without its ALPHA reports it
      // as #000000 and then "21:1 against a white page" -- a boundary the user
      // cannot see, scored as the best on the page.
      const borderRgba = rgba(cs.borderTopColor);
      const bw = borderRgba[3] > 0 ? parseFloat(cs.borderTopWidth) || 0 : 0;
      const border = borderRgba.slice(0, 3);
      const surface = fill[3] > 0 ? fill.slice(0, 3) : page;
      rows.push({
        sel,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        fill: fill[3] > 0 ? hex(fill) : null,
        fillAlpha: fill[3],
        bgImage,
        color: hex(fg),
        page: hex(page),
        borderWidth: bw,
        borderColor: bw > 0 ? hex(border) : null,
        borderRadius: cs.borderTopLeftRadius,
        boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 60),
        fontWeight: Number(cs.fontWeight) || 400,
        fontSize: parseFloat(cs.fontSize),
        padding: `${cs.paddingTop} ${cs.paddingRight}`,
        textOnFill: ratio(fg, surface),
        fillVsPage: ratio(surface, page),
        borderVsPage: bw > 0 ? ratio(border, page) : null,
        borderVsFill: bw > 0 ? ratio(border, surface) : null,
      });
    }
  }
  return { rows, bodyIsDark: document.body.classList.contains('is-dark'), href: location.pathname };
};

// --- page setup -------------------------------------------------------------

async function newSeededPage(browser, dark) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'fake-token-for-capture');
      localStorage.setItem('auth_username', 'customer@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['user']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [dark]
  );
  await page.route('**/api/**', (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [re, make] of FIXTURES) {
      const m = re.exec(pathname);
      if (m) return json(route, make(m));
    }
    return json(route, ok(null));
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  return page;
}

const PAGES = [
  { key: 'home', url: '/' },
  { key: 'login', url: '/login' },
];

// --- the options the owner is being asked to choose between -----------------
// Injected at capture time with !important rather than committed as three SCSS
// variants: the component's own rules carry Angular's `[_ngcontent-*]` attribute
// (specificity 0,2,0), so a plain class selector appended to <head> loses to
// them and would photograph the CURRENT design three times over.
//
// Only the option the owner picks gets written into the stylesheet.
const OPTIONS = {
  // A -- adopt the customer primary language outright. Same fill and same white
  // label as .btn-search / .login-btn / .select-btn; the border collapses into
  // the fill (kept at 2px so the pill's geometry does not move) because at
  // 5.33:1 against the page the fill carries the boundary by itself. Dark mode
  // keeps a ring in the dark theme's OWN accent, which is where #4bc2f7 still
  // legitimately lives ($dk-accent) -- and it holds the 8.92:1 boundary
  // OBRS-740 won.
  A: `
    .report-fab { background-color:#0772a2 !important; color:#ffffff !important; border-color:#0772a2 !important; }
    .report-fab:hover { background-color:#065d85 !important; color:#ffffff !important; border-color:#065d85 !important; }
    body.is-dark .report-fab { border-color:#4bc2f7 !important; }
    body.is-dark .report-fab:hover { border-color:#4bc2f7 !important; }
  `,
  // B -- what ships today (OBRS-740). Injected as an explicit no-op so the
  // comparison shots all come out of the same code path.
  B: '',
  // C -- read the FAB as a UTILITY action rather than a primary CTA: outline
  // pill in the brand blue, the same language as .login-by-phone-no-btn. It
  // stops competing with the page's real primary button instead of matching it.
  C: `
    .report-fab { background-color:#ffffff !important; color:#0772a2 !important; border-color:#0772a2 !important; }
    .report-fab:hover { background-color:#dbf3fd !important; color:#065d85 !important; border-color:#065d85 !important; }
    body.is-dark .report-fab { background-color:#1a1d27 !important; color:#4bc2f7 !important; border-color:#4bc2f7 !important; }
    body.is-dark .report-fab:hover { background-color:#22263a !important; color:#4bc2f7 !important; border-color:#4bc2f7 !important; }
  `,
};

async function options(browser) {
  const report = { base: BASE, options: {} };
  for (const key of Object.keys(OPTIONS)) {
    report.options[key] = {};
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      const page = await newSeededPage(browser, dark);
      try {
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        if (OPTIONS[key]) await page.addStyleTag({ content: OPTIONS[key] });
        await page.waitForTimeout(200);

        const rest = await page.evaluate(PROFILE, ['.report-fab', '.btn-search']);
        if (rest.bodyIsDark !== dark) {
          throw new Error(`theme precondition failed: body.is-dark=${rest.bodyIsDark}, expected ${dark}`);
        }
        // The injected sheet must actually have won, or every "option" shot is
        // the current design with a different filename.
        const fab = rest.rows.find((r) => r.sel === '.report-fab');
        if (key !== 'B' && fab.fill === '#4dbeef') {
          throw new Error(`option ${key} did not take effect: fill is still #4dbeef`);
        }

        await page.hover('.report-fab');
        await page.waitForTimeout(300);
        const hover = await page.evaluate(PROFILE, ['.report-fab']);
        await page.locator('.report-fab').screenshot({
          path: path.join(OUT_DIR, `OBRS-746-OPTION-${key}-${mode}-fab-hover.png`),
        });
        await page.mouse.move(0, 0);
        await page.waitForTimeout(300);

        // The whole point is the pill NEXT TO the page's own primary button, so
        // the reference shot is the viewport, not the pill alone.
        await page.screenshot({ path: path.join(OUT_DIR, `OBRS-746-OPTION-${key}-${mode}.png`) });
        await page.locator('.report-fab').screenshot({
          path: path.join(OUT_DIR, `OBRS-746-OPTION-${key}-${mode}-fab.png`),
        });

        report.options[key][mode] = { rest: rest.rows, hover: hover.rows };
        const f = fab;
        const h = hover.rows[0];
        console.log(
          `[${key}] ${mode}  rest fill ${f.fill} text ${f.color} ${f.textOnFill}:1 | boundary ${Math.max(f.borderVsPage ?? 0, f.fillVsPage ?? 0)}` +
            `   hover fill ${h.fill} text ${h.color} ${h.textOnFill}:1 | boundary ${Math.max(h.borderVsPage ?? 0, h.fillVsPage ?? 0)}`
        );
      } catch (e) {
        report.options[key][mode] = { error: e.message };
        console.log(`[${key}] ${mode}: ERROR ${e.message}`);
      }
      await page.close();
    }
  }
  const out = path.join(OUT_DIR, 'options.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${out}`);
}

async function capture(browser) {
  const report = { phase: PHASE, base: BASE, pages: {} };
  for (const p of PAGES) {
    report.pages[p.key] = {};
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      const page = await newSeededPage(browser, dark);
      try {
        await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        const rest = await page.evaluate(PROFILE, BUTTONS);
        if (rest.bodyIsDark !== dark) {
          throw new Error(`theme precondition failed: body.is-dark=${rest.bodyIsDark}, expected ${dark}`);
        }
        const swal = await page.locator('.swal2-popup').count();
        if (swal > 0) throw new Error(`${swal} swal popup(s) over the page -- the shot would read as broken`);

        // Hover is half the AC's 8 cells, and it is where OBRS-741 left a value
        // that turned out to be LIGHTER than the new rest state.
        await page.hover('.report-fab');
        await page.waitForTimeout(400);
        const hover = await page.evaluate(PROFILE, ['.report-fab']);
        const shotHover = path.join(OUT_DIR, `OBRS-746-${PHASE.toUpperCase()}-${p.key}-${mode}-fab-hover.png`);
        await page.locator('.report-fab').screenshot({ path: shotHover });

        // Move the pointer off the pill before the reference shots, or every
        // screenshot below silently photographs the HOVER state.
        await page.mouse.move(0, 0);
        await page.waitForTimeout(400);

        const shot = path.join(OUT_DIR, `OBRS-746-${PHASE.toUpperCase()}-${p.key}-${mode}.png`);
        await page.screenshot({ path: shot });
        const shotFab = path.join(OUT_DIR, `OBRS-746-${PHASE.toUpperCase()}-${p.key}-${mode}-fab.png`);
        await page.locator('.report-fab').screenshot({ path: shotFab });

        report.pages[p.key][mode] = {
          landed: rest.href,
          rest: rest.rows,
          hover: hover.rows,
          shots: [path.basename(shot), path.basename(shotFab), path.basename(shotHover)],
        };
        console.log(`\n[${PHASE}] ${p.key} ${mode}  (landed ${rest.href})`);
        for (const r of rest.rows) {
          console.log(
            `  ${r.sel.padEnd(14)} fill ${String(r.fill).padEnd(8)} text ${r.color} on-fill ${String(r.textOnFill).padStart(5)}:1` +
              `  border ${r.borderWidth}px ${r.borderColor || '-'} (vs page ${r.borderVsPage ?? '-'})` +
              `  fill-vs-page ${r.fillVsPage}  radius ${r.borderRadius}  shadow ${r.boxShadow ? 'yes' : 'no'}` +
              (r.bgImage ? `  GRADIENT ${r.bgImage}` : '')
          );
        }
        for (const r of hover.rows) {
          console.log(
            `  ${'.report-fab:hover'.padEnd(14)} fill ${String(r.fill).padEnd(8)} text ${r.color} on-fill ${String(r.textOnFill).padStart(5)}:1` +
              `  border ${r.borderWidth}px ${r.borderColor || '-'} (vs page ${r.borderVsPage ?? '-'})  fill-vs-page ${r.fillVsPage}`
          );
        }
      } catch (e) {
        report.pages[p.key][mode] = { error: e.message };
        console.log(`[${PHASE}] ${p.key} ${mode}: ERROR ${e.message}`);
      }
      await page.close();
    }
  }
  const out = path.join(OUT_DIR, `profile-${PHASE}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${out}`);
}

// The AC asked for the 8 cells to be re-measured and to "never come out lower".
//
// Taken literally that rule forbids EVERY design including the one that answers
// the card, because 740's arrangement (bright fill, dark label) reaches higher
// ratios than white-on-deep-blue can by construction -- so "belongs with the
// other buttons" and "not one hundredth lower" cannot both hold. Put to the
// owner with the numbers on 2026-07-27; they ruled it reads as **must not drop
// below AA**. That ruling is encoded here rather than written down somewhere,
// so the next reader gets the same verdict this run got.
//
// A cell that drops while staying above its floor is still PRINTED -- the
// ruling relaxes what fails the run, not what the report is allowed to hide.
function diff() {
  const load = (p) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `profile-${p}.json`), 'utf8'));
  const before = load('before');
  const after = load('after');
  // Boundary is carried by whichever of border/fill is visible against the page:
  // a border collapsed into the fill hands the job to the fill, and a fill that
  // sinks into the page hands it back to the border. Scoring them as two
  // independent cells reports a handover as a failure.
  const boundary = (r) => Math.max(r.borderVsPage ?? 0, r.fillVsPage ?? 0);
  const CELLS = [
    ['text on fill', 4.5, (r) => r.textOnFill],
    ['boundary    ', 3.0, boundary],
  ];
  let belowFloor = 0;
  let lower = 0;
  let cells = 0;
  for (const pageKey of Object.keys(after.pages)) {
    for (const mode of ['light', 'dark']) {
      const b = before.pages[pageKey]?.[mode];
      const a = after.pages[pageKey]?.[mode];
      if (!b || !a || b.error || a.error) {
        console.log(`[${pageKey} ${mode}] SKIPPED (${b?.error || a?.error || 'missing'})`);
        continue;
      }
      for (const state of ['rest ', 'hover']) {
        const bf = (b[state.trim()] || []).find((r) => r.sel === '.report-fab');
        const af = (a[state.trim()] || []).find((r) => r.sel === '.report-fab');
        if (!bf || !af) {
          console.log(`[${pageKey} ${mode} ${state}] SKIPPED (no .report-fab row)`);
          continue;
        }
        for (const [label, floor, read] of CELLS) {
          cells++;
          const was = read(bf);
          const now = read(af);
          const fails = now < floor;
          const dropped = now < was - 0.005;
          if (fails) belowFloor++;
          else if (dropped) lower++;
          const verdict = fails ? 'BELOW FLOOR' : dropped ? 'lower, ok  ' : 'ok         ';
          console.log(
            `  ${verdict} ${pageKey} ${mode} ${state} ${label}: ${was} -> ${now}  (floor ${floor})`
          );
        }
      }
    }
  }
  console.log(
    `\n=== ${cells} cells compared, ${belowFloor} below floor, ${lower} lower but still above floor ===`
  );
  if (belowFloor > 0) process.exitCode = 1;
}

async function main() {
  if (MODE === 'diff') return diff();
  const browser = await chromium.launch();
  try {
    if (MODE === 'options') await options(browser);
    else await capture(browser);
  } finally {
    await browser.close();
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
