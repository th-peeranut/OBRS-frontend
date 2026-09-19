/**
 * OBRS-1986 evidence — the /payment summary must still show the REAL amount after a refresh.
 *
 *   # BEFORE (throwaway worktree detached at origin/dev) and AFTER (the fix branch) both
 *   # serve on 4200, one at a time: the local backend's dev CORS is pinned to :4200.
 *   npx ng serve --port 4200
 *   OBRS_OUT_DIR=... OBRS_LABEL=BEFORE node e2e/capture-obrs-1986-payment-total-after-refresh.mjs
 *
 * REAL BACKEND, REAL DATABASE. Unlike most capture scripts here this one does NOT mock
 * /api/**: the whole card is "the screen disagrees with what the server charges", so an
 * invented response would prove nothing. It books through the live guest flow against a
 * private local database (scripts/new-local-db.ps1), lands on /payment, shoots, RELOADS,
 * and shoots again.
 *
 * The verdict is measured.json, not the PNG: `totalText` is read off the live DOM after the
 * reload, so a blank or mis-clipped image cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bookAsGuestToPayment } from './lib/guest-booking-flow.mjs';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1986');
const LABEL = process.env.OBRS_LABEL ?? 'RUN';

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'th-TH' });
  const page = await context.newPage();
  const measured = { label: LABEL, base: BASE, at: new Date().toISOString() };

  page.on('console', (m) => { if (m.type() === 'error') (measured.consoleErrors ??= []).push(m.text()); });

  await bookAsGuestToPayment(page, BASE, async (where) => {
    await writeFile(path.join(OUT, `${LABEL}-debug-${where}.txt`), await page.locator('body').innerText(), 'utf8');
    await page.screenshot({ path: path.join(OUT, `${LABEL}-debug-${where}.png`), fullPage: true });
  });
  await page.screenshot({ path: path.join(OUT, `${LABEL}-1-payment-fresh.png`), fullPage: true });

  const readState = async () => ({
    url: page.url(),
    totalText: (await page.locator('body').innerText()).match(/รวมทั้งหมด[\s\S]{0,40}/)?.[0]?.replace(/\s+/g, ' ').trim() ?? null,
    hasAdultRow: await page.getByText(/ผู้ใหญ่\s*\d+\s*คน/).count() > 0,
    // Every button whose label mentions paying, with the state the DOM actually carries -
    // `.first()` alone once reported the stepper chip instead of the button that charges.
    payButtons: await page.evaluate(() => Array.from(document.querySelectorAll('button'))
      .map((b) => ({ text: b.innerText.replace(/\s+/g, ' ').trim(), disabled: b.disabled, cls: b.className }))
      .filter((b) => /ชำระเงิน|ยืนยัน/.test(b.text))),
    activeBookingId: await page.evaluate(() => localStorage.getItem('active_booking_id')),
  });
  measured.beforeReload = await readState();

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, `${LABEL}-2-payment-after-refresh.png`), fullPage: true });
  measured.afterReload = await readState();

  // What the server says it will actually charge, straight from the DB-backed API, so the
  // screen's number can be compared against a number nothing on the page produced.
  measured.serverNetAmount = await page.evaluate(async () => {
    const id = localStorage.getItem('active_booking_id');
    const token = localStorage.getItem('active_booking_payment_grant');
    if (!id || !token) return { error: 'no active booking in storage' };
    const r = await fetch(`http://localhost:8080/api/bookings/${id}`, { headers: { 'X-Guest-Payment-Token': token } });
    return { status: r.status, body: r.ok ? (await r.json()).data : await r.text() };
  });

  // Control cases, only worth running against a server that has the fix (OBRS_CONTROLS=1).
  if (process.env.OBRS_CONTROLS === '1') {
    const id = Number(measured.afterReload.activeBookingId);

    // AC2 - this booking's own grant must not read a DIFFERENT booking, and must not be
    // able to tell "not yours" from "no such booking".
    measured.controls = await page.evaluate(async (bookingId) => {
      const token = localStorage.getItem('active_booking_payment_grant');
      const call = async (path, headers) => {
        const r = await fetch(`http://localhost:8080/api/bookings/${path}`, { headers });
        return { status: r.status, body: (await r.text()).slice(0, 200) };
      };
      return {
        otherBookingWithMyToken: await call(bookingId - 1, { 'X-Guest-Payment-Token': token }),
        nonexistentBookingWithMyToken: await call(999999, { 'X-Guest-Payment-Token': token }),
        noTokenHeader: await call(bookingId, {}),
        garbageToken: await call(bookingId, { 'X-Guest-Payment-Token': 'not-a-jwt' }),
      };
    }, id);

    // AC6 - when the read cannot succeed, the button must be dead and say why.
    const realGrant = await page.evaluate(() => localStorage.getItem('active_booking_payment_grant'));
    await page.evaluate(() => localStorage.setItem('active_booking_payment_grant', 'not-a-jwt'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-3-total-unverifiable.png`), fullPage: true });
    measured.totalUnverifiable = {
      ...(await readState()),
      messageShown: await page.getByText(/ยังยืนยันยอดที่ต้องชำระไม่ได้/).count() > 0,
    };

    // The QR method is reached by a button that stays enabled, so prove the lock is on the
    // thing that COSTS money: asking for the PromptPay code is what creates the charge.
    // Record the ANSWER, not just the attempt: a POST the server refuses is a very different
    // thing from one it honours, and only the second one takes money.
    const chargeCalls = [];
    const collectCharges = (r) => {
      if (/\/api\/payments/.test(r.url())) chargeCalls.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
    };
    page.on('response', collectCharges);
    await page.getByRole('button', { name: 'ชำระเงินด้วย QR' }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-4-qr-lane-unverifiable.png`), fullPage: true });
    page.off('response', collectCharges);
    measured.qrLaneWhileUnverifiable = {
      // A COPY, deliberately: the array kept accumulating through the later steps and
      // JSON.stringify runs at the end, so a reference here reported charges that belong
      // to a different case entirely.
      paymentRequestsMade: [...chargeCalls],
      ...(await readState()),
      messageShown: await page.getByText(/ยังยืนยันยอดที่ต้องชำระไม่ได้/).count() > 0,
    };

    // Scrutinize finding 1: the QR lane is opened by a button that stays live, so a customer
    // can be inside it while the total is still in flight. Hold the read open for 2s and click
    // straight away - a guard that cannot re-arm leaves a silently empty QR panel forever.
    await page.evaluate((g) => localStorage.setItem('active_booking_payment_grant', g), realGrant);
    await page.route('**/api/bookings/*', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    await page.getByRole('button', { name: 'ชำระเงินด้วย QR' }).click({ timeout: 20000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-6-qr-clicked-mid-flight.png`), fullPage: true });
    measured.qrClickedWhileTotalInFlight = {
      ...(await readState()),
      qrImagePresent: await page.locator('img[src^="blob:"], img[alt*="QR"], .qr-image, [class*="qr"] img').count() > 0,
      messageShown: await page.getByText(/ยังยืนยันยอดที่ต้องชำระไม่ได้/).count() > 0,
    };
    await page.unroute('**/api/bookings/*');

    // The case AC6 actually exists for, and the only one that can cost money: the grant is
    // PERFECTLY VALID, so POST /api/payments would be honoured - but the amount could not be
    // read. Nothing may create a charge here.
    const chargeCallsUnderServerFailure = [];
    const collect = async (r) => {
      if (/\/api\/payments/.test(r.url())) {
        chargeCallsUnderServerFailure.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
      }
    };
    page.on('response', collect);
    await page.route('**/api/bookings/*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500}' }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'ชำระเงินด้วย QR' }).click({ timeout: 20000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-7-valid-grant-read-fails.png`), fullPage: true });
    measured.validGrantButReadFails = {
      ...(await readState()),
      paymentCalls: [...chargeCallsUnderServerFailure],
      messageShown: await page.getByText(/ยังยืนยันยอดที่ต้องชำระไม่ได้/).count() > 0,
    };
    page.off('response', collect);
    await page.unroute('**/api/bookings/*');

    // The signed-in lane. `getBooking` is sent only when there is NO session, so this is the
    // branch an authenticated customer lands on after a refresh. Flipping the stored token
    // exercises that branch directly (AuthGuard reads localStorage - see the sibling capture
    // scripts); it is NOT a full signed-in booking, and is reported as the branch test it is.
    await page.evaluate(() => {
      localStorage.setItem('active_booking_payment_grant', 'restored-later');
      localStorage.setItem('auth_token', 'fake.session.token');
      localStorage.setItem('auth_roles', JSON.stringify(['customer']));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-5-signed-in-branch.png`), fullPage: true });
    measured.signedInBranch = {
      ...(await readState()),
      messageShown: await page.getByText(/ยังยืนยันยอดที่ต้องชำระไม่ได้/).count() > 0,
    };
  }

  await writeFile(path.join(OUT, `${LABEL}-measured.json`), JSON.stringify(measured, null, 2), 'utf8');
  console.log(JSON.stringify(measured, null, 2));
  await browser.close();
};

run().catch(async (e) => { console.error('CAPTURE FAILED:', e.message); process.exit(1); });
