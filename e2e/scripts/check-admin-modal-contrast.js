// Admin-modal contrast inventory, both themes (OBRS-734).
//
//   node e2e/scripts/check-admin-modal-contrast.js <port> <LABEL> [outDir]
//
// The static gate in scripts/check-admin-theme-tokens.mjs can only see that a rule uses a
// literal; it cannot see what the rule RENDERS AS. This is the other half: it opens each
// admin modal in light and dark and computes the real WCAG ratio of every text run from the
// composited colours. It is how OBRS-734 was found to be 1.03:1 and proven fixed at 5.25:1.
// OBRS-821 added the three SweetAlert2 shapes (confirm / toast / permission-denied), which
// no static gate can reach at all: Swal themes itself from JS (`data-swal2-theme`) rather
// than through .admin-shell.is-dark.
// Run it against a dev server (`ng serve --configuration sit --port N`); it is not part of
// `npm test` because it needs a browser and a live backend.
// Prints one line per text run so BEFORE and AFTER diff line by line:
// AC-1 wants every dark-mode run >= 4.5, AC-2 wants the light column unchanged.
const { chromium } = require('@playwright/test');
const path = require('path');

const PORT = process.argv[2] || 4481;
const LABEL = (process.argv[3] || 'BEFORE').toUpperCase();
const OUT = process.argv[4];
const BASE = `http://localhost:${PORT}`;
const EDIT_BTN = 'button.admin-icon-btn:not(.danger):has(span.material-symbols-outlined:text-is("edit_square"))';
const THEME = '.admin-icon-btn:has(span.material-symbols-outlined:text-is("dark_mode")), .admin-icon-btn:has(span.material-symbols-outlined:text-is("light_mode"))';
// The same toggle outside the admin shell - public navbar and every auth page (OBRS-821).
const THEME_PUBLIC = 'button.theme-toggle-btn';
const ADMIN = 'admin@system.local';

// Defaults for a SweetAlert2 popup, which the admin-modal ones do not fit (OBRS-821): its
// text lives in h2.swal2-title / .swal2-html-container / .swal2-actions button, none of which
// the default element list matches, and its longest line is a sentence, not a field label.
// `min` stays per-case because the three shapes carry different numbers of visible runs.
const SWAL = { sel: 'h2.swal2-title, .swal2-html-container, .swal2-actions button', maxLen: 200 };

const CASES = [
  { name: 'user-form-modal', url: '/admin/users', modal: '.user-editor-modal' },
  { name: 'role-form-modal', url: '/admin/roles', modal: '.role-form-modal' },
  // the schedules list needs filters before rows appear, so open the CREATE modal instead -
  // it is the same .schedule-form-modal panel, which is what this card changed.
  // .schedule-form-modal only exists on the 'schedule' tab, and its list needs filters before
  // any row appears - so switch tab, then open the CREATE modal. Same panel, which is what
  // this card changed.
  { name: 'schedule-form-modal', url: '/admin/schedules', modal: '.schedule-form-modal',
    pre: 'button.schedule-tab:has(span.material-symbols-outlined:text-is("calendar_month"))',
    open: 'button.admin-btn-primary:has(span.material-symbols-outlined:text-is("add_circle"))' },

  // OBRS-821: the three Swal shapes OBRS-520 left confirmed only at ARGUMENT level (the
  // `theme` value handed to Swal, which is not a colour anyone sees). Each one is also a
  // genuine mid-flight switch - the loop lands on the page, flips the theme, and only then
  // raises the box - which is the case that matters, because Swal reads the theme when it is
  // FIRED, not when the page loaded.
  //
  // The unsaved-settings prompt is the one /admin/settings confirm that needs no particular
  // data: dirty a field, leave the tab. `close` MUST stay .swal2-cancel - its confirm button
  // means "discard", and on the save/delete confirms it would write.
  { name: 'swal-confirm', url: '/admin/settings/operations', modal: '.swal2-popup',
    fill: { sel: 'input#seatReservationMinutes', value: '16' },
    open: 'a.nav-link[href="/admin/settings/jump-seat"]',
    close: '.swal2-cancel', min: 4, ...SWAL },

  // The critical-row veto is refused client-side and never reaches the API, so this toast can
  // be raised as often as the gate likes without writing anything. Hovering it is how the
  // timer is paused - `didOpen` installs that handler in production, so the gate is holding
  // the toast the way a reader does, not freezing it with test-only machinery.
  { name: 'swal-toast', url: '/account/notification-preferences',
    modal: '.swal2-container.swal2-top-end .swal2-popup.swal2-toast', themeBtn: THEME_PUBLIC,
    pre: '.npref-row--critical p-toggleswitch >> nth=0',
    open: '.npref-row--critical p-toggleswitch >> nth=1',
    hover: true, min: 1, ...SWAL },

  // The AuthGuard bounce. Only a non-admin can raise it, so this case is the one that logs in
  // as somebody else; the theme is flipped on the public shell it lands on, then the admin URL
  // is what fires the box.
  { name: 'swal-permission-denied', url: '/', as: 'customer@system.local',
    modal: '.swal-guard-backdrop .swal2-popup', themeBtn: THEME_PUBLIC,
    goto: '/admin/dashboard', close: '.swal2-confirm', min: 2, ...SWAL },
];

const PROBE = `(root, opts) => {
  const SEL = (opts && opts.sel) || 'label, small, h4, h5, p, span, button, input';
  const MAXLEN = (opts && opts.maxLen) || 40;
  const parse = (c) => (c.match(/[\\d.]+/g) || [0,0,0]).slice(0,4).map(Number);
  const over = (fg, bg) => { const a = fg[3] === undefined ? 1 : fg[3]; return [0,1,2].map(i => a*fg[i] + (1-a)*bg[i]); };
  const bgOf = (el) => { let n = el, chain = []; while (n) { chain.push(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
    let acc = [255,255,255]; for (let i = chain.length-1; i>=0; i--) acc = over(chain[i], acc); return acc; };
  const lum = (c) => { const f = c.map(v => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a,b) => { const [l1,l2] = [lum(a),lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };
  const seen = new Set(); const out = [];
  for (const el of root.querySelectorAll(SEL)) {
    // A run the popup keeps in the DOM but never shows has no colour a reader can fail to
    // read, and reporting a ratio for it is worse than skipping it: sweetalert2 renders the
    // confirm/deny/cancel/close slots on EVERY popup, so a toast that shows one line would
    // otherwise come back with five measured runs and look thoroughly checked.
    if (el.getClientRects().length === 0) continue;
    let t = el.tagName === 'INPUT' ? (el.value || '') : (el.innerText || '');
    t = t.trim();
    if (!t || t.length > MAXLEN) continue;
    if (el.tagName !== 'INPUT' && el.querySelector('input, select, label, small, span, button')) continue;
    const key = el.tagName + '|' + t;
    if (seen.has(key)) continue; seen.add(key);
    const s = getComputedStyle(el);
    // A gradient/image fill is invisible to backgroundColor, so bgOf() would report the
    // surface BEHIND the element and invent a failure. Flag it instead of guessing.
    // Boundary is the modal root: .admin-shell itself carries a decorative radial-gradient
    // in BOTH themes, so walking past the modal flags every single run and the measurement
    // silently becomes 'n/a' everywhere - a probe that measures nothing reads as a pass.
    let grad = false;
    for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
      const bi = getComputedStyle(n).backgroundImage;
      if (bi && bi !== 'none' && /gradient/.test(bi)) { grad = true; break; }
    }
    if (grad) { out.push({ tag: el.tagName.toLowerCase(), t: t.slice(0,26), fg: 'gradient', bg: 'gradient', r: null }); continue; }
    const bg = bgOf(el);
    const fg = over(parse(s.color), bg);
    out.push({ tag: el.tagName.toLowerCase(), t: t.slice(0,26),
      fg: fg.map(Math.round).join(','), bg: bg.map(Math.round).join(','),
      r: Math.round(ratio(fg, bg) * 100) / 100 });
  }
  // The popup's OWN composited surface, reported alongside the runs so the two themes can be
  // compared. Per-run contrast cannot see the OBRS-520 defect at all: a light card left
  // standing on the dark shell reads perfectly well on its own (dark text on white is 7.57:1),
  // and it is the surface, not the text, that was wrong.
  const rootBg = bgOf(root);
  return { rows: out, surface: { bg: rootBg.map(Math.round).join(','), l: Math.round(lum(rootBg) * 10000) / 10000 } };
}`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1536, height: 900 } });

  const login = async (email) => {
    await p.context().clearCookies();
    await p.goto(`${BASE}/login`);
    await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await p.goto(`${BASE}/login`);
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill('P@ssw0rd');
    await p.locator('button[type="submit"]').click();
    await p.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
    // A guard bounce during the post-login redirect leaves a popup sitting over the page,
    // and its backdrop swallows the next click instead of failing it.
    await p.locator('.swal2-confirm').first().click({ timeout: 3000 }).catch(() => {});
  };
  let currentUser = null;

  let worstDark = Infinity;
  let failCount = 0;
  const surfaces = {};
  for (const theme of ['light', 'dark']) {
    for (const c of CASES) {
      const as = c.as || ADMIN;
      if (as !== currentUser) { await login(as); currentUser = as; }
      await p.goto(`${BASE}${c.url}`);
      // `goto` cases are raised by a navigation, so there is no opener to wait for or click.
      const opener = c.goto ? null : (c.open || EDIT_BTN);
      if (c.fill) { await p.locator(c.fill.sel).first().fill(c.fill.value, { timeout: 30000 }); await p.waitForTimeout(500); }
      if (c.pre) { await p.locator(c.pre).first().click({ timeout: 30000 }); await p.waitForTimeout(2500); }
      if (opener) { await p.locator(opener).first().waitFor({ timeout: 30000 }); }
      await p.waitForTimeout(1500);
      // body.is-dark is ThemeService's own source of truth and covers the pages outside the
      // admin shell that the Swal cases need; .admin-shell.is-dark is set from the same value.
      const isDark = await p.evaluate(() => document.body.classList.contains('is-dark'));
      if ((theme === 'dark') !== isDark) { await p.locator(c.themeBtn || THEME).first().click(); await p.waitForTimeout(1200); }
      if (c.goto) { await p.goto(`${BASE}${c.goto}`); } else { await p.locator(opener).first().click(); }
      const root = p.locator(c.modal).first();
      await root.waitFor({ state: 'visible', timeout: 20000 });
      // The toast fades after 3s; hovering is the pause production itself installs in didOpen.
      if (c.hover) { await root.hover(); }
      await p.waitForTimeout(1800);
      const { rows, surface } = await root.evaluate(eval(`(${PROBE})`), { sel: c.sel, maxLen: c.maxLen });
      const measured = rows.filter((x) => x.r !== null).length;
      const min = c.min || 5;
      if (measured < min) throw new Error(`${c.name}: only ${measured} of ${rows.length} runs measurable, expected >= ${min} - the probe is broken, do not read this as a pass`);
      if (rows.length === 0) throw new Error(`${c.name}: 0 text runs measured - the probe found nothing, do not read this as a pass`);
      (surfaces[c.name] = surfaces[c.name] || {})[theme] = surface;
      console.log(`\n### ${LABEL} ${theme} ${c.name} (${rows.length} text runs, surface bg=${surface.bg} L=${surface.l})`);
      for (const x of rows) {
        if (x.r === null) { console.log(`     n/a  gradient fill - measure by pixel, not by computed style  ${x.tag.padEnd(6)} "${x.t}"`); continue; }
        const flag = x.r < 4.5 ? (x.r < 3 ? ' <<< FAIL' : ' <<< large-only') : '';
        console.log(`  ${String(x.r).padStart(6)}  fg=${x.fg.padEnd(14)} bg=${x.bg.padEnd(14)} ${x.tag.padEnd(6)} "${x.t}"${flag}`);
        if (theme === 'dark') { worstDark = Math.min(worstDark, x.r); if (x.r < 4.5) failCount++; }
      }
      if (OUT) await p.screenshot({ path: path.join(OUT, `734-${LABEL}-${theme}-${c.name}.png`) });
      await p.locator(c.close || '.user-editor-close, .role-editor-close, .admin-modal-backdrop button:has(span:text-is("close"))').first().click().catch(() => {});
      await p.waitForTimeout(800);
    }
  }
  // A box that hands the dark shell the same surface it hands the light one has not been
  // themed, whatever `theme` value it was passed. Stated as a comparison between the two runs
  // rather than a luminance threshold, so there is no invented number to argue with.
  const unthemed = Object.entries(surfaces).filter(([, s]) => !(s.dark.l < s.light.l));
  for (const [name, s] of unthemed) {
    console.log(`  UNTHEMED SURFACE  ${name}: light bg=${s.light.bg} L=${s.light.l} / dark bg=${s.dark.bg} L=${s.dark.l}`);
  }
  console.log(`\n===== ${LABEL}: dark-mode worst ratio = ${worstDark}, runs below AA = ${failCount}, unthemed surfaces = ${unthemed.length} =====`);
  await b.close();
  if (failCount > 0 || unthemed.length > 0) process.exit(1);
})().catch((e) => { console.error('SCRIPT ERROR:', e.message); process.exit(2); });
