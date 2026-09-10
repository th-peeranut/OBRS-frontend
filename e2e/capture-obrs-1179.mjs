/**
 * OBRS-1179 — before/after evidence for "the consent bar asks about analytics
 * that cannot load".
 *
 * Every stage stubs its own /api traffic, so the shots are of the consent
 * surfaces and nothing else -- an unstubbed station call raises a SweetAlert
 * over the whole viewport (OBRS-1222) and would have been the picture instead.
 *
 * Stages (each against its own `ng serve`, port passed in):
 *   before      origin/dev code, build with NO measurement ID  -> bar asks anyway
 *   after-noid  this branch,     build with NO measurement ID  -> bar stands down
 *   after-id    this branch,     --configuration gate (ID set) -> bar still asks
 *
 * Usage: node capture-obrs-1179.mjs <stage> <baseUrl> <outDir>
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const [stage, baseUrl, outDir] = process.argv.slice(2);
if (!stage || !baseUrl || !outDir) {
  console.error('usage: node capture-obrs-1179.mjs <stage> <baseUrl> <outDir>');
  process.exit(2);
}

const STATIONS = [
  { id: 1, name: 'สถานีขนส่งนครสวรรค์', latitude: 15.7, longitude: 100.1 },
  { id: 2, name: 'สถานีขนส่งพิจิตร', latitude: 16.44, longitude: 100.35 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 664 } });

await context.addInitScript(() => {
  localStorage.setItem('app_language', 'th');
  // No consent key: an undecided first-time visitor is the whole subject.
  localStorage.removeItem('obrs_analytics_consent_v1');
});
await context.route('**/api/stops', (route) => route.fulfill({ json: STATIONS }));
await context.route('**/api/schedules/search', (route) => route.fulfill({ json: [] }));
await context.route('**/api/**', (route) => route.fulfill({ json: [] }));
// The measurement vendors, refused: these captures must not send a single
// request to a real analytics host, and after-id ships a (fake) GA4 ID.
for (const host of ['**googletagmanager.com/**', '**clarity.ms/**', '**google-analytics.com/**']) {
  await context.route(host, (route) => route.abort());
}

const page = await context.newPage();

async function shot(path, name, wait, toBottom = false) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  if (toBottom) {
    // The consent control is the last block before the footer, so the top of the
    // policy page shows neither its presence nor its absence. Scroll to the
    // control itself when it is there and to the footer when it is not — that
    // way the absent case is a picture of the place it would have been, not of
    // some arbitrary point in a very long page.
    // Anchored on the FOOTER in both stages, not on the control, so the two
    // shots frame the same strip of page: whether the control is there is then
    // the only difference between them.
    // Bottom first: this page is long enough that a rect measured from the top
    // is taken before the whole document has settled, and the first version of
    // this landed on section 8.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const footer = document.querySelector('app-footer');
      if (!footer) return;
      const top = footer.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - 420));
    });
    await page.waitForTimeout(600);
  }
  const file = `${outDir}/OBRS-1179-${stage}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
}

const banner = async () => (await page.locator('.consent-banner').count()) > 0;
const control = async () =>
  (await page.locator('[data-testid="analytics-consent-control"]').count()) > 0;

const home = await shot('/', '0-home-consent-bar', 1500);
// Measured, not eyeballed: a screenshot of an absent bar and a screenshot of a
// bar that had not rendered yet look identical.
console.log(`${stage}  home            bar rendered: ${await banner()}   -> ${home}`);

const policy = await shot('/privacy-policy', '1-privacy-policy-control', 1500, true);
console.log(`${stage}  privacy-policy  control rendered: ${await control()}   -> ${policy}`);

await browser.close();
