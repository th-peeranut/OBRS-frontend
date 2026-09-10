/**
 * OBRS-1232 evidence -- the title is stored as a CODE and translated at display.
 *
 * Run it TWICE against the same local database (obrs1232qa), once per stack, so the two sets of
 * images differ only by the code under test:
 *
 *   OBRS_OUT_DIR=e2e/out/obrs-1232/before node e2e/capture-obrs-1232-title-code.mjs   # origin/dev
 *   OBRS_OUT_DIR=e2e/out/obrs-1232/after  node e2e/capture-obrs-1232-title-code.mjs   # this branch
 *
 * The subject row is the production one from the card: user_profiles holding
 * title='Miss', first_name='กุลธิดา', last_name='นาใจคง'. On the BEFORE stack the admin table
 * renders `Miss กุลธิดา นาใจคง` in all three languages, because the backend composed it into one
 * string. On the AFTER stack V119 has rewritten the column to 'MISS' and each screen resolves
 * COMMON.TITLES.MISS in the language the reader picked.
 *
 * `customer@system.local` (seeded title 'Mr.') carries the /account half.
 *
 * Screens per language (th, en, zh):
 *   1-admin-users-<lang>.png   /admin/users, the row under test
 *   2-admin-modal-<lang>.png   that row's edit modal -- free text BEFORE, dropdown AFTER
 *   3-account-<lang>.png       /account read state, the composed name line
 *   4-account-edit-<lang>.png  /account edit state, the title field
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-1232');
const PASSWORD = process.env.OBRS_QA_PASSWORD ?? 'P@ssw0rd';
const LANGS = ['th', 'en', 'zh'];
const SUBJECT = 'กุลธิดา';

async function contextFor(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => {
    // The app reads this on boot (LanguageService.getStoredLanguage) and the auth interceptor
    // sends it as Accept-Language, so setting it here switches BOTH halves - which is the point:
    // on the AFTER stack the manifest/e-mail path resolves the code server-side off this header.
    window.localStorage.setItem('app_language', l);
  }, lang);
  return ctx;
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const seen = {};

  for (const lang of LANGS) {
    // ---- admin: the users table and the edit modal ----
    {
      const ctx = await contextFor(browser, lang);
      const page = await ctx.newPage();
      await login(page, 'admin@system.local');

      await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });
      const row = page.locator('tbody tr', { hasText: SUBJECT }).first();
      await row.waitFor({ timeout: 30000 });
      seen[`admin-users-${lang}`] = (await row.locator('td').first().innerText()).split('\n')[0].trim();
      await page.screenshot({ path: path.join(OUT, `1-admin-users-${lang}.png`), fullPage: true });
      console.log(`1-admin-users-${lang}.png  row = ${seen[`admin-users-${lang}`]}`);

      await row.locator('button:has-text("edit_square")').click();
      await page.locator('form, .user-editor-grid').first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      const titleField = page.locator('.user-field.is-title');
      seen[`admin-modal-${lang}`] = (await titleField.innerText()).replace(/\s+/g, ' ').trim();
      await page.screenshot({ path: path.join(OUT, `2-admin-modal-${lang}.png`), fullPage: true });
      console.log(`2-admin-modal-${lang}.png  field = ${seen[`admin-modal-${lang}`]}`);

      await ctx.close();
    }

    // ---- customer: /account read state and edit state ----
    {
      const ctx = await contextFor(browser, lang);
      const page = await ctx.newPage();
      await login(page, 'customer@system.local');

      await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `3-account-${lang}.png`), fullPage: true });
      console.log(`3-account-${lang}.png`);

      const editButton = page.locator('button').filter({ hasText: /.+/ }).first();
      await editButton.waitFor({ timeout: 20000 }).catch(() => {});
      const edit = page.locator('#account-profile-title');
      if (!(await edit.count())) {
        // read state -> click the profile edit button, whose label is i18n'd per language
        const buttons = page.locator('.account-card button');
        const n = await buttons.count();
        for (let i = 0; i < n; i++) {
          await buttons.nth(i).click().catch(() => {});
          if (await page.locator('#account-profile-title').count()) break;
        }
      }
      await page.locator('#account-profile-title').waitFor({ timeout: 20000 });
      await page.waitForTimeout(400);
      seen[`account-edit-${lang}`] = await page.locator('#account-profile-title').evaluate(
        (el) => (el.tagName === 'SELECT' ? `SELECT value=${el.value}` : `INPUT value=${el.value}`)
      );
      await page.screenshot({ path: path.join(OUT, `4-account-edit-${lang}.png`), fullPage: true });
      console.log(`4-account-edit-${lang}.png  ${seen[`account-edit-${lang}`]}`);

      await ctx.close();
    }
  }

  await browser.close();
  console.log('\nMEASURED:');
  for (const [k, v] of Object.entries(seen)) console.log(`  ${k} = ${v}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
