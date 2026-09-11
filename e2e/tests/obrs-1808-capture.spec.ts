import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1808 evidence capture — see playwright.obrs1808capture.config.ts for how to run it.
 *
 * Every shot asserts what it is supposed to show BEFORE shooting it, because a screenshot of a
 * page that silently failed to render is indistinguishable from proof.
 *
 * The BEFORE half is NOT in this file. It is shot by running an equivalent, uncommitted spec from
 * a second worktree checked out at `origin/dev`, against the same fixture below — same parcel,
 * same stubs, only the code differs. Keeping it here would mean committing a spec that asserts
 * the old DOM and fails on this branch from the moment it lands.
 *
 * Screenshots land in e2e-evidence/ (gitignored), are uploaded to the card, then deleted.
 */

const ASSETS = 'e2e-evidence/obrs-1808';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/** The live config the modal's clause 3 has to interpolate — a literal there would be OBRS-564. */
const PARCEL_POLICY = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

/**
 * The same parcel in every shot. `collectionToken` is deliberately still in the payload: the API
 * still returns it (the `collect` endpoint accepts it, ADR-0073 §5) and the claim this card makes
 * is that the PAGE stops rendering it — a fixture that omitted the field would prove nothing.
 */
const WAYBILL = {
  trackingNumber: 'P-ABCDEFGHJK',
  sender: { name: 'สมชาย ใจดี', phone: '0801234567' },
  recipient: { name: 'สมศรี มีสุข', phone: '0819876543' },
  pickupStop: { slug: 'nong-chak', name: 'หนองชาก' },
  dropoffStop: { slug: 'mochit', name: 'หมอชิต' },
  weightKg: 12,
  amount: 200,
  departureAt: '17 ก.ย. 2569 08:30',
  collectionToken: 'v1.some-signed-per-parcel-value',
  leaveAtStopConsent: true,
};

async function openWaybill(page: Page): Promise<void> {
  await seedGateAdminSession(page, {
    username: 'staff@system.local',
    roles: ['salesperson'],
    language: 'th',
  });
  await page.route('**/api/parcel-policy', (route) => route.fulfill(ok(PARCEL_POLICY)));
  await page.route('**/api/private/parcels/1/waybill', (route) => route.fulfill(ok(WAYBILL)));
  await page.goto('/staff/parcels/1/waybill');
  await expect(page.locator('[data-testid="parcel-waybill-terms"]')).toBeVisible();
}

test.describe('OBRS-1808 — waybill readability', () => {
  test('AFTER-1: the screen carries ONE QR and a link, and the short terms are three lines', async ({ page }) => {
    await openWaybill(page);

    // The card's whole point: the recipient's collectionToken QR is gone. One QR remains and it
    // is the sender's public tracking link.
    await expect(page.locator('.parcel-waybill-paper .parcel-waybill-qr img')).toHaveCount(1);
    await expect(page.locator('.parcel-waybill-qr-for')).toHaveText('สำหรับผู้ส่ง');
    await expect(page.locator('[data-testid="parcel-waybill-terms-link"]')).toBeVisible();
    // Three clauses, three lines — the readability complaint this card came from.
    await expect(page.locator('.parcel-waybill-terms-list li')).toHaveCount(3);
    // And the OBRS-347 consent line still sits above the signature rule.
    await expect(page.locator('[data-testid="parcel-waybill-leave-consent"]')).toBeVisible();

    await page.screenshot({ path: `${ASSETS}/OBRS-1808-AFTER-1-waybill-screen.png`, fullPage: true });
  });

  test('AFTER-2: the link opens the full terms over the page, with the numbers from live config', async ({ page }) => {
    await openWaybill(page);
    await page.locator('[data-testid="parcel-waybill-terms-link"]').click();

    const modal = page.locator('[data-testid="parcel-waybill-terms-modal"]');
    await expect(modal).toBeVisible();
    // It is the /parcel-policy component, not a retyped copy: these three come from the stubbed
    // config above, and the prohibited list is the same one intake blocks on.
    await expect(modal).toContainText('100');
    await expect(modal).toContainText('28');
    await expect(modal).toContainText('500');
    await expect(modal.locator('[data-testid="parcel-policy-prohibited"] li')).toHaveCount(5);
    // No placeholder ever reaches a reader, and no page chrome is repeated inside the modal.
    await expect(modal).not.toContainText('{{');
    await expect(modal.locator('app-navbar')).toHaveCount(0);

    await page.screenshot({ path: `${ASSETS}/OBRS-1808-AFTER-2-terms-modal.png`, fullPage: true });
  });

  test('AFTER-3: the PRINTED copy keeps clause 10 QR — two QRs, no link', async ({ page }) => {
    // window.print() opens a native dialog that would hang the run. The portal it is fired from is
    // what this shot is of, and that portal is built before print() is ever called.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });
    await openWaybill(page);

    await page.getByRole('button', { name: 'พิมพ์' }).click();
    // ADR-0015's isolation is a PRINT-media rule: on screen the portal is in the DOM but hidden,
    // and the on-screen card is what is visible. Emulating print media is what makes this shot
    // the paper the sender actually signs rather than a screenshot of a hidden node.
    await page.emulateMedia({ media: 'print' });
    const portal = page.locator('.parcel-waybill-print-portal');
    await expect(portal).toBeVisible();

    // Clause 10 of the published terms requires the printed waybill to carry a QR to the full
    // version. Two here: the sender's tracking link and that one.
    await expect(portal.locator('.parcel-waybill-qr img')).toHaveCount(2);
    await expect(portal.locator('[data-testid="parcel-waybill-terms-link"]')).toHaveCount(0);
    await expect(portal.locator('.parcel-waybill-terms-list li')).toHaveCount(3);

    await portal.screenshot({ path: `${ASSETS}/OBRS-1808-AFTER-3-waybill-print.png` });
  });
});
