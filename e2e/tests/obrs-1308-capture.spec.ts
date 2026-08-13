import { test, expect, Page } from '@playwright/test';

/**
 * OBRS-1308 evidence capture — AC8. Runs against the same local stack as
 * obrs-1308-notification-message-override-qa.spec.ts. Screenshots land in e2e-evidence/
 * (gitignored) — where every other spec in this repo writes evidence — and are uploaded to the
 * Jira card from there, then deleted. A spec must never write into ANOTHER repository's working
 * tree, and a relative '../..' escape reaches the same place while looking portable; the e2e lane
 * gate refuses both. Not part of the committed regression suite.
 */

const OWNER_EMAIL = 'owner@system.local';
const ADMIN_EMAIL = 'admin@system.local';
const PASSWORD = 'P@ssw0rd';
const MESSAGE_CODE = 'notification.sms.schedule.delayed';
const LOCALE = 'en';

async function login(page: Page, email: string): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function dismissAlert(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
}

test('OBRS-1308 evidence capture', async ({ page, browser }) => {
  // ── BEFORE (reconstructed): the AFTER stack's own tab strip with the notification-messages tab
  // hidden via DOM removal, since spinning up a second full stack on origin/dev was out of budget
  // for this QA pass. Reconstructed from system-settings-tabs.ts's diff (this card adds exactly one
  // array entry — verified by reading the file), NOT a live origin/dev render. Labeled honestly in
  // the QA report as such.
  await login(page, OWNER_EMAIL);
  await page.goto('/admin/settings');
  await expect(page.locator('[data-testid="system-settings-tabs"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    document.querySelector('[data-testid="system-settings-tab-notification-messages"]')?.closest('li')?.remove();
  });
  await page.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-BEFORE-settings-tabs-reconstructed.png` });

  // Real AFTER tab strip (all 7 tabs including Notification Messages).
  await page.goto('/admin/settings');
  await expect(page.locator('[data-testid="system-settings-tab-notification-messages"]')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-AFTER-settings-tabs.png` });

  // ── AFTER 1: owner edit screen with a LIVE {n} validation error ──────────────────────────
  await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
  await expect(page.locator('[data-testid="notification-message-body"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="notification-message-body"]').fill('Trip delayed: {0} only — the {1} eta is gone.'.replace('{1}', '')); // drop {1}
  await page.locator('[data-testid="notification-message-save"]').click();
  await expect(page.locator('small.admin-error[role="alert"]').first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-AFTER-owner-edit-validation-error.png`, fullPage: true });

  // Submit a REAL valid proposal so the rest of the evidence chain has something to show.
  const marker = `EVID${Date.now()}`;
  await page.locator('[data-testid="notification-message-body"]').fill(
    `Trip delayed: booking {0}, revised departure {1}. Evidence marker ${marker}.`
  );
  await page.locator('[data-testid="notification-message-save"]').click();
  await expect(page.locator('[data-testid="notification-message-pending-banner"]')).toBeVisible({ timeout: 10_000 });

  // ── AFTER 2: admin bell/inbox with the pending review item ───────────────────────────────
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await login(adminPage, ADMIN_EMAIL);
  await adminPage.goto('/admin/dashboard');
  await adminPage.locator('.notification-bell-trigger').click();
  const inboxRow = adminPage.locator('.notification-row', { hasText: MESSAGE_CODE });
  await expect(inboxRow.first()).toBeVisible({ timeout: 15_000 });
  await adminPage.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-AFTER-admin-inbox-pending.png` });

  // ── AFTER 3: admin review screen showing the old <-> new diff ────────────────────────────
  await inboxRow.first().click();
  await adminPage.waitForURL((url) => /\/notification-messages\/reviews\/\d+/.test(url.pathname), { timeout: 15_000 });
  await expect(adminPage.locator('[data-testid="notification-message-review-approve"]')).toBeVisible({ timeout: 15_000 });
  await adminPage.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-AFTER-review-diff.png`, fullPage: true });

  // ── AFTER 4: result after approval (new text in effect) ──────────────────────────────────
  await adminPage.locator('[data-testid="notification-message-review-approve"]').click();
  await dismissAlert(adminPage);
  await expect(adminPage.locator('[data-testid="notification-message-review-approve"]')).toHaveCount(0, { timeout: 10_000 });
  await adminPage.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-AFTER-approved-result.png` });
  await adminCtx.close();

  // ── AFTER 5: SMS credit delta with a raised count and Save still enabled ─────────────────
  await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
  await expect(page.locator('[data-testid="notification-message-credit-panel"]')).toBeVisible({ timeout: 15_000 });
  const longBody = 'Trip delayed: {0} new eta {1}. Please check your ticket for full details before departure ฿.';
  await page.locator('[data-testid="notification-message-body"]').fill(longBody);
  await page.waitForTimeout(700);
  await expect(page.locator('[data-testid="notification-message-save"]')).toBeEnabled();
  await page.screenshot({ path: `e2e-evidence/obrs-1308/OBRS-1308-AFTER-sms-credit-delta.png`, fullPage: true });
});

/**
 * OBRS-1308 QA RE-RUN (Scope 1) - dedicated evidence for the AC2 defect that was reported and
 * then fixed: NotificationMessagePlaceholderException.getReason() returned the constant
 * "PLACEHOLDER_MISMATCH" for BOTH constructors, so an unbalanced-brace body (which clears the
 * missing/extra gate and fails only the MessageFormat compile, arriving with both index arrays
 * empty) hit the template's PLACEHOLDER_MISMATCH branch, had nothing to list, and rendered ZERO
 * visible error - the owner saw Save silently do nothing. Captures a real AFTER screenshot for
 * each of the four violation shapes, with the unmatched-brace case as the primary evidence
 * (it is the one that was broken). Assertions are NOT weakened versions of the QA spec's own
 * checks - same locator, same requirement that visible error text appears.
 */
test('OBRS-1308 re-run - AC2 four violation shapes each show a visible error (unmatched brace was the defect)', async ({ page }) => {
  await login(page, OWNER_EMAIL);
  await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
  await expect(page.locator('[data-testid="notification-message-body"]')).toBeVisible({ timeout: 15_000 });

  const cases: Array<{ name: string; body: string; file: string }> = [
    { name: 'missing placeholder', body: 'Trip delayed: {0} check your ticket.', file: 'OBRS-1308-AFTER-ac2-missing-index.png' },
    { name: 'extra placeholder', body: 'Trip delayed: {0} new eta {1} extra {2}.', file: 'OBRS-1308-AFTER-ac2-extra-index.png' },
    { name: 'renumbered placeholder', body: 'Trip delayed: {0} new eta {2}.', file: 'OBRS-1308-AFTER-ac2-renumbered-index.png' },
    { name: 'unbalanced brace (THE DEFECT)', body: 'Trip delayed: {0} new eta {1}. Unbalanced trailing brace: {', file: 'OBRS-1308-AFTER-ac2-unbalanced-brace.png' },
  ];

  for (const c of cases) {
    await page.locator('[data-testid="notification-message-body"]').fill(c.body);
    await page.locator('[data-testid="notification-message-save"]').click();
    await expect(page.locator('small.admin-error[role="alert"]').first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `e2e-evidence/obrs-1308/${c.file}`, fullPage: true });
    // Clear for the next case (avoid stale text carrying between screenshots).
    await page.locator('[data-testid="notification-message-body"]').fill('');
  }
});
