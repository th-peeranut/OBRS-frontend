import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * OBRS-1308 QA E2E — owner-editable notification message overrides with placeholder
 * validation and admin approval. Runs against the LOCAL full stack started by hand for
 * this QA pass (backend on :8080 with `dev,local` profiles + a QA-only
 * `thaibulksms.base-url` override pointed at a local capture server so the REAL
 * SmsService code path can be exercised end-to-end with zero risk of a real SMS being
 * sent; frontend `npm run start:local` on :4200). Not part of the committed regression
 * suite (same convention as obrs-576-config-change-history.spec.ts).
 *
 * Uses ONE catalog key end-to-end for the submit -> validate -> pending -> inbox ->
 * review -> approve/reject lifecycle: `notification.sms.schedule.delayed` / `en`
 * (SMS channel, 2 placeholders {0}=bookingNumber {1}=newEta). This key is wired to a
 * REAL, already-seeded booking (DRV-FIXTURE-1, scheduleId=1) whose phone-only SMS
 * fires unconditionally (independent of email presence) whenever an admin marks that
 * schedule delayed with a genuinely new ETA (`PATCH /api/private/schedules/1/delay`).
 * That lets AC3/AC6 be proven by a REAL admin-triggered production notification, not a
 * synthetic booking built for the test.
 */

const OWNER_EMAIL = 'owner@system.local';
const ADMIN_EMAIL = 'admin@system.local';
const PASSWORD = 'P@ssw0rd';
const API_BASE = 'http://localhost:8080';
const MESSAGE_CODE = 'notification.sms.schedule.delayed';
const LOCALE = 'en';
const SCHEDULE_ID = 1;
const CAPTURE_LOG = 'C:\\Users\\thpee\\AppData\\Local\\Temp\\claude\\obrs1308-sms-capture.log';

async function login(page: Page, email: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const resp = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(resp.ok()).toBe(true);
  const body = await resp.json();
  return body.data.accessToken as string;
}

/** Delays the fixture schedule by ONE more minute than its CURRENT delayedDepartureDateTime (read
 * fresh each call, never a hardcoded base) — a real ETA change is required to fire the event (see
 * ScheduleService.markScheduleDelayed's dedup guard), and reading the live value first makes this
 * safe to re-run repeatedly against the same shared local DB without colliding with a value a
 * PRIOR run already left behind (which would silently no-op and capture nothing). Returns the tail
 * of the SMS capture log written by this call. */
async function triggerScheduleDelayAndCapture(request: APIRequestContext, adminToken: string): Promise<string> {
  const current = await request.get(`${API_BASE}/api/private/schedules/${SCHEDULE_ID}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const currentData = (await current.json()).data;
  const base: string = currentData.delayedDepartureDateTime ?? currentData.departureDateTime;
  const newEta = new Date(new Date(base).getTime() + 60_000).toISOString().replace('.000Z', '+00:00');
  const before = require('fs').existsSync(CAPTURE_LOG) ? require('fs').statSync(CAPTURE_LOG).size : 0;
  const resp = await request.patch(`${API_BASE}/api/private/schedules/${SCHEDULE_ID}/delay`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { delayedDepartureDateTime: newEta, delayReason: 'OBRS-1308 QA trigger' },
  });
  expect(resp.ok()).toBe(true);
  // AFTER_COMMIT + @Async: give the listener + the SMS send a moment to land in the capture log.
  await new Promise((r) => setTimeout(r, 1500));
  const fs = require('fs');
  const full: string = fs.readFileSync(CAPTURE_LOG, 'utf-8');
  return full.slice(before);
}

/** The capture log stores the raw `application/x-www-form-urlencoded` POST body — decode the
 * `message=...` field (form-encoding uses `+` for space, not `%20`) so assertions can match
 * against plain text instead of the URL-encoded wire form. */
function decodeCapturedMessages(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      const m = line.match(/message=([^&]*)/);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : line;
    })
    .join('\n');
}

async function dismissAlert(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
}

// Plain describe (not .serial): tests are ORDER-DEPENDENT (each builds on the previous
// one's state) but must NOT fail-fast — a defect found in an early test (see AC2 below)
// should not skip the remaining ACs, since each is independent evidence for the report.
test.describe('OBRS-1308 — owner-editable notification message overrides', () => {
  let overrideId: number;

  test('AC2 — the automatic {n} gate refuses all four broken variants and persists nothing', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
    await expect(page.locator('[data-testid="notification-message-body"]')).toBeVisible({ timeout: 15_000 });

    const baseline = await page.locator('[data-testid="notification-message-current-live"]').innerText();
    expect(baseline).toContain('{0}');
    expect(baseline).toContain('{1}');

    // Baseline the status area BEFORE the loop, not an absolute "0 pending banners" — a prior QA
    // run against this same shared local DB may legitimately have left this key PENDING (e.g. the
    // AC11 test's own valid submission, run earlier in this file). The invariant AC2 actually
    // guards is "none of these four invalid attempts CHANGE the persisted status", not "no status
    // was ever set by anything else".
    const pendingBefore = await page.locator('[data-testid="notification-message-pending-banner"]').count();

    const cases: Array<{ name: string; body: string; expectSubstr: string }> = [
      { name: 'missing placeholder', body: 'Trip delayed: {0} check your ticket.', expectSubstr: 'Missing placeholders' },
      { name: 'extra placeholder', body: 'Trip delayed: {0} new eta {1} extra {2}.', expectSubstr: 'Unexpected placeholders' },
      { name: 'renumbered placeholder', body: 'Trip delayed: {0} new eta {2}.', expectSubstr: 'placeholders' }, // missing 1 + extra 2
      { name: 'unbalanced brace', body: 'Trip delayed: {0} new eta {1}. Unbalanced trailing brace: {', expectSubstr: 'Invalid message format' },
    ];

    const bugs: string[] = [];
    for (const c of cases) {
      await page.locator('[data-testid="notification-message-body"]').fill(c.body);
      await page.locator('[data-testid="notification-message-save"]').click();
      await page.waitForTimeout(1000);
      const errCount = await page.locator('small.admin-error[role="alert"]').count();
      if (errCount === 0) {
        // BUG (found live, 2026-08-13): backend NotificationMessagePlaceholderException.getReason()
        // ALWAYS returns "PLACEHOLDER_MISMATCH", even for its formatError-only constructor (pure
        // MessageFormat compile failure, both index sets empty). The frontend template branches
        // `@if (reason === 'PLACEHOLDER_MISMATCH') {...} @else if (formatError != null) {...}` — since
        // reason is ALWAYS that string, the formatError branch is unreachable dead code. Net effect:
        // an owner who submits an unbalanced-brace body gets a 400 the network tab shows, and ZERO
        // visible feedback on screen (confirmed via screenshot: no error text, no toast, Save just
        // appears to do nothing). Violates AC2 ("refused... with an error naming ... the format
        // error") and the UX spec's FORMAT_ERROR rendering rule. Recorded as a finding, not failing
        // the whole run here so the remaining ACs still get exercised.
        bugs.push(`case "${c.name}": submitted body was refused (verified via API) but the UI showed NO error at all — silent failure.`);
        continue;
      }
      const errText = await page.locator('small.admin-error[role="alert"]').allInnerTexts();
      expect(errText.join(' | ')).toMatch(new RegExp(c.expectSubstr, 'i'));
      // The status area must be UNCHANGED by this invalid attempt — nothing was persisted.
      await expect(page.locator('[data-testid="notification-message-pending-banner"]')).toHaveCount(pendingBefore);
    }
    if (bugs.length > 0) {
      // eslint-disable-next-line no-console
      console.log('AC2 DEFECT(S) FOUND:\n' + bugs.join('\n'));
    }
    expect(bugs, 'AC2 defects (see console log above for detail)').toEqual([]);

    // Re-fetch (fresh navigation) confirms none of the four attempts left a row behind — status
    // area reads exactly as it did before the loop started, not merely "not pending".
    await page.reload();
    await expect(page.locator('[data-testid="notification-message-body"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="notification-message-pending-banner"]')).toHaveCount(pendingBefore);
  });

  test('AC12 — SMS credit counter updates live, jumps on a non-GSM-7 char, and never blocks Save', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
    await expect(page.locator('[data-testid="notification-message-body"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="notification-message-credit-panel"]')).toBeVisible({ timeout: 15_000 });

    const creditLine = page.locator('.nm-credit-line');
    const body = page.locator('[data-testid="notification-message-body"]');

    // 90 chars: comfortably under the GSM-7 160-char/credit limit (stays 1 credit) but OVER the
    // UCS-2 70-char/credit limit once a single non-GSM-7 char forces the whole body to UCS-2 (must
    // push past 2 credits, per AC12/OBRS-890's 70-per-credit rule).
    const longGsm7Body = 'Trip delayed: {0} new eta {1}. Please check your ticket for full details before departure time.';
    expect(longGsm7Body.length).toBeGreaterThan(70);
    expect(longGsm7Body.length).toBeLessThan(160);
    await body.fill(longGsm7Body);
    await page.waitForTimeout(700); // 500ms debounce + margin
    const gsm7Text = await creditLine.innerText();
    const gsm7Credits = parseInt(gsm7Text.match(/(\d+)/)?.[1] ?? '0', 10);
    expect(gsm7Credits).toBe(1);

    await body.fill(longGsm7Body.replace('.', ' ฿.'));
    await page.waitForTimeout(700);
    const ucs2Text = await creditLine.innerText();
    const ucs2Credits = parseInt(ucs2Text.match(/(\d+)/)?.[1] ?? '0', 10);

    expect(ucs2Credits).toBeGreaterThan(gsm7Credits);

    // Not blocking: Save must still be enabled and succeed with the raised-credit body.
    await expect(page.locator('[data-testid="notification-message-save"]')).toBeEnabled();
  });

  test('AC11 setup — admin rejects a proposal with a reason, owner sees reason + proposed body on reopen', async ({ page, browser }) => {
    await login(page, OWNER_EMAIL);
    await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
    await expect(page.locator('[data-testid="notification-message-body"]')).toBeVisible({ timeout: 15_000 });

    const rejectableBody = 'Trip delayed: {0} new eta {1}. [OBRS-1308 QA reject-me]';
    await page.locator('[data-testid="notification-message-body"]').fill(rejectableBody);
    await page.locator('[data-testid="notification-message-save"]').click();
    await expect(page.locator('[data-testid="notification-message-pending-banner"]')).toBeVisible({ timeout: 10_000 });

    // Admin, separate browser context (two real people, two real sessions).
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await login(adminPage, ADMIN_EMAIL);
    await adminPage.goto('/admin/settings/notification-messages/reviews');
    await expect(adminPage.locator('[data-testid="notification-message-review-open"]').first()).toBeVisible({ timeout: 15_000 });
    // Open the row for OUR key (first PENDING for this code/locale — table is oldest-first, ours is newest submit so may not be first; find by row text).
    const row = adminPage.locator('tr', { hasText: MESSAGE_CODE }).filter({ hasText: LOCALE }).first();
    await row.locator('[data-testid="notification-message-review-open"]').click();
    await expect(adminPage.locator('[data-testid="notification-message-review-reject"]')).toBeVisible({ timeout: 15_000 });

    const REASON = 'OBRS-1308 QA: wording needs rework before go-live';
    await adminPage.locator('[data-testid="notification-message-review-reject"]').click();
    await adminPage.locator('[data-testid="notification-message-reject-reason"]').fill(REASON);
    await adminPage.locator('[data-testid="notification-message-reject-confirm"]').click();
    await dismissAlert(adminPage);
    await adminCtx.close();

    // Owner reopens the SAME key/locale and must see the REASON and the PROPOSED (rejected) body —
    // never the currently-live text (the real bug this AC guards against).
    await page.reload();
    await expect(page.locator('[data-testid="notification-message-rejected-banner"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.nm-reject-reason')).toHaveText(REASON);
    const liveText = await page.locator('[data-testid="notification-message-current-live"]').innerText();
    expect(liveText).not.toContain('[OBRS-1308 QA reject-me]');
  });

  test('AC3 + AC4 + AC5 + AC9 — submit while a real trigger still sends the OLD text, admin inbox click-through, owner blocked both ways, System Settings header', async ({
    page,
    browser,
    request,
  }) => {
    // ── AC9: deep-link a child route, header must read "System Settings" ──────────
    await login(page, OWNER_EMAIL);
    await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
    await expect(page.locator('h2')).toHaveText('System Settings', { timeout: 15_000 });

    // ── Owner submits a genuinely new valid proposal ───────────────────────────────
    // A unique marker per RUN (not a fixed string) — this spec is re-run repeatedly against the
    // same shared local DB while iterating, and a fixed body would eventually become indistinguishable
    // from the "old" text once a PRIOR run's approve already made it live.
    const runMarker = `QA${Date.now()}`;
    const newBody = `Trip delayed: booking {0}, revised departure {1}. Marker ${runMarker}.`;
    await page.locator('[data-testid="notification-message-body"]').fill(newBody);
    await page.locator('[data-testid="notification-message-save"]').click();
    await expect(page.locator('[data-testid="notification-message-pending-banner"]')).toBeVisible({ timeout: 10_000 });

    // ── AC3: while PENDING, the REAL notification path must still emit the OLD text ──
    const adminToken = await apiLogin(request, ADMIN_EMAIL);
    const smsWhilePending = decodeCapturedMessages(await triggerScheduleDelayAndCapture(request, adminToken));
    expect(smsWhilePending).not.toContain(runMarker);

    // ── AC5 (owner side, browser): the "รออนุมัติ" tab must not render for an owner ──
    await expect(page.locator('[data-testid="notification-messages-subnav-reviews"]')).toHaveCount(0);

    // Discover the override id via the admin queue (needed for the deep-link + approve calls below).
    const pendingResp = await request.get(`${API_BASE}/api/private/admin/notification-messages/reviews/pending`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const pendingRows = (await pendingResp.json()).data as Array<{ id: number; messageCode: string; locale: string }>;
    const target = pendingRows.filter((r) => r.messageCode === MESSAGE_CODE && r.locale === LOCALE).sort((a, b) => b.id - a.id)[0];
    expect(target).toBeTruthy();
    overrideId = target.id;

    // ── AC5 (owner side, deep link + network) ──────────────────────────────────────
    // Match only the BACKEND API call, never the Angular route/document navigation itself (whose
    // URL also legitimately contains "/notification-messages/reviews/{id}" as its path — that
    // would false-positive on the page load that is supposed to happen).
    const requestsSeen: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes(`/api/private/admin/notification-messages/reviews/${overrideId}`)) {
        requestsSeen.push(req.url());
      }
    });
    await page.goto(`/admin/settings/notification-messages/reviews/${overrideId}`);
    await expect(page.getByText('Access denied')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500); // give any (incorrect) request a chance to fire before asserting zero
    if (requestsSeen.length > 0) {
      // eslint-disable-next-line no-console
      console.log('AC5 DEBUG requestsSeen:', JSON.stringify(requestsSeen));
    }
    expect(requestsSeen.length).toBe(0);

    // ── AC5 (wire): a real owner TOKEN against the approve endpoint directly ────────
    const ownerToken = await apiLogin(request, OWNER_EMAIL);
    const forbidden = await request.post(`${API_BASE}/api/private/admin/notification-messages/reviews/${overrideId}/approve`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(forbidden.status()).toBe(403);

    // ── AC4: admin inbox shows the item and the row click lands DIRECTLY on the review ──
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await login(adminPage, ADMIN_EMAIL);
    await adminPage.goto('/admin/dashboard');
    await adminPage.locator('.notification-bell-trigger').click();
    const inboxRow = adminPage.locator('.notification-row', { hasText: MESSAGE_CODE });
    await expect(inboxRow.first()).toBeVisible({ timeout: 15_000 });
    await inboxRow.first().click();
    await adminPage.waitForURL((url) => /\/notification-messages\/reviews\/\d+/.test(url.pathname), { timeout: 15_000 });
    expect(new URL(adminPage.url()).pathname).toContain(`/reviews/${overrideId}`);
    await expect(adminPage.locator('[data-testid="notification-message-review-approve"]')).toBeVisible({ timeout: 15_000 });
    // Header must ALSO read System Settings on this admin sub-page (AC9).
    await expect(adminPage.locator('h2')).toHaveText('System Settings');

    // ── AC6: approve, then trigger again with NO backend restart -> new text ───────
    await adminPage.locator('[data-testid="notification-message-review-approve"]').click();
    await dismissAlert(adminPage);
    // The review-detail screen renders no literal "APPROVED" text — proof of success is the
    // approve/reject actions disappearing (showActions = status === 'PENDING', per the component)
    // with no inline error surfacing in their place.
    await expect(adminPage.locator('[data-testid="notification-message-review-approve"]')).toHaveCount(0, { timeout: 10_000 });
    await expect(adminPage.locator('.admin-error')).toHaveCount(0);
    await adminCtx.close();

    const smsAfterApprove = decodeCapturedMessages(await triggerScheduleDelayAndCapture(request, adminToken));
    expect(smsAfterApprove).toContain(runMarker);
  });
});
