// Standalone capture script for OBRS-576 QA evidence (not a Playwright test file, not committed).
const { chromium } = require('@playwright/test');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-576');

async function login(page, baseUrl, email) {
  await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
  await page.goto(`${baseUrl}/login`);
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
}

// The sidebar's own <nav> scrolls internally (the page body does not), so a
// fullPage screenshot never reaches the SYSTEM section below the fold — the
// exact "screenshot before scrolling to the panel" trap from OBRS-426. Scroll
// the nav's own "System" heading into view before capturing.
async function scrollSystemSectionIntoView(page) {
  await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) return;
    // System is the LAST section in the sidebar (OBRS-576's own SA note: "placed
    // last in 'system' — it is the meta view over everything else") — scroll the
    // nav's own internal overflow (the page body does not scroll) all the way down.
    let scrollable = nav;
    while (scrollable && scrollable.scrollHeight <= scrollable.clientHeight && scrollable.parentElement) {
      scrollable = scrollable.parentElement;
    }
    scrollable.scrollTop = scrollable.scrollHeight;
  });
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch();

  // ---- AFTER: this card's frontend on :4200 (real login; captured FIRST so
  // its token can be reused for the BEFORE capture below) ----
  let ownerToken = null;
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await login(page, 'http://localhost:4200', 'owner@system.local');
    ownerToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    await page.goto('http://localhost:4200/admin');
    await page.waitForTimeout(1000);
    await scrollSystemSectionIntoView(page);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-576-AFTER-system-menu-with-history-entry.png') });

    await page.goto('http://localhost:4200/admin/config-change-history');
    await page.locator('table.admin-table').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-576-AFTER-history-page-light-mode.png'), fullPage: true });
    await page.close();
    console.log('AFTER screenshots captured (light mode). Token acquired:', !!ownerToken);
  }

  // ---- BEFORE: origin/dev frontend on :4205, owner menu lacking the entry ----
  // The local backend's `dev` profile CORS allows ONLY http://localhost:4200
  // (by design — the QA briefing is explicit about this) so a live login from
  // :4205 is rejected by the browser's own CORS check before it ever reaches
  // the server (confirmed: the login POST times out waiting for navigation).
  // Rather than restart the backend with a different allowed origin — which
  // would then break every :4200 capture below it — seed AuthService's own
  // localStorage contract directly (auth_token / auth_username / auth_roles,
  // see src/app/auth/auth.service.ts) with the token obtained from the real
  // :4200 login above. The sidebar's menu-gating (AdminLayoutComponent /
  // AuthService.hasAnyRole) reads purely from this cached state — no live API
  // call is needed to decide which menu items render, only to FETCH data for
  // the pages themselves (never attempted here — this capture only screenshots
  // the sidebar).
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('http://localhost:4205/login');
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_username', 'owner@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['owner', 'driver']));
    }, ownerToken);
    await page.goto('http://localhost:4205/admin');
    await page.waitForTimeout(1500);
    await scrollSystemSectionIntoView(page);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-576-BEFORE-system-menu-no-history-entry.png') });
    await page.close();
    console.log('BEFORE screenshot captured');
  }

  // ---- Dark mode: config-change-history + admin/reports ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('app_admin_theme', 'dark');
    });
    await login(page, 'http://localhost:4200', 'owner@system.local');
    await page.goto('http://localhost:4200/admin/config-change-history');
    await page.locator('table.admin-table').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-576-AFTER-history-page-dark-mode.png'), fullPage: true });

    const measurements = await page.evaluate(() => {
      const results = [];
      const selectors = ['h4', '.admin-status.is-warning', '.admin-muted', 'th', 'td'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) { results.push({ sel, found: false }); continue; }
        const cs = getComputedStyle(el);
        let bgEl = el;
        let bg = cs.backgroundColor;
        while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
          bgEl = bgEl.parentElement;
          if (!bgEl) break;
          bg = getComputedStyle(bgEl).backgroundColor;
        }
        results.push({ sel, found: true, color: cs.color, backgroundColor: bg || 'rgb(255,255,255)' });
      }
      return results;
    });
    console.log('DARK_MODE_CONTRAST_HISTORY_PAGE:', JSON.stringify(measurements));

    await page.goto('http://localhost:4200/admin/reports');
    await page.waitForTimeout(1000);
    // Trigger the SAME .admin-error state this card's Scrutinize pass touched
    // (SA §8 shared style): To < From is an invalid client-checked range.
    // Both fields arrive PRE-FILLED with a default "last 7 days" range, so a
    // bare pressSequentially() appends onto the existing text and produces a
    // garbled, unparseable value PrimeNG silently ignores — select-all first.
    const reportsFrom = page.getByRole('combobox', { name: 'From' });
    const reportsTo = page.getByRole('combobox', { name: 'To' });
    await reportsFrom.click();
    await reportsFrom.press('Control+a');
    await reportsFrom.pressSequentially('01/01/2026', { delay: 30 });
    await reportsFrom.press('Escape');
    await reportsTo.click();
    await reportsTo.press('Control+a');
    await reportsTo.pressSequentially('01/01/2020', { delay: 30 });
    await reportsTo.press('Escape');
    await page.waitForTimeout(800);
    const errorMeasurement = await page.evaluate(() => {
      const el = document.querySelector('.admin-error');
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      let bgEl = el;
      let bg = cs.backgroundColor;
      while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
        bgEl = bgEl.parentElement;
        if (!bgEl) break;
        bg = getComputedStyle(bgEl).backgroundColor;
      }
      return { found: true, color: cs.color, backgroundColor: bg || 'rgb(255,255,255)', text: el.textContent };
    });
    console.log('DARK_MODE_ADMIN_ERROR_REPORTS:', JSON.stringify(errorMeasurement));
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-576-AFTER-admin-reports-dark-mode.png'), fullPage: true });

    await page.close();
  }

  // ---- Mobile 390px ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await login(page, 'http://localhost:4200', 'owner@system.local');
    await page.goto('http://localhost:4200/admin/config-change-history');
    await page.locator('table.admin-table').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-576-AFTER-mobile-390px.png'), fullPage: true });
    await page.close();
    console.log('Mobile screenshot captured');
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
