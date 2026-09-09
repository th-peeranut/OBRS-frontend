// Standalone capture script for OBRS-1690 visual evidence (not a Playwright test, not committed
// to the suite -- it lives here for the same reason capture-obrs677.js does: the script is the
// reproducible part, the PNGs are not committed).
//
// usage: node e2e/scripts/capture-obrs1690.js <baseUrl>
//
// Approach: NO backend, same lane as capture-obrs677.js. AuthService.isAuthenticated() is a pure
// localStorage check and 'admin' clears the AdminGuard, so seeding auth_token/auth_username/
// auth_roles gets us onto /admin/refund-void-report; every /api/** call is stubbed so the page
// renders deterministic numbers instead of whatever a seed happens to hold.
//
// BEFORE and AFTER come off ONE dev server, which is legitimate here and would not be for a normal
// card: this change is ENTIRELY the value of one i18n key, so serving origin/dev's version of
// public/i18n/<lang>.json through page.route() reproduces origin/dev's page exactly. There is no
// component, no style and no code path that differs between the two shots -- only the string the
// card is about. (A second worktree on a second port would cost another npm ci to prove the same
// thing.) The old strings below are pasted verbatim from origin/dev @ e388ce34.
//
// The page renders BASIS_NOTE unconditionally -- it is deliberately NOT gated by contentState (see
// the comment above it in refund-void-report-page.component.html) -- but the stub still feeds real
// numbers so the reviewer sees the sentence in the context it is read in, next to the money it
// describes, rather than alone on an error page.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:4310';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1690');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// origin/dev @ e388ce34 -- ADMIN.REFUND_VOID_REPORT.BASIS_NOTE, the sentence this card is about.
const OLD_BASIS_NOTE = {
  en: 'Refunded and Voided are bucketed by the date the refund or void was processed, not the original booking or departure date.',
  th: 'ยอดคืนเงินและยอดยกเลิกนับตามวันที่ดำเนินการคืนเงินหรือยกเลิก ไม่ใช่วันที่จองหรือวันที่เดินทาง',
};

const ok = (data) => ({ code: 200, message: 'OK', data });

// A range where the defect is visible in the numbers as well as in the sentence: the refunds are
// concentrated on the day the BOOKINGS were made, which is what the report actually buckets by.
// The page's own default range (today - 6 .. today) is what it asks for; the stub answers with the
// same window so nothing on the frame contradicts anything else on it.
const REPORT = ok({
  range: { from: '2026-08-26', to: '2026-09-01', timezone: 'Asia/Bangkok' },
  summary: {
    refunded: { count: 6, amount: '9400.00' },
    manualRefundPending: { count: 2, amount: '1250.00' },
    voided: {
      count: 7,
      amount: '3100.00',
      cancelled: { count: 4, amount: '2200.00' },
      expired: { count: 3, amount: '900.00' },
    },
    currency: 'THB',
  },
  daily: [
    {
      date: '2026-08-26',
      refunded: { count: 4, amount: '7200.00' },
      manualRefundPending: { count: 1, amount: '850.00' },
      voided: { count: 3, amount: '1500.00', cancelled: { count: 2, amount: '1200.00' }, expired: { count: 1, amount: '300.00' } },
    },
    {
      date: '2026-08-27',
      refunded: { count: 1, amount: '1400.00' },
      manualRefundPending: { count: 0, amount: '0.00' },
      voided: { count: 2, amount: '900.00', cancelled: { count: 1, amount: '600.00' }, expired: { count: 1, amount: '300.00' } },
    },
    {
      date: '2026-08-28',
      refunded: { count: 1, amount: '800.00' },
      manualRefundPending: { count: 1, amount: '400.00' },
      voided: { count: 1, amount: '400.00', cancelled: { count: 1, amount: '400.00' }, expired: { count: 0, amount: '0.00' } },
    },
    {
      date: '2026-08-29',
      refunded: { count: 0, amount: '0.00' },
      manualRefundPending: { count: 0, amount: '0.00' },
      voided: { count: 1, amount: '300.00', cancelled: { count: 0, amount: '0.00' }, expired: { count: 1, amount: '300.00' } },
    },
    {
      date: '2026-08-30',
      refunded: { count: 0, amount: '0.00' },
      manualRefundPending: { count: 0, amount: '0.00' },
      voided: { count: 0, amount: '0.00', cancelled: { count: 0, amount: '0.00' }, expired: { count: 0, amount: '0.00' } },
    },
    {
      date: '2026-08-31',
      refunded: { count: 0, amount: '0.00' },
      manualRefundPending: { count: 0, amount: '0.00' },
      voided: { count: 0, amount: '0.00', cancelled: { count: 0, amount: '0.00' }, expired: { count: 0, amount: '0.00' } },
    },
    {
      date: '2026-09-01',
      refunded: { count: 0, amount: '0.00' },
      manualRefundPending: { count: 0, amount: '0.00' },
      voided: { count: 0, amount: '0.00', cancelled: { count: 0, amount: '0.00' }, expired: { count: 0, amount: '0.00' } },
    },
  ],
});

async function shoot(browser, { lang, stale, name }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.addInitScript(
    ([language]) => {
      localStorage.setItem('app_language', language);
      localStorage.setItem('auth_token', 'fake-admin-token-for-capture');
      localStorage.setItem('auth_username', 'admin@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    },
    [lang]
  );

  // Catch-all FIRST, specifics after: Playwright runs the LAST-registered matching handler.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
  await page.route('**/reports/refund-void**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REPORT) })
  );

  // BEFORE only: hand ngx-translate origin/dev's copy of this one key.
  if (stale) {
    await page.route(`**/i18n/${lang}.json**`, async (route) => {
      const response = await route.fetch();
      const bundle = await response.json();
      bundle.ADMIN.REFUND_VOID_REPORT.BASIS_NOTE = OLD_BASIS_NOTE[lang];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bundle) });
    });
  }

  await page.goto(`${BASE}/admin/refund-void-report`, { waitUntil: 'networkidle' });

  const note = page.locator('.refund-void-basis-note');
  await note.waitFor({ state: 'visible', timeout: 30000 });
  const noteText = (await note.innerText()).trim();

  // A screenshot has no failure mode, so assert what the frame is supposed to prove before saving.
  const expectedNote = stale ? OLD_BASIS_NOTE[lang] : null;
  if (stale && noteText !== expectedNote) {
    throw new Error(`[${name}] BEFORE shot did not render origin/dev's sentence.\n  got: ${noteText}`);
  }
  if (!stale && noteText === OLD_BASIS_NOTE[lang]) {
    throw new Error(`[${name}] AFTER shot still shows the old sentence -- the dev server is serving stale i18n`);
  }
  if (!noteText || noteText.includes('ADMIN.REFUND_VOID_REPORT')) {
    throw new Error(`[${name}] the note rendered as a raw key or empty -- translations did not load`);
  }
  // The numbers have to be on the frame too: the sentence is only wrong BECAUSE it describes them.
  const body = await page.evaluate(() => document.body.innerText);
  // The screen renders money without decimals ("THB 9,400"), so assert what it actually prints.
  for (const needle of ['9,400', '2026-08-26']) {
    if (!body.includes(needle)) {
      throw new Error(`[${name}] page is missing ${needle} -- the report body did not render`);
    }
  }

  await page.screenshot({ path: path.join(ASSETS_DIR, name), fullPage: true });
  console.log(JSON.stringify({ shot: name, lang, stale, note: noteText }));
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await shoot(browser, { lang: 'th', stale: true, name: 'before-th.png' });
    await shoot(browser, { lang: 'th', stale: false, name: 'after-th.png' });
    await shoot(browser, { lang: 'en', stale: true, name: 'before-en.png' });
    await shoot(browser, { lang: 'en', stale: false, name: 'after-en.png' });
    console.log('saved to ' + ASSETS_DIR);
  } finally {
    await browser.close();
  }
})();
