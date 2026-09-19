/**
 * The guest checkout walk, from the home page to /payment, driven through the real UI.
 *
 * Extracted from `capture-obrs-1986-payment-total-after-refresh.mjs` when OBRS-1984 needed the
 * identical walk to reach the same screen: two capture scripts that book differently would be
 * two scripts whose screenshots are not comparable, which is the one thing evidence must not be.
 *
 * Deliberately REAL - no `/api/**` is mocked. Both cards are about the payment screen disagreeing
 * with the server, so a stubbed response would prove nothing on either.
 */
export const ORIGIN = 'หนองชาก';
export const DESTINATION = 'บขส. หมอชิต (หมอชิต 2)';

/** The stop pickers are `input[role=combobox][aria-label]` over `a[role=option]` anchors. */
async function pickFromCombobox(page, label, optionText) {
  await page.getByRole('combobox', { name: label }).first().click({ timeout: 20000 });
  await page.getByRole('option', { name: optionText, exact: true }).first().click({ timeout: 15000 });
}

/** Label association is not guaranteed on every field here, so fall back to the label's own box. */
async function fillField(page, labelRe, value) {
  const byLabel = page.getByLabel(labelRe);
  if (await byLabel.count()) { await byLabel.first().fill(value); return; }
  const near = page.locator('label').filter({ hasText: labelRe }).first()
    .locator('xpath=ancestor-or-self::*[1]/following::input[1]');
  await near.fill(value, { timeout: 15000 });
}

/**
 * Books one adult, one way, and leaves the page on /payment.
 *
 * @param onDeadEnd called with a short reason when the walk cannot continue, so the caller can
 *   dump its own diagnostics before the throw - a capture that dies with a bare timeout tells
 *   you nothing about which screen it died on.
 */
export async function bookAsGuestToPayment(page, base, onDeadEnd = async () => {}) {
  await page.goto(base, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'เที่ยวเดียว' }).click();
  await pickFromCombobox(page, 'ต้นทาง', ORIGIN);
  await pickFromCombobox(page, 'ปลายทาง', DESTINATION);
  await page.getByRole('button', { name: 'ค้นหา' }).click();

  await page.waitForURL('**/schedule-booking', { timeout: 20000 });
  await page.waitForLoadState('networkidle');

  const choose = page.getByRole('button', { name: 'เลือก' }).first();
  const nextDay = page.getByRole('button', { name: /ดูรอบวัน/ }).first();
  // The seed carries no departure for today, so the results page opens on an empty "today" and
  // offers the nearest day that has one. Racing the two beats a fixed sleep on a page that
  // fetches twice.
  await choose.or(nextDay).waitFor({ timeout: 30000 });
  if (await nextDay.isVisible()) {
    await nextDay.click();
    await page.waitForLoadState('networkidle');
  }
  await choose.waitFor({ timeout: 30000 }).catch(async (e) => {
    await onDeadEnd('results');
    throw e;
  });
  await choose.click();

  await page.waitForURL('**/review-schedule-booking', { timeout: 20000 });
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();

  await page.waitForURL('**/passenger-info', { timeout: 20000 });
  await fillField(page, /ชื่อจริง/, 'สมชาย');
  await fillField(page, /นามสกุล/, 'ทดสอบ');
  await fillField(page, /หมายเลขโทรศัพท์/, '0812345678');
  // Passenger 1 carries its OWN required name - the PII that OBRS-903 keeps out of storage.
  // Copy the booker rather than retyping it.
  await page.getByText('ใช้ข้อมูลผู้จองเป็นผู้โดยสารคนนี้').first().click();
  await page.getByRole('button', { name: 'ถัดไป' }).click();

  const confirm = page.getByRole('button', { name: /ยืนยัน|ตกลง/ });
  if (await confirm.count()) await confirm.first().click({ timeout: 5000 }).catch(() => {});

  await page.waitForURL('**/payment', { timeout: 30000 }).catch(async (e) => {
    await onDeadEnd('passenger-info');
    throw e;
  });
  await page.waitForLoadState('networkidle');

  // The booking-saved modal lands on top of the payment panel and swallows clicks on the method
  // tabs. A capture that reloads first never meets it; one that interacts with the fresh page
  // does, so dismiss it here rather than in each caller.
  const ok = page.getByRole('button', { name: 'OK', exact: true });
  if (await ok.count()) {
    await ok.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}
