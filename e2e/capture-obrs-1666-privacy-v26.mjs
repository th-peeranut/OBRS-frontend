/**
 * OBRS-1666 — before/after evidence for privacy notice 2.6 (the section-26 line).
 *
 *   npx ng serve --port 4317
 *   node e2e/capture-obrs-1666-privacy-v26.mjs BEFORE http://localhost:4317 e2e-evidence/obrs-1666-privacy/before
 *   node e2e/capture-obrs-1666-privacy-v26.mjs AFTER  http://localhost:4317 e2e-evidence/obrs-1666-privacy/after
 *
 * Same trick as `capture-obrs-1364-privacy-v25.mjs`, and for the same reason: the notice body is
 * not compiled into the bundle - it is fetched at runtime from `public/i18n/{lang}.json` - so ONE
 * `ng serve` produces both variants. BEFORE answers that one request with
 * `git show HEAD:public/i18n/<lang>.json`, i.e. the committed 2.5 text byte for byte. Nothing else
 * differs between the two runs.
 *
 * ⚠️ The version line at the top of the page reads 2.6 in BOTH variants: it renders
 * `PRIVACY_POLICY_VERSION`, which IS compiled in. The subject of these images is the body below
 * it, and that is genuinely 2.5 vs 2.6.
 *
 * Sections shot (th + en): 2 (the passenger-type bullet now says the two religious answers need
 * explicit consent) and 3 (the section-26 bullet that had never existed). zh is not shot: its
 * CONTENT_2 is a one-paragraph pointer, not a translation of the notice.
 *
 * Every run prints the sentences it actually read off the page, so a blank or mis-clipped
 * screenshot cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [variantArg, baseUrl, outDirArg] = process.argv.slice(2);
if (!variantArg || !baseUrl || !outDirArg) {
  console.error('usage: node capture-obrs-1666-privacy-v26.mjs <BEFORE|AFTER> <baseUrl> <outDir>');
  process.exit(2);
}
const VARIANT = variantArg.toUpperCase();
const OUT = path.resolve(outDirArg);
const LANGS = ['th', 'en'];
const SECTIONS = ['2', '3'];

const committed = (lang) =>
  execFileSync('git', ['show', `HEAD:public/i18n/${lang}.json`], { maxBuffer: 32 * 1024 * 1024 });

const measured = {};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const lang of LANGS) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
  await ctx.addInitScript((l) => localStorage.setItem('app_language', l), lang);

  if (VARIANT === 'BEFORE') {
    for (const l of LANGS) {
      const body = committed(l);
      await ctx.route(`**/i18n/${l}.json*`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body })
      );
    }
  }
  // Nothing on this page needs the API, and an unstubbed call raises a SweetAlert over the whole
  // viewport (OBRS-1222) which would be the picture instead.
  await ctx.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/privacy-policy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const perLang = {};
  for (const n of SECTIONS) {
    const box = await page.evaluate((num) => {
      const heads = [...document.querySelectorAll('h2')];
      const i = heads.findIndex((h) => h.textContent.trim().startsWith(`${num}.`));
      if (i < 0) return null;
      const top = heads[i].getBoundingClientRect().top + window.scrollY - 12;
      const next = heads[i + 1];
      const bottom = next ? next.getBoundingClientRect().top + window.scrollY - 8 : top + 900;
      let text = heads[i].innerText;
      for (let el = heads[i].nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
        text += `\n${el.innerText}`;
      }
      return { top, bottom, text: text.slice(0, 2200) };
    }, n);
    if (!box) {
      perLang[`section${n}`] = '(heading not found)';
      continue;
    }
    perLang[`section${n}`] = box.text;
    await page.screenshot({
      path: path.join(OUT, `section-${n}-${lang}.png`),
      clip: { x: 0, y: box.top, width: 900, height: Math.min(box.bottom - box.top, 2400) },
      fullPage: true,
    });
  }
  measured[lang] = perLang;
  await ctx.close();
}

await browser.close();
await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ variant: VARIANT, measured }, null, 2));
console.log(`${VARIANT} - images + measured.json in ${OUT}`);
for (const lang of LANGS) {
  for (const n of SECTIONS) {
    console.log(`\n--- ${lang} section ${n} ---\n${measured[lang][`section${n}`]}`);
  }
}
