// OBRS-1003 verification: same geometry probe as the diagnosis run, but against a
// dev server BUILT FROM THE FIXED styles.scss -- no addStyleTag anywhere, so a pass
// here is a statement about the shipped stylesheet and not about an injected patch.
//   node verify-obrs-1003.js http://localhost:4242 / /admin/reports ...
const { chromium } = require('@playwright/test');

const base = process.argv[2] || 'http://localhost:4242';
const paths = process.argv.slice(3);

const probe = () => {
  const out = [];
  document.querySelectorAll('img.app-date-field-icon').forEach((img, i) => {
    const host = img.closest('p-datepicker, .p-datepicker');
    const input = host && host.querySelector('input');
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right), cy: Math.round(b.y + b.height / 2) };
    };
    const ir = r(img);
    const inr = r(input);
    out.push({
      i,
      offsetParent: img.offsetParent ? img.offsetParent.className.split(' ')[0] : null,
      insetFromFieldLeftPx: ir && inr ? ir.x - inr.x : null,
      verticalCenterDeltaPx: ir && inr ? ir.cy - inr.cy : null,
      insideField: ir && inr ? ir.x >= inr.x && ir.right <= inr.right : null,
      inputWidth: inr && inr.w,
    });
  });
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: { content: [], totalElements: 0, unreadCount: 0, stops: [], salesPointStop: null } }) })
  );
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'measure-token');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin', 'owner']));
    localStorage.setItem('analytics_consent', 'granted');
    localStorage.setItem('obrs_analytics_consent', 'granted');
  });

  let total = 0, ok = 0;
  const rows = [];
  for (const p of paths) {
    try {
      await page.goto(base + p, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('img.app-date-field-icon', { timeout: 20000 });
      const items = await page.evaluate(probe);
      const landedOn = new URL(page.url()).pathname;
      for (const it of items) {
        total++;
        const pass = it.insideField === true && it.insetFromFieldLeftPx === 16 && it.verticalCenterDeltaPx === 0;
        if (pass) ok++;
        rows.push({ path: p, landedOn, ...it, PASS: pass });
      }
    } catch (e) {
      rows.push({ path: p, landedOn: new URL(page.url()).pathname, error: e.message.split('\n')[0], PASS: false });
    }
  }
  console.log(JSON.stringify({ summary: `${ok}/${total} pickers pass (insideField && left==16 && vCentre==0)`, rows }, null, 2));
  await browser.close();
  process.exit(ok === total && total > 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
