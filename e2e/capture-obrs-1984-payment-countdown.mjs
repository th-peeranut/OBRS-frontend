/**
 * OBRS-1984 evidence — the /payment countdown must keep counting across a tab switch and a
 * refresh, driven by the booking's real `expiresAt` instead of a hardcoded 15 minutes.
 *
 *   npx ng serve --port 4200        # BEFORE and AFTER take turns: local dev CORS is pinned to 4200
 *   OBRS_OUT_DIR=... OBRS_LABEL=BEFORE node e2e/capture-obrs-1984-payment-countdown.mjs
 *
 * REAL BACKEND, REAL DATABASE — the same guest walk as the OBRS-1986 capture, shared from
 * `lib/guest-booking-flow.mjs` so the two cards' screenshots are of the same screen.
 *
 * The verdict is measured.json, not the PNGs: the countdown STRING is read off the live DOM at
 * each step and compared in seconds, so a screenshot that happens to look right cannot pass for
 * a countdown that actually restarted.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bookAsGuestToPayment } from './lib/guest-booking-flow.mjs';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1984');
const LABEL = process.env.OBRS_LABEL ?? 'RUN';
/** Long enough that a restart is unmistakable next to the tick, short enough to stay cheap. */
const DWELL_MS = Number(process.env.OBRS_DWELL_MS ?? 25000);

/** "14 : 57" / "14:57" / "" -> seconds, or null when the row is not rendered at all. */
const toSeconds = (label) => {
  if (!label) return null;
  const m = label.match(/(\d{1,2})\s*:\s*(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'th-TH' });
  const page = await context.newPage();
  const measured = { label: LABEL, base: BASE, at: new Date().toISOString(), dwellMs: DWELL_MS };

  await bookAsGuestToPayment(page, BASE, async (where) => {
    await writeFile(path.join(OUT, `${LABEL}-debug-${where}.txt`), await page.locator('body').innerText(), 'utf8');
    await page.screenshot({ path: path.join(OUT, `${LABEL}-debug-${where}.png`), fullPage: true });
  });

  /**
   * The two panels print the clock differently - the card panel labels it "เวลาที่เหลือ", the QR
   * panel prints the bare value next to a timer icon (`.qr-countdown span`). Reading only the
   * labelled form makes a tab switch look like "no countdown" and quietly turns the tab-switch
   * assertion into a no-op, so read whichever surface is mounted.
   */
  const readCountdown = async () => {
    const label = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      .match(/เวลาที่เหลือ\s*\d{1,2}\s*:\s*\d{2}/)?.[0] ?? null;
    if (label) return { label, seconds: toSeconds(label), from: 'card-panel' };
    const bare = await page.evaluate(() =>
      document.querySelector('.qr-countdown span, .countdown-value')?.textContent?.trim() ?? null);
    return { label: bare, seconds: toSeconds(bare), from: bare ? 'qr-panel' : 'not-rendered' };
  };
  const step = async (name, file) => {
    const c = await readCountdown();
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${file}.png`), fullPage: true });
    measured[name] = { ...c, storedExpiresAt: await page.evaluate(() => localStorage.getItem('active_booking_expires_at')) };
    return c.seconds;
  };

  const start = await step('onArrival', '1-arrival');
  await page.waitForTimeout(DWELL_MS);
  const afterDwell = await step('afterDwell', '2-after-dwell');

  // Tab switch: the panels are behind `@if`, so this DESTROYS one component and CREATES another.
  // A countdown seeded from a constant restarts here; one counting to a deadline does not.
  await page.getByRole('button', { name: 'ชำระเงินด้วย QR' }).click();
  await page.waitForTimeout(2500);
  const afterTabSwitch = await step('afterTabSwitch', '3-after-tab-switch');

  await page.getByRole('button', { name: /บัตรเครดิต/ }).click();
  await page.waitForTimeout(2500);
  await step('afterTabSwitchBack', '4-after-tab-switch-back');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const afterReload = await step('afterReload', '5-after-reload');

  // What the server actually holds, so the screen's number can be checked against a number
  // nothing on the page produced.
  measured.serverExpiresAt = await page.evaluate(async () => {
    const id = localStorage.getItem('active_booking_id');
    const token = localStorage.getItem('active_booking_payment_grant');
    if (!id || !token) return { error: 'no active booking in storage' };
    const r = await fetch(`http://localhost:8080/api/bookings/${id}`, { headers: { 'X-Guest-Payment-Token': token } });
    if (!r.ok) return { status: r.status };
    const d = (await r.json()).data;
    return { status: r.status, expiresAt: d.expiresAt, secondsLeft: Math.round((Date.parse(d.expiresAt) - Date.now()) / 1000) };
  });

  // The verdict, stated as a comparison rather than left to the reader of a PNG.
  measured.verdict = {
    countdownRestartedOnTabSwitch: start != null && afterTabSwitch != null && afterTabSwitch > afterDwell,
    countdownRestartedOnReload: start != null && afterReload != null && afterReload > afterDwell,
    screenVsServerSecondsDelta:
      afterReload != null && typeof measured.serverExpiresAt?.secondsLeft === 'number'
        ? afterReload - measured.serverExpiresAt.secondsLeft
        : null,
  };

  if (process.env.OBRS_CONTROLS === '1') {
    const payButtons = () => page.evaluate(() => Array.from(document.querySelectorAll('button'))
      .map((b) => ({ text: b.innerText.replace(/\s+/g, ' ').trim(), disabled: b.disabled }))
      .filter((b) => /ชำระเงิน|ยืนยันการชำระเงิน/.test(b.text)));

    // AC5 - a deadline already in the past must read 00:00 and must not let anyone pay.
    // Rewriting localStorage alone proves nothing: /payment refetches after a reload and
    // overwrites it with the live deadline. The wire is the only place to say "expired".
    await page.route('**/api/bookings/*', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.data) body.data.expiresAt = new Date(Date.now() - 60000).toISOString();
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    });
    await page.evaluate(() => localStorage.setItem('active_booking_expires_at', new Date(Date.now() - 60000).toISOString()));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-6-expired.png`), fullPage: true });
    measured.expiredHold = { ...(await readCountdown()), payButtons: await payButtons() };

    // The fallback the card asks to be deliberate: no deadline known. It must not invent one,
    // and it must NOT lock a customer out of a booking the server is still holding.
    //
    // Clearing the key alone would not test it - /payment refetches the booking after a reload
    // and re-persists the deadline. So strip the field from the wire too: that IS the window the
    // card describes, where the frontend is deployed and the backend is not yet.
    await page.unroute('**/api/bookings/*');
    await page.route('**/api/bookings/*', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.data) delete body.data.expiresAt;
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    });
    await page.evaluate(() => localStorage.removeItem('active_booking_expires_at'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-7-deadline-unknown.png`), fullPage: true });
    measured.deadlineUnknown = { ...(await readCountdown()), payButtons: await payButtons() };
  }

  await writeFile(path.join(OUT, `${LABEL}-measured.json`), JSON.stringify(measured, null, 2), 'utf8');
  console.log(JSON.stringify(measured, null, 2));
  await browser.close();
};

run().catch((e) => { console.error('CAPTURE FAILED:', e.message); process.exit(1); });
