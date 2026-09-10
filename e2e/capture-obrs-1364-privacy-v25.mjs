/**
 * OBRS-1364 AC-4 + OBRS-1546 — before/after evidence for privacy notice 2.5.
 *
 *   npx ng serve --port 4311
 *   node e2e/capture-obrs-1364-privacy-v25.mjs BEFORE http://localhost:4311 e2e-evidence/obrs-1364-privacy/before
 *   node e2e/capture-obrs-1364-privacy-v25.mjs AFTER  http://localhost:4311 e2e-evidence/obrs-1364-privacy/after
 *
 * ONE `ng serve`, TWO variants. The notice body is not compiled into the bundle —
 * it is fetched at runtime from `public/i18n/{lang}.json` — so BEFORE is produced by
 * answering that one request with `git show HEAD:public/i18n/<lang>.json`, i.e. the
 * committed 2.4 text, byte for byte. Nothing else differs between the two runs.
 *
 * ⚠️ The version line at the top of the page reads 2.5 in BOTH variants: it renders
 * `PRIVACY_POLICY_VERSION` from `privacy-policy.version.ts`, which IS compiled in, and
 * a second build to change one line of chrome is not worth its cost. The subject of
 * these images is the body text below it, and that is genuinely 2.4 vs 2.5.
 *
 * Sections shot (th + en): 2 (passenger type — OBRS-1364 AC-4), 3 and 6 (analytics
 * conditionality — OBRS-1546 AC-5). Each shot is clipped from its own <h2> to the next
 * one, so the two variants frame the same block of page.
 *
 * Every run also prints the sentences it actually read off the page, so a blank or
 * mis-clipped screenshot cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [variantArg, baseUrl, outDirArg] = process.argv.slice(2);
if (!variantArg || !baseUrl || !outDirArg) {
  console.error('usage: node capture-obrs-1364-privacy-v25.mjs <BEFORE|AFTER> <baseUrl> <outDir>');
  process.exit(2);
}
const VARIANT = variantArg.toUpperCase();
const OUT = path.resolve(outDirArg);
const LANGS = ['th', 'en'];
/** Leading number of each <h2> to shoot. 2 = passenger type, 3/6 = analytics. */
const SECTIONS = ['2', '3', '6'];

/** The committed (2.4) file, read straight out of git rather than kept as a copy. */
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
  // Nothing on this page needs the API, and an unstubbed call raises a SweetAlert
  // over the whole viewport (OBRS-1222) which would be the picture instead.
  await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

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
      const bottom = next
        ? next.getBoundingClientRect().top + window.scrollY - 8
        : top + 900;
      // Every <h2> shares one container (the notice is one innerHTML binding), so the
      // section's text is the run of siblings up to the next <h2>, not the parent.
      let text = heads[i].innerText;
      for (let el = heads[i].nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
        text += `\n${el.innerText}`;
      }
      return { top, bottom, text: text.slice(0, 1600) };
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
console.log(`${VARIANT} — images + measured.json in ${OUT}`);
for (const lang of LANGS) {
  for (const n of SECTIONS) {
    console.log(`\n--- ${lang} section ${n} ---\n${measured[lang][`section${n}`]}`);
  }
}
