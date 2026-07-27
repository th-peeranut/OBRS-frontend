// Standalone tint-census capture for OBRS-763 (not part of the Playwright suite).
//
// THE QUESTION THIS ANSWERS, AND WHY IT NEEDS PIXELS.
//
// OBRS-752 moved the customer brand $primary-blue #4bc2f7 -> #0772a2 and fixed
// every FILL. It did not move the TINT layer built from the old value, because
// that layer is spelled in decimal -- `rgba(77, 190, 239, 0.12)` IS #4dbeef, and
// `rgba(75, 194, 247, 0.12)` IS #4bc2f7 -- so grepping the hex finds nothing and
// the source contrast gate cannot composite an alpha, filing them under
// `unresolved` instead. Twenty such sites survive in customer/shared chrome.
//
// They are NOT known to be defects. Every one is a low-alpha wash on a white
// surface, so contrast is comfortable either way; what is in question is VISUAL
// LANGUAGE -- whether a pale CYAN hover still belongs next to buttons that are
// now deep blue. That is the same class of question as OBRS-746, it was decided
// there by looking at a screenshot, and it is decided here the same way. This
// script does not change anything; it renders both answers and measures them.
//
// NO BACKEND: `AuthService.isAuthenticated()` is a pure localStorage check and
// ONE `page.route('**/api/**')` stubs every call (same recipe as
// capture-obrs746.js). Nothing here writes to any environment.
//
// Usage:
//   npx ng serve --port 4470
//   node e2e/scripts/capture-obrs763.js            # both variants, both themes
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4470';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-763');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The stop list and the map tabs only render once the route fixture answers, and
// the first run of this script shipped only `/routes` -- so six of seven targets
// reported "NOT ON THIS PAGE" and the run would have read as "nothing to see"
// if it had not counted its own misses. Same fixture set as capture-obrs746.js.
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

// --- the census -------------------------------------------------------------
// Every customer/shared site that still paints a pre-752 cyan tint, named by the
// file and line it lives on so a reader can go straight to it. `open` runs first
// when the element only exists after a click (the language menu).
const TARGETS = [
  {
    key: 'lang-trigger',
    sel: '.navbar-lang-trigger',
    src: 'lang-switcher.component.scss:36',
    tint: 'rgba(77,190,239,.08) + #005f7e',
  },
  {
    key: 'lang-option',
    sel: '.navbar-lang-item',
    src: 'lang-switcher.component.scss:100',
    tint: 'rgba(77,190,239,.12) + #005f7e',
    open: '.navbar-lang-trigger',
    shot: '.navbar-lang-menu',
  },
  {
    key: 'theme-toggle',
    sel: '.theme-toggle-btn',
    src: 'theme-toggle.component.scss:32',
    tint: 'rgba(77,190,239,.08) + #005f7e',
  },
  {
    key: 'profile-item',
    sel: '.navbar-profile-item',
    src: 'navbar.component.scss:129',
    tint: 'rgba(77,190,239,.12) + #005f7e',
    open: '.navbar-profile',
    shot: '.navbar-profile-menu',
  },
  {
    key: 'stop-row',
    sel: '.stop-row',
    src: 'route-stop-list.component.scss:27',
    tint: 'rgba(75,194,247,.08) hover',
  },
  {
    key: 'tab-hover',
    sel: '.p-tabview-nav li:not(.p-highlight) .p-tabview-nav-link',
    src: 'route-map-home.component.scss:162',
    tint: 'rgba(75,194,247,.08) hover',
  },
  // NOT a hover: a static pill. Included because the card framed the census as a
  // hover/tint layer and this is the tint layer's other half -- a stale brand
  // hue that is on screen all the time, not only under the cursor.
  {
    key: 'badge-info',
    sel: '.p-badge.p-badge-info',
    src: 'route-map-home.component.scss:193 (static)',
    tint: 'rgba(75,194,247,.22)',
    noHover: true,
  },
];

// --- the two answers --------------------------------------------------------
// Injected with !important rather than committed as a second stylesheet: the
// component rules carry Angular's `[_ngcontent-*]` attribute selector
// (specificity 0,2,0), so a plain class appended to <head> loses to them and
// every "option" shot would silently be the current design under a new filename.
//
// RETINT keeps the alpha and the geometry identical and changes ONLY the hue,
// from the pre-752 cyan to the shipped brand. Anything else would make the two
// shots differ in more than the one variable under test.
// LIGHT MODE ONLY -- `body:not(.is-dark)` on every rule, and that qualifier is
// not tidiness, it is the first thing the measurement caught. The draft without
// it forced #065d85 text in dark mode too and dropped the theme-toggle from
// 6.59:1 to 2.18:1, well under AA. Dark mode already has its own overrides
// pointing at $dk-accent (the one place the old cyan legitimately lives), so the
// question this capture asks only ever applied to the light theme.
const RETINT = `
  body:not(.is-dark) .navbar-profile-item:hover,
  body:not(.is-dark) .navbar-hamburger:hover,
  body:not(.is-dark) .navbar-mobile-link:hover { background: rgba(7,114,162,0.12) !important; color:#065d85 !important; }
  body:not(.is-dark) .navbar-lang-trigger:hover { background: rgba(7,114,162,0.08) !important; color:#065d85 !important; }
  body:not(.is-dark) .navbar-lang-item:hover { background: rgba(7,114,162,0.12) !important; color:#065d85 !important; }
  body:not(.is-dark) .navbar-lang-item.active { background: rgba(7,114,162,0.16) !important; color:#065d85 !important; }
  body:not(.is-dark) .theme-toggle-btn:hover { background: rgba(7,114,162,0.08) !important; color:#065d85 !important; }
  body:not(.is-dark) .stop-row:hover { background-color: rgba(7,114,162,0.08) !important; }
  body:not(.is-dark) .p-tabview-nav li:not(.p-highlight) .p-tabview-nav-link:hover { background: rgba(7,114,162,0.08) !important; }
  body:not(.is-dark) .p-badge.p-badge-info { background: rgba(7,114,162,0.22) !important; }
`;

const VARIANTS = { CURRENT: '', RETINT };

// Read the composited colours the browser actually paints. A tint is translucent
// by definition, so the DECLARED value is not the rendered one -- the whole
// reason the source gate had to file these under `unresolved`.
const PROBE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const rgba = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  // Composite the element's own background over its painted ancestors, which is
  // what a translucent wash actually looks like and what a source reader cannot
  // know. Walking to the first OPAQUE ancestor is the only honest base.
  const stack = [];
  for (let n = el; n; n = n.parentElement) {
    const c = rgba(getComputedStyle(n).backgroundColor);
    if (c[3] > 0) stack.push(c);
    if (c[3] === 1) break;
  }
  let out = [255, 255, 255];
  for (let i = stack.length - 1; i >= 0; i--) {
    const [r, g, b, a] = stack[i];
    out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
  }
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lum = (c) => {
    const ch = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const fg = rgba(cs.color).slice(0, 3);
  const cr = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  // Does this element carry text of its OWN, or is it a container whose `color`
  // is merely inherited and painted on nothing?
  //
  // Not a detail. The first run reported `.stop-row` at 1.77:1 in dark mode and
  // it read exactly like a below-AA defect. It is not: the row is a flex
  // container, its #4b5563 is a light-mode value nothing renders, and every
  // child that does hold text -- .stop-name 11.11:1, .stop-address and
  // .stop-time 5.29:1, the order badge 5.33:1 -- passes in both states. Same
  // trap the source gate documents for a decorative dot, hit from the DOM side.
  const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  return {
    painted: hex(out),
    text: hex(fg),
    textOnPainted: own ? cr(fg, out) : null,
    carriesText: own,
    declared: cs.backgroundColor,
  };
};

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

(async () => {
  const browser = await chromium.launch();
  const report = { base: BASE, variants: {} };
  let missing = 0;

  for (const variant of Object.keys(VARIANTS)) {
    report.variants[variant] = {};
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      const rows = [];
      const page = await newSeededPage(browser, dark);
      try {
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        if (VARIANTS[variant]) await page.addStyleTag({ content: VARIANTS[variant] });

        const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
        if (isDark !== dark) throw new Error(`theme precondition failed: body.is-dark=${isDark}, expected ${dark}`);

        for (const t of TARGETS) {
          try {
            if (t.open) {
              await page.click(t.open);
              await page.waitForTimeout(300);
            }
            const loc = page.locator(t.sel).first();
            await loc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
            if (!(await loc.count()) || !(await loc.isVisible())) {
              rows.push({ ...t, status: 'NOT ON THIS PAGE' });
              missing++;
              continue;
            }
            await loc.scrollIntoViewIfNeeded();
            if (!t.noHover) {
              await loc.hover();
              await page.waitForTimeout(250);
            }
            const probe = await page.evaluate(PROBE, t.sel);
            // Shoot the surrounding menu when the target is one row of it: a
            // 40px-tall crop of a tint is unreadable as a design comparison.
            await page.locator(t.shot || t.sel).first().screenshot({
              path: path.join(OUT_DIR, `OBRS-763-${variant}-${mode}-${t.key}.png`),
            });
            rows.push({ ...t, status: 'ok', ...probe });
          } catch (e) {
            rows.push({ ...t, status: `ERROR ${e.message}` });
            missing++;
          }
          // Every reference shot after this must not photograph a stale hover.
          await page.mouse.move(0, 0);
          await page.waitForTimeout(150);
          await page.keyboard.press('Escape').catch(() => {});
        }

        await page.screenshot({ path: path.join(OUT_DIR, `OBRS-763-${variant}-${mode}-navbar.png`), clip: { x: 0, y: 0, width: 1440, height: 220 } });
      } catch (e) {
        rows.push({ key: '(page)', status: `ERROR ${e.message}` });
        missing++;
      }
      report.variants[variant][mode] = rows;
      await page.close();

      for (const r of rows) {
        console.log(
          `[${variant}] ${mode.padEnd(5)} ${String(r.key).padEnd(14)} ${
            r.status === 'ok'
              ? `painted ${r.painted}  ` +
                (r.carriesText ? `text ${r.text} ${r.textOnPainted}:1` : '(container -- no text of its own, not scored)')
              : r.status
          }`
        );
      }
    }
  }

  await browser.close();
  const out = path.join(OUT_DIR, 'census.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${out}`);
  // A silently-skipped target reads exactly like a target that passed.
  if (missing) console.log(`WARNING: ${missing} target/theme combination(s) were NOT measured -- see the rows above`);
})();
