/**
 * OBRS-267 evidence — the "Refunded" KPI card on /admin/refund-void-report.
 *
 * What the card is about: OBRS-268 changed the number under this label from the
 * GROSS original payment value to Σ payment_refunds (the money that actually went
 * back), and nobody changed the label, so the screen has been announcing "(gross)
 * / (ยอดรวมก่อนหัก)" over a net figure ever since.
 *
 * Frontend is served locally against the SIT backend (SIT CORS is pinned to
 * http://localhost:4200, so the port is not negotiable):
 *
 *   npx ng serve --configuration sit --port 4200
 *   OBRS_MODE=before node e2e/capture-obrs-267-refunded-label.mjs   # public/i18n/*.json at origin/dev
 *   OBRS_MODE=after  node e2e/capture-obrs-267-refunded-label.mjs   # this branch's strings
 *
 * The two modes serve the SAME bundle — only public/i18n/{th,en,zh}.json differ on
 * disk between the runs, because ng serve reads those straight from public/.
 *
 * The hint lives in a native `title` tooltip, which a screenshot cannot show, so the
 * script also prints both strings it actually read out of the DOM into result.json.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const MODE = (process.env.OBRS_MODE ?? 'after').toLowerCase();
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-267');
const EMAIL = process.env.SIT_ADMIN_EMAIL;
const PASSWORD = process.env.SIT_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error('set SIT_ADMIN_EMAIL and SIT_ADMIN_PASSWORD (source secrets.local.env)');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });

  await page.goto(`${BASE}/admin/refund-void-report`, { waitUntil: 'networkidle' });

  const label = page.locator('.refund-void-card-label p.admin-muted').first();
  await label.waitFor({ timeout: 30000 });
  const infoBtn = page.locator('.refund-void-info-btn').first();

  // The default range (last 7 days, Asia/Bangkok) is what gets captured, on purpose.
  // Two earlier runs tried to widen it — first against input[type=date] (the filters
  // are PrimeNG p-datePicker, so nothing matched), then by typing into the picker,
  // which left the "to" field in a dirty/invalid-looking red state in the shot. SIT
  // returns ฿0 either way: its payment_refunds ledger has no rows (see OBRS-594), so
  // a wider window buys no number and costs a misleading screenshot. This evidence is
  // about the LABEL over the number, and both strings are read out of the live DOM below.
  await page.waitForTimeout(1000);

  const result = {
    mode: MODE,
    base: BASE,
    capturedAt: new Date().toISOString(),
    label: (await label.textContent())?.trim(),
    hint: await infoBtn.getAttribute('title'),
    amount: (await page.locator('.admin-big-number').first().textContent())?.trim(),
    basisNote: (await page.locator('.refund-void-basis-note').textContent())?.trim(),
  };
  console.log(`${MODE}: label = ${result.label}`);
  console.log(`${MODE}: hint  = ${result.hint}`);
  console.log(`${MODE}: amount= ${result.amount}`);

  const card = page.locator('article.admin-kpi').first();
  await card.screenshot({ path: path.join(OUT, `OBRS-267-${MODE.toUpperCase()}-refunded-card.png`) });
  await page.screenshot({
    path: path.join(OUT, `OBRS-267-${MODE.toUpperCase()}-refund-void-report.png`),
    fullPage: false,
  });
  await writeFile(path.join(OUT, `result-${MODE}.json`), JSON.stringify(result, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
