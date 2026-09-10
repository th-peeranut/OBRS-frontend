import { expect, test } from '@playwright/test';
import { Harness, openCancelModal, pickBank, resumeTyping, seed } from '../support/refund-destination-modal';

/**
 * OBRS-1465 AC-5 — the account-number field showing its dashes, caught MID-TYPING.
 *
 * The owner ruled on 2026-08-21 for option 1, group per bank, so the evidence
 * has to show two banks side by side or it proves nothing that a bank-agnostic
 * rule would not also prove: กสิกรไทย (BOT 004) takes the 10-digit convention
 * 148-0-62262-1, ออมสิน (BOT 030) takes its own 12-digit 0-5459005667-4.
 *
 * The fixtures and the path into the modal live in
 * `../support/refund-destination-modal`; they came from this file and moved
 * there when OBRS-1499 needed the same ones.
 *
 * OBRS-1499 also changed what this run can do FIRST: the field is disabled
 * until a bank is chosen, so the opening shot picks กสิกรไทย before typing
 * rather than typing into an empty-bank form, which is a state the browser can
 * no longer reach.
 *
 * Typing goes through `pressSequentially`, not `fill`: `fill` sets the value in
 * one shot and would never exercise the per-keystroke regrouping this card is
 * about.
 */

/** The literal prefix is not a style choice: scripts/check-e2e-lanes.mjs reads
 * the path out of the source, so a variable here reads as an escape hatch. */
const shoot = async (page: import('@playwright/test').Page, file: string) => {
  await page.locator('.crdm-modal').screenshot({ path: `e2e-evidence/OBRS-1465/${file}` });
};

test('OBRS-1465 AFTER: the dashes appear as the digits are typed, per bank', async ({ page }) => {
  const harness: Harness = await seed(page, 'obrs-1465-capture-token');
  await page.goto('/my-bookings');
  await openCancelModal(page);

  const field = page.locator('#rdf-account-number');

  // 1. กสิกรไทย, the 10-digit convention: mid-typing at 5 of 10 digits, the
  //    field already counting for you.
  await pickBank(page, 'ธนาคารกสิกรไทย');
  await resumeTyping(page);
  await field.pressSequentially('14806', { delay: 60 });
  await expect(field).toHaveValue('148-0-6');
  await shoot(page, 'OBRS-1465-AFTER-1-mid-typing-kbank.png');

  // 2. Still mid-typing, now at 9 of 10 digits.
  await resumeTyping(page);
  await field.pressSequentially('2262', { delay: 40 });
  await expect(field).toHaveValue('148-0-62262');
  await shoot(page, 'OBRS-1465-AFTER-2-kbank-mid-typing.png');

  // 3. The last digit lands and the number is complete.
  await resumeTyping(page);
  await field.pressSequentially('1', { delay: 40 });
  await expect(field).toHaveValue('148-0-62262-1');
  await shoot(page, 'OBRS-1465-AFTER-3-kbank-complete.png');

  // 4. ออมสิน groups differently, and switching bank regroups what is already
  //    typed — the whole reason option 1 was chosen over a flat every-N rule.
  await field.clear();
  await pickBank(page, 'ธนาคารออมสิน');
  await resumeTyping(page);
  await field.pressSequentially('054590056674', { delay: 30 });
  await expect(field).toHaveValue('0-5459005667-4');
  await shoot(page, 'OBRS-1465-AFTER-4-gsb-twelve-digits.png');

  // 5. AC-3: a number pasted with its dashes already in it is accepted, and the
  //    displayed dashes are OURS, not the ones that were pasted.
  await field.clear();
  await pickBank(page, 'ธนาคารกสิกรไทย');
  await field.fill('148-0-62262-1');
  await expect(field).toHaveValue('148-0-62262-1');
  await shoot(page, 'OBRS-1465-AFTER-5-pasted-with-dashes.png');

  // AC-2, and the half no screenshot can show: what leaves the browser is bare
  // digits. Asserted off the WIRE, not off the form, because the request body is
  // the thing that reaches manual_refund_requests.destination_account_number.
  await page.locator('#rdf-account-name').fill('สมชาย ใจดี');
  await page.locator('.crdm-actions .btn-primary').click();
  await expect.poll(() => harness.posted.length).toBe(1);
  expect(harness.posted[0]['accountNumber']).toBe('1480622621');
  expect(harness.posted[0]['bank']).toBe('004');
});
