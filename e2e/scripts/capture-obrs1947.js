// Standalone capture script for OBRS-1947 visual evidence (not a Playwright test).
//
// OBRS-1947 lifts the last three sub-12px font sizes in `src/app/shared/**` onto
// the `$font-size-xs` (12px) floor OBRS-640 set:
//   footer .sales-sub (only inside @media max-width:480px), .notification-inbox-footer,
//   .notification-row-timestamp.
//
// No backend: AuthService.isAuthenticated() is a pure localStorage check and the
// AuthGuard clears on role `admin`, so an addInitScript seeds the session and
// page.route('**/api/**') stubs every call. The footer lives on the public home
// page and needs no auth at all.
//
// The script also MEASURES getComputedStyle().fontSize on each target and writes
// it to measurements-<label>.json, so the evidence is not eyeball-only.
//
// Usage: node e2e/scripts/capture-obrs1947.js <baseUrl> <label>
//   e.g. node e2e/scripts/capture-obrs1947.js http://localhost:4299 AFTER
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const baseUrl = process.argv[2] || 'http://localhost:4299';
const label = (process.argv[3] || 'AFTER').toUpperCase();

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1947');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const NOW = '2026-09-17T09:30:00+07:00';
const NOTIFICATIONS = ok({
  content: [
    {
      id: 1,
      message: 'มีการจองใหม่ เส้นทาง กรุงเทพฯ - หนองจาก รอบ 08:00',
      notificationType: 'NOTIF_MSG_BOOKING_CREATED',
      channel: 'IN_APP',
      status: 'SENT',
      bookingScheduleId: 42,
      targetDate: '2026-09-18',
      sentAt: NOW,
      readAt: null,
      read: false,
    },
    {
      id: 2,
      message: 'รอบ 10:30 มีที่นั่งเหลือน้อยกว่า 5 ที่นั่ง',
      notificationType: 'NOTIF_MSG_SEAT_SCARCITY',
      channel: 'IN_APP',
      status: 'SENT',
      bookingScheduleId: 43,
      targetDate: '2026-09-18',
      sentAt: '2026-09-17T08:05:00+07:00',
      readAt: null,
      read: false,
    },
    {
      id: 3,
      message: 'คำขอคืนเงินของการจอง BK-000913 ได้รับการอนุมัติแล้ว',
      notificationType: 'NOTIF_MSG_REFUND_APPROVED',
      channel: 'IN_APP',
      status: 'SENT',
      bookingScheduleId: null,
      targetDate: null,
      sentAt: '2026-09-16T17:40:00+07:00',
      readAt: '2026-09-16T18:00:00+07:00',
      read: true,
    },
  ],
  totalElements: 12,
  totalPages: 4,
  size: 3,
  number: 0,
  numberOfElements: 3,
});

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const measurements = {};

async function measure(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return window.getComputedStyle(el).fontSize;
  }, selector);
}

async function shoot(locator, file) {
  await locator.screenshot({ path: path.join(ASSETS_DIR, file) });
  console.log(`saved ${file}`);
}

(async () => {
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'fake-admin-token-for-capture');
      localStorage.setItem('auth_username', 'admin@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    });

    // Catch-all FIRST, specifics after (Playwright: last-registered wins).
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
    );
    await page.route('**/private/notifications/unread-count**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ unreadCount: 2 })) })
    );
    await page.route('**/private/notifications?**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOTIFICATIONS) })
    );

    // ---------- footer (public page, no auth needed) ----------
    await page.goto(`${baseUrl}/how-to-book`, { waitUntil: 'networkidle' });
    const footer = page.locator('app-footer .sales-container').first();
    await footer.waitFor({ state: 'visible', timeout: 30000 });
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    measurements[`footer .sales-sub @${vp.name}`] = await measure(page, 'app-footer .sales-sub');
    measurements[`footer .sales-name @${vp.name}`] = await measure(page, 'app-footer .sales-name');
    await shoot(footer, `OBRS-1947-${label}-footer-${vp.name}.png`);

    // ---------- notification inbox (admin layout) ----------
    await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'networkidle' });
    const bell = page.locator('.notification-bell-trigger');
    await bell.waitFor({ state: 'visible', timeout: 30000 });
    await bell.click();
    const panel = page.locator('.notification-inbox-panel');
    await panel.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForSelector('.notification-inbox-footer', { timeout: 30000 });
    await page.waitForTimeout(400);
    measurements[`.notification-inbox-footer @${vp.name}`] = await measure(page, '.notification-inbox-footer');
    measurements[`.notification-row-timestamp @${vp.name}`] = await measure(page, '.notification-row-timestamp');
    await shoot(panel, `OBRS-1947-${label}-notification-inbox-${vp.name}.png`);

    await context.close();
  }

  await browser.close();

  const out = path.join(ASSETS_DIR, `measurements-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(measurements, null, 2));
  console.log(`\n${label} computed font-size:`);
  console.log(JSON.stringify(measurements, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
