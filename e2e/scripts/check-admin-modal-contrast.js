// Admin-modal contrast inventory, both themes (OBRS-734).
//
//   node e2e/scripts/check-admin-modal-contrast.js <port> <LABEL> [outDir]
//
// The static gate in scripts/check-admin-theme-tokens.mjs can only see that a rule uses a
// literal; it cannot see what the rule RENDERS AS. This is the other half: it opens each
// admin modal in light and dark and computes the real WCAG ratio of every text run from the
// composited colours. It is how OBRS-734 was found to be 1.03:1 and proven fixed at 5.25:1.
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
];

const PROBE = `(root) => {
  const parse = (c) => (c.match(/[\\d.]+/g) || [0,0,0]).slice(0,4).map(Number);
  const over = (fg, bg) => { const a = fg[3] === undefined ? 1 : fg[3]; return [0,1,2].map(i => a*fg[i] + (1-a)*bg[i]); };
  const bgOf = (el) => { let n = el, chain = []; while (n) { chain.push(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
    let acc = [255,255,255]; for (let i = chain.length-1; i>=0; i--) acc = over(chain[i], acc); return acc; };
  const lum = (c) => { const f = c.map(v => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a,b) => { const [l1,l2] = [lum(a),lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };
  const seen = new Set(); const out = [];
  for (const el of root.querySelectorAll('label, small, h4, h5, p, span, button, input')) {
    let t = el.tagName === 'INPUT' ? (el.value || '') : (el.innerText || '');
    t = t.trim();
    if (!t || t.length > 40) continue;
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
  return out;
}`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1536, height: 900 } });
  await p.goto(`${BASE}/login`);
  await p.locator('input[type="email"]').fill('admin@system.local');
  await p.locator('input[type="password"]').fill('P@ssw0rd');
  await p.locator('button[type="submit"]').click();
  await p.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });

  let worstDark = Infinity;
  let failCount = 0;
  for (const theme of ['light', 'dark']) {
    for (const c of CASES) {
      await p.goto(`${BASE}${c.url}`);
      const opener = c.open || EDIT_BTN;
      if (c.pre) { await p.locator(c.pre).first().click({ timeout: 30000 }); await p.waitForTimeout(2500); }
      await p.locator(opener).first().waitFor({ timeout: 30000 });
      await p.waitForTimeout(1500);
      const isDark = await p.locator('.admin-shell.is-dark').count();
      if ((theme === 'dark') !== (isDark > 0)) { await p.locator(THEME).first().click(); await p.waitForTimeout(1200); }
      await p.locator(opener).first().click();
      const root = p.locator(c.modal).first();
      await root.waitFor({ state: 'visible', timeout: 20000 });
      await p.waitForTimeout(1800);
      const rows = await root.evaluate(eval(`(${PROBE})`));
      const measured = rows.filter((x) => x.r !== null).length;
      if (measured < 5) throw new Error(`${c.name}: only ${measured} of ${rows.length} runs measurable - the probe is broken, do not read this as a pass`);
      if (rows.length === 0) throw new Error(`${c.name}: 0 text runs measured - the probe found nothing, do not read this as a pass`);
      console.log(`\n### ${LABEL} ${theme} ${c.name} (${rows.length} text runs)`);
      for (const x of rows) {
        if (x.r === null) { console.log(`     n/a  gradient fill - measure by pixel, not by computed style  ${x.tag.padEnd(6)} "${x.t}"`); continue; }
        const flag = x.r < 4.5 ? (x.r < 3 ? ' <<< FAIL' : ' <<< large-only') : '';
        console.log(`  ${String(x.r).padStart(6)}  fg=${x.fg.padEnd(14)} bg=${x.bg.padEnd(14)} ${x.tag.padEnd(6)} "${x.t}"${flag}`);
        if (theme === 'dark') { worstDark = Math.min(worstDark, x.r); if (x.r < 4.5) failCount++; }
      }
      if (OUT) await p.screenshot({ path: path.join(OUT, `734-${LABEL}-${theme}-${c.name}.png`) });
      await p.locator('.user-editor-close, .role-editor-close, .admin-modal-backdrop button:has(span:text-is("close"))').first().click().catch(() => {});
      await p.waitForTimeout(800);
    }
  }
  console.log(`\n===== ${LABEL}: dark-mode worst ratio = ${worstDark}, runs below AA = ${failCount} =====`);
  await b.close();
})().catch((e) => { console.error('SCRIPT ERROR:', e.message); process.exit(2); });
