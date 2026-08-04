// OBRS-1003 before/after capture, both arms from the SAME fixed server.
//
// The BEFORE arm is not a mock-up: the fix is one declaration that overrides only
// `position` on @primeuix's `.p-datepicker-input-icon-container` rule, whose
// `inset-inline-end` is untouched and still live in the theme. Re-injecting
// `position: absolute` at higher specificity therefore restores byte-for-byte the
// cascade that shipped -- and the script PROVES that rather than assuming it, by
// asserting the before arm reproduces the measured +4px overflow before it shoots.
const { chromium } = require('@playwright/test');

const base = process.argv[2];
const outDir = process.argv[3];

const RESTORE_BUG = `
.p-datepicker.app-date-field .p-datepicker-input-icon-container { position: absolute; }
`;

const probe = () => {
  const out = [];
  document.querySelectorAll('img.app-date-field-icon').forEach((img) => {
    const host = img.closest('p-datepicker, .p-datepicker');
    const input = host && host.querySelector('input');
    const ib = img.getBoundingClientRect();
    const nb = input.getBoundingClientRect();
    out.push({
      overflowPx: Math.round(ib.x - nb.right),
      insetFromLeftPx: Math.round(ib.x - nb.x),
      vDeltaPx: Math.round((ib.y + ib.height / 2) - (nb.y + nb.height / 2)),
    });
  });
  return out;
};

const SHOTS = [
  { path: '/', name: 'home' },
  { path: '/admin/reports', name: 'admin-reports' },
];

// Two failed attempts are recorded here so the next person does not repeat them:
//
// 1. `locator('.app-date-field').screenshot()` clips to the FIELD's own box -- which is
//    exactly where the icon is NOT in the before arm. Both arms cropped to identical
//    pixels and the "evidence" showed nothing (two byte-identical 495 B files).
// 2. `page.screenshot({clip})` fed from `getBoundingClientRect()` shoots the wrong
//    region: page.screenshot's `clip` is in DOCUMENT coordinates while the rect is
//    VIEWPORT-relative, so on the home page -- whose field is below the fold -- the crop
//    landed on the analytics banner instead.
//
// Shoot the field's PARENT element and let Playwright own the scrolling and the
// coordinate space. The parent contains the icon in both arms.
const shootAround = async (page, path) => {
  const parent = page.locator('.p-datepicker.app-date-field').first().locator('xpath=..');
  await parent.scrollIntoViewIfNeeded();
  await parent.screenshot({ path });
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
    // The real key -- `ANALYTICS_CONSENT_KEY` in e2e/support/analytics-consent.ts.
    // The two plausible-looking names this script used first are read by nothing, so
    // the banner stayed up and overlaid the bottom of every shot.
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
  });

  const report = [];
  for (const s of SHOTS) {
    await page.goto(base + s.path, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('img.app-date-field-icon', { timeout: 20000 });

    // AFTER = the shipped stylesheet, untouched.
    const after = await page.evaluate(probe);
    const afterPath = `${outDir}/${s.name}-AFTER.png`;
    await shootAround(page, afterPath);

    // BEFORE = the same page with the fix's single declaration cancelled.
    const tag = await page.addStyleTag({ content: RESTORE_BUG });
    const before = await page.evaluate(probe);
    const beforePath = `${outDir}/${s.name}-BEFORE.png`;
    await shootAround(page, beforePath);
    await tag.evaluate((el) => el.remove());

    const faithful = before.every((b) => b.overflowPx === 4 && b.vDeltaPx === -8);
    const fixed = after.every((a) => a.insetFromLeftPx === 16 && a.vDeltaPx === 0);
    // Two identical files is how the first attempt failed silently -- assert the
    // images actually DIFFER rather than trusting that a moved icon must show up.
    const fs = require('fs');
    const differ = !fs.readFileSync(beforePath).equals(fs.readFileSync(afterPath));
    report.push({ page: s.name, before, after, beforeArmReproducesTheMeasuredBug: faithful, afterArmCorrect: fixed, imagesDiffer: differ });
  }

  console.log(JSON.stringify(report, null, 2));
  const allGood = report.every((r) => r.beforeArmReproducesTheMeasuredBug && r.afterArmCorrect && r.imagesDiffer);
  console.log(allGood ? 'CAPTURE VALID' : 'CAPTURE INVALID -- do not use these images');
  await browser.close();
  process.exit(allGood ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
