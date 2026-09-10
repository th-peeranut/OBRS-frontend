// Visual evidence for OBRS-1350 - the resend prompt above "ส่งอีกครั้ง" / "Resend"
// on the OTP entry screen, in Thai and English.
//
//   node e2e/scripts/capture-obrs1350.js <port> <BEFORE|AFTER> [outDir]
//
// Lane: fully stubbed. `/otp/login/<phone>` has no guard, but ngOnInit calls
// sendOtp() unconditionally, so an unstubbed run would either hit a backend or
// paint the OTP_REQUEST_FAILED toast over the very paragraph under test. Every
// /api/** call is intercepted, so no backend, no Postgres and no SMS are billed.
//
// The frame is not the whole verdict: each case also prints the paragraph's own
// textContent, which is what separates "OTP is on screen somewhere" from "this
// line reads OTP".
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const PORT = process.argv[2] || 4450;
const LABEL = (process.argv[3] || 'AFTER').toUpperCase();
const OUT = process.argv[4] || path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1350');
const BASE = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });

const ok = (data) => JSON.stringify({ code: 200, message: 'OK', data });

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const lang of ['th', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((l) => localStorage.setItem('app_language', l), lang);
    const page = await context.newPage();

    await page.route('**/api/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: ok({ refNo: 'REF-1350', status: 'SENT', token: 'TKN-1350' }),
    }));

    await page.goto(`${BASE}/otp/login/0812345678`, { waitUntil: 'networkidle' });

    const para = page.locator('form.login-form p.register-link');
    await para.waitFor({ state: 'visible', timeout: 30000 });
    const text = (await para.textContent()).replace(/\s+/g, ' ').trim();

    const file = path.join(OUT, `OBRS-1350-${LABEL}-${lang}-otp-resend-prompt.png`);
    await page.screenshot({ path: file, fullPage: false });
    results.push({ lang, text, file });

    await context.close();
  }

  await browser.close();

  for (const r of results) {
    console.log(`[${LABEL}] ${r.lang}: "${r.text}"`);
    console.log(`         hasOTP=${r.text.includes('OTP')} hasOPT=${r.text.includes('OPT')}  -> ${r.file}`);
  }
})();
