/**
 * OBRS-374 evidence, part 2 -- the two new i18n keys resolve in all THREE bundles, and the group
 * header is readable in dark mode.
 *
 *   node e2e/capture-obrs-374-i18n-dark.mjs
 *
 * Why this is a separate script from the before/after one: those images answer "did the manifest
 * group and filter"; these answer "is the new chrome actually translated and visible", which is a
 * different failure (a missing key renders as the raw dotted path, and a token that silently
 * inherits its parent colour renders as invisible-but-not-broken).
 *
 * Both are asserted by MEASUREMENT, not by eye:
 *   - i18n: the header/placeholder text must not contain "STAFF.BOARDING." (that substring IS the
 *     raw-key failure) and must differ between the three languages.
 *   - dark: the header row's computed background must differ from the light one, and the header's
 *     text colour must differ from its own background -- an undeclared token would inherit and the
 *     two would collapse to the same value.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4287';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-374/i18n-dark');
const PASSWORD = process.env.OBRS_QA_PASSWORD ?? 'P@ssw0rd';
const EMAIL = process.env.OBRS_STAFF_EMAIL ?? 'driver@system.local';
const SCHEDULE_ID = process.env.OBRS_SCHEDULE_ID ?? '1';
const LANGS = ['th', 'en', 'zh'];

const measured = {};

async function open(browser, lang, dark) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([l, d]) => {
    window.localStorage.setItem('app_language', l);
    if (d) { window.localStorage.setItem('app_admin_theme', 'dark'); }
  }, [lang, dark]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
  await page.goto(`${BASE}/staff/boarding/${SCHEDULE_ID}`, { waitUntil: 'networkidle' });
  await page.locator('.boarding-stop-group-row').first().waitFor({ timeout: 30000 });
  return { ctx, page };
}

async function readChrome(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.boarding-stop-group-row td');
    const trigger = document.querySelector('[data-testid="boarding-stop-filter"] .admin-dropdown-trigger');
    const plainCell = document.querySelector('tbody tr:not(.boarding-stop-group-row) td');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const h = cs(header);
    return {
      headerText: header ? header.innerText.replace(/\s+/g, ' ').trim() : null,
      filterText: trigger ? trigger.innerText.replace(/\s+/g, ' ').trim() : null,
      headerBg: h ? h.backgroundColor : null,
      headerColor: h ? h.color : null,
      plainCellBg: cs(plainCell) ? cs(plainCell).backgroundColor : null,
      isDark: document.querySelector('.admin-shell')?.classList.contains('is-dark') ?? false,
    };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const lang of LANGS) {
    const { ctx, page } = await open(browser, lang, false);
    measured[`light-${lang}`] = await readChrome(page);
    await page.screenshot({ path: path.join(OUT, `light-${lang}.png`), fullPage: false });
    console.log(`light-${lang}  header="${measured[`light-${lang}`].headerText}"  filter="${measured[`light-${lang}`].filterText}"`);
    await ctx.close();
  }

  const { ctx, page } = await open(browser, 'th', true);
  measured['dark-th'] = await readChrome(page);
  await page.screenshot({ path: path.join(OUT, 'dark-th.png'), fullPage: false });
  console.log(`dark-th  isDark=${measured['dark-th'].isDark}  headerBg=${measured['dark-th'].headerBg}  headerColor=${measured['dark-th'].headerColor}`);
  await ctx.close();

  // --- assertions, so a bad run FAILS instead of quietly producing pretty pictures -------------
  const problems = [];
  for (const lang of LANGS) {
    const m = measured[`light-${lang}`];
    for (const [what, text] of [['header', m.headerText], ['filter', m.filterText]]) {
      if (!text) { problems.push(`${lang}: ${what} not found`); }
      else if (text.includes('STAFF.BOARDING.')) { problems.push(`${lang}: ${what} rendered a RAW KEY -> ${text}`); }
    }
  }
  const texts = LANGS.map((l) => measured[`light-${l}`].filterText);
  if (new Set(texts).size !== LANGS.length) {
    problems.push(`filter text did not differ across languages -> ${JSON.stringify(texts)}`);
  }
  const light = measured['light-th'];
  const dark = measured['dark-th'];
  if (!dark.isDark) { problems.push('dark run did not actually enter the dark shell'); }
  if (light.headerBg === dark.headerBg) { problems.push(`header background identical in both themes -> ${dark.headerBg}`); }
  if (dark.headerColor === dark.headerBg) { problems.push(`dark header text colour equals its background -> ${dark.headerColor}`); }
  if (dark.headerBg === dark.plainCellBg) { problems.push(`dark header background equals a plain row cell -> ${dark.headerBg}`); }

  await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ measured, problems }, null, 2));
  await browser.close();

  if (problems.length) {
    console.error(`FAILED:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('PASSED: all three locales resolve, and the dark header is distinct from both its own text and a plain cell');
}

main().catch((err) => { console.error(err); process.exit(1); });
