import { expect, Page, test } from '@playwright/test';
import {
  expectNoEscapedGateCalls,
  seedGateAdminSession,
} from '../support/gate-admin-session';

/**
 * OBRS-1550 evidence - see playwright.obrs1550capture.config.ts for how to run it.
 *
 * Same shape as playwright.obrs1572capture.config.ts: every /api/** call is answered
 * here, so nothing reaches a backend and the pictures are reproducible on a cold box.
 *
 * The card's AC-5 asks for two AFTER states, and they are two different code paths,
 * not two views of one:
 *
 *   RISE  - the panel goes red AND a modal stops the submit until it is acknowledged.
 *   FALL  - byte-for-byte the old behaviour: no modal, the submit goes straight out.
 *
 * The fall case is the one worth capturing, because "no modal" is only evidence if the
 * same run also shows the modal appearing when it should. Both shots therefore come out
 * of one spec file against one stack.
 *
 * The credit figures are FIXTURES, not a real estimate: `SmsCreditCalculator` runs on
 * the backend and this lane has none. What is under test here is what the frontend does
 * with a rise/fall, which is the whole of this card - the arithmetic itself is OBRS-1308's
 * and is not re-litigated.
 */

const ASSETS = 'e2e-evidence/obrs-1550';
const MESSAGE_CODE = 'notification.sms.payment.confirmed';
const LOCALE = 'th';

const BASELINE_BODY = 'การจอง {0} ยืนยันแล้ว ออก {1} ขอบคุณที่ใช้บริการ';

function keyPayload(credits: number, baselineCredits: number) {
  return {
    code: 200,
    message: 'OK',
    data: {
      messageCode: MESSAGE_CODE,
      notificationType: 'PAYMENT_CONFIRMED',
      channels: ['SMS'],
      sampleArgs: ['{0}=BK-00123', '{1}=15 Aug 2026 08:00'],
      locales: {
        th: {
          baseline: BASELINE_BODY,
          liveBody: BASELINE_BODY,
          status: 'NONE',
          rejectReason: null,
          placeholderIndices: [0, 1],
          creditEstimate: { credits, baselineCredits, encoding: 'UCS2' },
        },
      },
    },
  };
}

/** Answers the detail GET and the debounced credit-preview POST for one scenario. */
async function stubEditScreen(page: Page, credits: number, baselineCredits: number): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith(`/private/admin/notification-messages/${encodeURIComponent(MESSAGE_CODE)}`),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(keyPayload(credits, baselineCredits)),
      })
  );

  await page.route(
    (url) => url.pathname.endsWith('/credit-preview'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'OK',
          data: { credits, baselineCredits, encoding: 'UCS2' },
        }),
      })
  );
}

test.describe('OBRS-1550 - a credit RISE is red and must be acknowledged; a FALL is untouched', () => {
  test('AFTER: rise - red panel and the confirm modal', async ({ page }) => {
    await seedGateAdminSession(page, { language: 'th' });
    // 1 -> 2 credits: the smallest rise the calculator can report, and the exact
    // shape the Thai baselines are 3-7 characters away from (see the card).
    await stubEditScreen(page, 2, 1);

    await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
    await expect(page.locator('[data-testid="notification-message-credit-panel"]')).toBeVisible({
      timeout: 15_000,
    });

    // The red is asserted, not eyeballed: a screenshot of the wrong colour still looks
    // like a screenshot.
    const line = page.locator('.nm-credit-line');
    await expect(line).toHaveClass(/is-danger/);
    await expect(line).not.toHaveClass(/is-warning/);

    // The class alone would still pass if `.is-danger` mapped to the wrong var, so
    // read what the pixel actually is and compare it to the two tokens by name. Both
    // sides come out of the live cascade, so this cannot drift from the theme file.
    // The tokens are declared on `.admin-shell`, not `:root` (see
    // admin-modal-backdrop.directive.ts), so both the value and the probe have to be
    // resolved from inside that shell -- reading them off documentElement yields ''.
    const colours = await line.evaluate((el) => {
      const own = getComputedStyle(el);
      const read = (name: string) => {
        const probe = document.createElement('span');
        probe.style.color = own.getPropertyValue(name).trim();
        el.parentElement!.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return { actual: own.color, danger: read('--admin-danger-fg'), warning: read('--admin-warning-fg') };
    });
    expect(colours.actual).toBe(colours.danger);
    expect(colours.actual).not.toBe(colours.warning);
    await page.screenshot({ path: `${ASSETS}/OBRS-1550-AFTER-rise-red-panel.png`, fullPage: true });

    await page.locator('[data-testid="notification-message-body"]').fill(`${BASELINE_BODY} เดินทางปลอดภัย`);
    await page.locator('[data-testid="notification-message-save"]').click();

    const dialog = page.locator('[data-testid="notification-message-credit-rise-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="notification-message-credit-rise-figures"]')).toContainText('2');
    await page.screenshot({ path: `${ASSETS}/OBRS-1550-AFTER-rise-confirm-modal.png`, fullPage: true });

    // AC-3: cancelling submits nothing and leaves the typed text where it was.
    await page.locator('[data-testid="notification-message-credit-rise-cancel"]').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-testid="notification-message-body"]')).toHaveValue(
      `${BASELINE_BODY} เดินทางปลอดภัย`
    );
    await page.screenshot({ path: `${ASSETS}/OBRS-1550-AFTER-rise-cancelled-text-kept.png`, fullPage: true });

    expectNoEscapedGateCalls(page);
  });

  test('AFTER: fall - no modal, the submit goes straight out', async ({ page }) => {
    await seedGateAdminSession(page, { language: 'th' });
    await stubEditScreen(page, 1, 2);

    // Same path serves two calls: the POST this test is about, and the GET the
    // store fires from `refresh()` right after a successful submit. Both are
    // answered here — an unanswered GET reaches the catch-all and would fail the
    // run through `expectNoEscapedGateCalls` with nothing to do with this card.
    let submitted = false;
    await page.route(
      (url) => url.pathname.endsWith('/private/admin/notification-messages'),
      (route) => {
        const isPost = route.request().method() === 'POST';
        submitted = submitted || isPost;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, message: 'OK', data: isPost ? null : [] }),
        });
      }
    );

    await page.goto(`/admin/settings/notification-messages/edit/${MESSAGE_CODE}/${LOCALE}`);
    await expect(page.locator('[data-testid="notification-message-credit-panel"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.nm-credit-line')).toHaveClass(/is-success/);

    await page.locator('[data-testid="notification-message-body"]').fill('การจอง {0} ออก {1}');
    await page.locator('[data-testid="notification-message-save"]').click();

    await expect(page.locator('[data-testid="notification-message-pending-banner"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="notification-message-credit-rise-dialog"]')).toHaveCount(0);
    expect(submitted).toBe(true);

    // Dismiss the success toast first: it is SweetAlert2 over the whole page, and a
    // shot taken under it shows the toast rather than the thing being evidenced.
    const toast = page.locator('.swal2-container');
    await toast.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
    await toast.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
    await page.screenshot({ path: `${ASSETS}/OBRS-1550-AFTER-fall-no-modal.png`, fullPage: true });

    expectNoEscapedGateCalls(page);
  });
});
