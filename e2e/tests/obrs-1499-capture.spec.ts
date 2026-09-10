import { expect, Page, test } from '@playwright/test';
import { Harness, openCancelModal, pickBank, resumeTyping, seed } from '../support/refund-destination-modal';

/**
 * OBRS-1499 AC-6 — the account-number field before and after a bank exists.
 *
 * Two states are the whole card, and neither can be read off a unit test: the
 * field SHUT with a reason printed under it, and the same field OPEN the moment
 * a bank is chosen. The run then types a number and posts, so the evidence also
 * shows the gate does not cost the card it came from (OBRS-1465): grouping
 * still happens per bank, and bare digits still leave the browser.
 *
 * Hermetic on the gate lane's terms — fixtures, routes and the path into the
 * modal come from `../support/refund-destination-modal`, so no backend, no
 * database, no SIT.
 */

/** The literal prefix is not a style choice: scripts/check-e2e-lanes.mjs reads
 * the path out of the source, so a variable here reads as an escape hatch. */
const shoot = async (page: Page, file: string) => {
  await page.locator('.crdm-modal').screenshot({ path: `e2e-evidence/OBRS-1499/${file}` });
};

test('OBRS-1499 AFTER: the account-number field waits for a bank, then opens', async ({ page }) => {
  const harness: Harness = await seed(page, 'obrs-1499-capture-token');
  await page.goto('/my-bookings');
  await openCancelModal(page);

  const field = page.locator('#rdf-account-number');
  const hint = page.locator('.rdf-hint');

  // 1. AC-1 + AC-2: shut, and saying why. A grey box with no reason on it is
  //    the failure this card's AC-2 exists to stop.
  await expect(field).toBeDisabled();
  await expect(hint).toBeVisible();
  await shoot(page, 'OBRS-1499-AFTER-1-locked-until-a-bank-is-chosen.png');

  // 2. The bank lands and the field opens; the reason has nothing left to say.
  await pickBank(page, 'ธนาคารกสิกรไทย');
  await expect(field).toBeEnabled();
  await expect(hint).toHaveCount(0);
  await shoot(page, 'OBRS-1499-AFTER-2-open-after-the-bank.png');

  // 3. AC-3: the gate did not cost OBRS-1465 anything — the number still groups
  //    per bank as it is typed.
  await resumeTyping(page);
  await field.pressSequentially('1480622621', { delay: 40 });
  await expect(field).toHaveValue('148-0-62262-1');
  await shoot(page, 'OBRS-1499-AFTER-3-still-groups-per-bank.png');

  // 4. Changing the bank afterwards regroups what is typed and does NOT clear
  //    it — the half of AC-3 a screenshot of one bank cannot carry.
  await pickBank(page, 'ธนาคารออมสิน');
  await expect(field).toHaveValue('1-480622621');
  await shoot(page, 'OBRS-1499-AFTER-4-bank-change-keeps-the-digits.png');

  // And the wire: bare digits still leave the browser, with the bank the user
  // last chose. Read off the POST body, not off the form.
  await pickBank(page, 'ธนาคารกสิกรไทย');
  await page.locator('#rdf-account-name').fill('สมชาย ใจดี');
  await page.locator('.crdm-actions .btn-primary').click();
  await expect.poll(() => harness.posted.length).toBe(1);
  expect(harness.posted[0]['accountNumber']).toBe('1480622621');
  expect(harness.posted[0]['bank']).toBe('004');
});
