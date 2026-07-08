# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\my-bookings-reschedule.spec.ts >> My Bookings — Reschedule (OBRS-83) >> AC7: NO_SEATS bounces back to the options list with an inline error, spinner not stuck
- Location: e2e\tests\my-bookings-reschedule.spec.ts:210:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.reschedule-modal').locator('.reschedule-options-list__state')
Expected pattern: /no longer available/i
Timeout: 45000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 45000ms
  - waiting for locator('.reschedule-modal').locator('.reschedule-options-list__state')

```

```yaml
- link "Logo":
  - /url: /
  - img "Logo"
- link "How to book and pay":
  - /url: /how-to-book
- button "Contact us"
- button "Toggle dark mode": dark_mode
- button "Language": language English expand_more
- button "Open profile menu": CU
- heading "My Bookings" [level=1]
- paragraph: View your trips and cancel a booking if your plans change.
- navigation "status filter":
  - button "All"
  - button "Confirmed"
  - button "Pending"
  - button "Cancelled"
  - button "Expired"
- article:
  - text: Booking No.
  - strong: B-74DW6T
  - text: Confirmed  Nong chak → Bts mo chit One way
  - term: Departure
  - definition: 9 Jul 2026 • 21:00
  - term: Passengers
  - definition: "0"
  - term: Total
  - definition: ฿200.00
  - button " View e-ticket"
  - button "Cancel booking"
  - button "Reschedule"
- article:
  - text: Booking No.
  - strong: B-P4HPH6
  - text: Confirmed  Nong chak → Bts mo chit One way
  - term: Departure
  - definition: 17 Jul 2026 • 15:00
  - term: Passengers
  - definition: "0"
  - term: Total
  - definition: ฿200.00
  - button " View e-ticket"
  - button "Cancel booking"
  - button "Reschedule"
- article:
  - text: Booking No.
  - strong: B-X3F5ML
  - text: Confirmed  Nong chak → Bts mo chit One way
  - term: Departure
  - definition: 9 Jul 2026 • 21:00
  - term: Passengers
  - definition: "0"
  - term: Total
  - definition: ฿200.00
  - button " View e-ticket"
  - button "Cancel booking"
  - button "Reschedule"
- article:
  - text: Booking No.
  - strong: DRV-FIXTURE-1
  - text: Confirmed  Nong chak → Mo chit 2 bus terminal One way
  - term: Departure
  - definition: 20 Dec 2026 • 08:00
  - term: Passengers
  - definition: "0"
  - term: Total
  - definition: ฿1,600.00
  - button " View e-ticket"
  - button "Cancel booking"
  - button "Reschedule"
- article:
  - text: Booking No.
  - strong: B-RDE6PG
  - text: Cancelled  Nong chak → Bts mo chit One way
  - term: Departure
  - definition: 9 Jul 2026 • 15:00
  - term: Passengers
  - definition: "0"
  - term: Total
  - definition: ฿200.00
  - text: Cannot be cancelled
  - button "Reschedule" [disabled]
- dialog:
  - button "Close": 
  - heading "Reschedule your trip" [level=2]
  - list:
    - listitem:
      - 'radio "15:00 – 17:25 van ฿200.00 Seats: 13" [checked]'
- img "Logo"
- text: NJ Phuyaipu Online bus ticket booking Head office location 3/5 Moo 3, Nong Chak Subdistrict, Ban Bueng District, Chonburi 20170 Ticket sales points
- link "Location Icon Nong Chak Ban Bueng District, Chonburi":
  - /url: https://maps.app.goo.gl/ud32xFp5EPmAGszd9
  - img "Location Icon"
  - text: Nong Chak Ban Bueng District, Chonburi
- link "Location Icon Wisit Chai Market Ban Bueng District, Chonburi":
  - /url: https://maps.app.goo.gl/wyUKZe9nJ5r7cSVR7
  - img "Location Icon"
  - text: Wisit Chai Market Ban Bueng District, Chonburi
- link "Location Icon Mo Chit Small Passenger Terminal (Chatuchak) Building C, Counter C5":
  - /url: https://maps.app.goo.gl/qxVydpgtpDAM7z6J6
  - img "Location Icon"
  - text: Mo Chit Small Passenger Terminal (Chatuchak) Building C, Counter C5
- text: Information & Services
- link "How to book and pay":
  - /url: /how-to-book
- link "Privacy Policy":
  - /url: /privacy-policy
- link "Refund Policy":
  - /url: /refund-policy
- link "Business Policy (Cancellation/Refund)":
  - /url: /business-policy
- text: Contact us
- link "Facebook Icon NJ Phuyaipu":
  - /url: https://www.facebook.com/nj.phuyaipu
  - img "Facebook Icon"
  - text: NJ Phuyaipu
- link "Instagram Icon @nj.phuyaipu":
  - /url: https://www.instagram.com/nj.phuyaipu
  - img "Instagram Icon"
  - text: "@nj.phuyaipu"
- link "Phone Icon 09-0562-2019":
  - /url: tel:0905622019
  - img "Phone Icon"
  - text: 09-0562-2019
- text: © NJ Phuyaipu 2026. All rights reserved.
- button "Report a usability issue": flag Report Issue
```

# Test source

```ts
  158 |     // Must be the empty state, not the error state, and the spinner must be cleared.
  159 |     await expect(dialog.locator('.bi-exclamation-triangle')).toHaveCount(0);
  160 |     await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
  161 |     await page.screenshot({ path: 'e2e-evidence/options-empty-date.png', fullPage: true });
  162 | 
  163 |     await dialog.locator('.reschedule-modal__close').click();
  164 |   });
  165 | 
  166 |   test('AC5/AC6: NO_PAYMENT reschedule completes end-to-end and list reflects the new departure', async ({
  167 |     page,
  168 |   }) => {
  169 |     await loginAsCustomer(page);
  170 |     await gotoMyBookings(page);
  171 | 
  172 |     const card = cardByBookingNumber(page, 'B-74DW6T'); // id=5, seat 7, 07-09 15:00
  173 |     await expect(card.locator('.booking-card__meta dd').first()).toContainText('9 Jul 2026');
  174 |     await card.locator('.btn-reschedule').click();
  175 | 
  176 |     const dialog = page.locator('.reschedule-modal');
  177 |     await openCalendar(dialog);
  178 |     await selectPCalendarDate(page, 9);
  179 | 
  180 |     // schedule 6 = 2026-07-09 21:00 (booking B-X3F5ML's own departure slot,
  181 |     // seat 7 free there) — a genuinely different departure time.
  182 |     await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });
  183 |     const target = dialog.locator('.reschedule-option-card').filter({ hasText: '21:0' });
  184 |     await target.click();
  185 | 
  186 |     const estimate = dialog.locator('.reschedule-estimate');
  187 |     await expect(estimate).toBeVisible({ timeout: 30_000 });
  188 |     await expect(estimate).toContainText('Current fare');
  189 |     await expect(estimate).toContainText('New fare');
  190 |     await expect(estimate).toContainText('Reschedule fee');
  191 |     await expect(estimate.locator('.reschedule-estimate__net')).toContainText('No additional charge');
  192 | 
  193 |     await page.screenshot({ path: 'e2e-evidence/estimate-no-payment.png', fullPage: true });
  194 | 
  195 |     await dialog.locator('.reschedule-step__actions .btn-primary').click();
  196 | 
  197 |     // Success: dialog closes, toast fires, list refreshes to the new departure.
  198 |     // (Koyeb free-tier can cold-start — confirm does a re-fetch-estimate +
  199 |     // confirm round trip, so give this generous headroom.)
  200 |     await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  201 |     await gotoMyBookings(page);
  202 |     const updatedCard = cardByBookingNumber(page, 'B-74DW6T');
  203 |     await expect(updatedCard.locator('.booking-card__meta dd').first()).toContainText('9 Jul 2026');
  204 |     await expect(updatedCard.locator('.booking-card__meta dd').first()).toContainText('21:00');
  205 |     await expect(updatedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
  206 | 
  207 |     await page.screenshot({ path: 'e2e-evidence/after-reschedule-success.png', fullPage: true });
  208 |   });
  209 | 
  210 |   test('AC7: NO_SEATS bounces back to the options list with an inline error, spinner not stuck', async ({
  211 |     page,
  212 |   }) => {
  213 |     // KNOWN BUG (see QA report, OBRS-83 AC7): confirmed via live network trace
  214 |     // that POST /bookings/3/reschedule -> 400 RESCHEDULE_ERROR_NO_SEATS
  215 |     // completes fine, and the re-triggered GET /reschedule-options 200s ~2s
  216 |     // later, yet the dialog's options-list view stays stuck on
  217 |     // "Looking for available departures…" indefinitely (45s+) instead of
  218 |     // showing the rejection message. Root cause in
  219 |     // reschedule-dialog.component.ts's selectRescheduleConfirmErrorCode
  220 |     // subscription: it re-dispatches loadRescheduleOptions directly instead of
  221 |     // surfacing rescheduleConfirmError into the options-list's error state,
  222 |     // and the fresh dispatch's reducer clears rescheduleOptionsError to null
  223 |     // before the intended message can ever be read. This test encodes the
  224 |     // CORRECT/expected behaviour and is left failing until that's fixed.
  225 |     await loginAsCustomer(page);
  226 |     await gotoMyBookings(page);
  227 | 
  228 |     // id=3 B-X3F5ML, seat 4. On 2026-07-17 the only candidate is scheduleId=7
  229 |     // (07-17 15:00), which already has seat "4" occupied by B-P4HPH6's ticket
  230 |     // on the same route (verified live via GET /reschedule-options ->
  231 |     // occupiedSeatNumbers:"4"). This is a genuinely different schedule from
  232 |     // X3F5ML's own (not a same-schedule no-op), so confirming against it
  233 |     // exercises the real seat-collision path server-side. Non-destructive:
  234 |     // the endpoint 400s and neither booking is changed.
  235 |     const card = cardByBookingNumber(page, 'B-X3F5ML');
  236 |     await card.locator('.btn-reschedule').click();
  237 | 
  238 |     const dialog = page.locator('.reschedule-modal');
  239 |     await openCalendar(dialog);
  240 |     await selectPCalendarDate(page, 17);
  241 | 
  242 |     const optionsList = dialog.locator('.reschedule-options-list');
  243 |     await expect(optionsList).toBeVisible({ timeout: 20_000 });
  244 |     await expect(dialog.locator('.reschedule-option-card')).toHaveCount(1, { timeout: 20_000 });
  245 |     // Loading state must be cleared once options resolve — no stuck spinner.
  246 |     await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
  247 |     await dialog.locator('.reschedule-option-card').first().click();
  248 | 
  249 |     await expect(dialog.locator('.reschedule-estimate')).toBeVisible({ timeout: 30_000 });
  250 |     await dialog.locator('.reschedule-step__actions .btn-primary').click();
  251 | 
  252 |     // Bounced back to the options list (not a silent failure, not a dead dialog).
  253 |     // Confirm re-fetches the estimate before submitting, so this is two
  254 |     // sequential Koyeb round trips — give it generous headroom.
  255 |     await expect(dialog.locator('.reschedule-options-list')).toBeVisible({ timeout: 45_000 });
  256 |     await page.waitForTimeout(8_000); // let the bounce-back settle before capturing evidence
  257 |     await page.screenshot({ path: 'e2e-evidence/no-seats-BUG-stuck-loading.png', fullPage: true });
> 258 |     await expect(dialog.locator('.reschedule-options-list__state')).toContainText(
      |                                                                     ^ Error: expect(locator).toContainText(expected) failed
  259 |       /no longer available/i,
  260 |       { timeout: 45_000 }
  261 |     );
  262 |     // The bounce-back must clear the options-loading spinner, not leave it spinning.
  263 |     await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
  264 |     await page.screenshot({ path: 'e2e-evidence/no-seats-error.png', fullPage: true });
  265 | 
  266 |     await dialog.locator('.reschedule-modal__close').click();
  267 | 
  268 |     // Confirm the source booking itself was never mutated by the failed attempt.
  269 |     await gotoMyBookings(page);
  270 |     const unchangedCard = cardByBookingNumber(page, 'B-X3F5ML');
  271 |     await expect(unchangedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
  272 |   });
  273 | 
  274 |   test('AC2: cancelling a booking makes Reschedule disabled with NOT_CONFIRMED reason', async ({ page }) => {
  275 |     await loginAsCustomer(page);
  276 |     await gotoMyBookings(page);
  277 | 
  278 |     // Consume booking B-RDE6PG (already used for the NO_SEATS attempt above,
  279 |     // which did not change its state) via the existing Cancel flow. The
  280 |     // confirmation step is a SweetAlert2 popup, not a native browser dialog.
  281 |     const card = cardByBookingNumber(page, 'B-RDE6PG');
  282 |     await card.locator('.btn-cancel').click();
  283 |     await page.locator('.swal2-confirm').click({ timeout: 30_000 });
  284 |     await expect(cardByBookingNumber(page, 'B-RDE6PG').locator('.status-badge')).toHaveText(
  285 |       /Cancelled/i,
  286 |       { timeout: 30_000 }
  287 |     );
  288 | 
  289 |     const cancelledCard = cardByBookingNumber(page, 'B-RDE6PG');
  290 |     const rescheduleBtn = cancelledCard.locator('.btn-reschedule');
  291 |     await expect(rescheduleBtn).toBeVisible(); // never hidden, even when ineligible
  292 |     await expect(rescheduleBtn).toBeDisabled();
  293 |     await expect(cancelledCard.locator('.tooltip-box')).toContainText(
  294 |       /Only confirmed bookings can be rescheduled/i
  295 |     );
  296 | 
  297 |     await page.screenshot({ path: 'e2e-evidence/not-confirmed-disabled.png', fullPage: true });
  298 |   });
  299 | 
  300 |   test('AC5/AC6 (network-mocked): TOP_UP shows real amount ahead of the embedded payment step', async ({
  301 |     page,
  302 |   }) => {
  303 |     await loginAsCustomer(page);
  304 |     await gotoMyBookings(page);
  305 | 
  306 |     const card = cardByBookingNumber(page, 'B-P4HPH6'); // id=4, seat 4, untouched
  307 |     await card.locator('.btn-reschedule').click();
  308 | 
  309 |     const dialog = page.locator('.reschedule-modal');
  310 |     await openCalendar(dialog);
  311 |     await selectPCalendarDate(page, 9);
  312 |     await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });
  313 | 
  314 |     // SIT's seeded schedules are all same-fare/>24h-out, so a real TOP_UP
  315 |     // can't be produced from this session's data — mock just the
  316 |     // estimate/confirm responses on top of the otherwise-live dialog/options,
  317 |     // matching this suite's established mocking convention (b2c-critical-path.spec.ts).
  318 |     await page.route('**/reschedule-estimate**', (route) =>
  319 |       route.fulfill({
  320 |         json: {
  321 |           code: 200,
  322 |           message: 'OK',
  323 |           data: {
  324 |             oldFare: 200,
  325 |             newFare: 350,
  326 |             fareDiff: 150,
  327 |             rescheduleFee: 0,
  328 |             netAmount: 150,
  329 |             paymentDirection: 'TOP_UP',
  330 |           },
  331 |         },
  332 |       })
  333 |     );
  334 |     await page.route('**/bookings/4/reschedule', (route) =>
  335 |       route.fulfill({
  336 |         json: {
  337 |           code: 200,
  338 |           message: 'OK',
  339 |           data: { bookingId: 4, bookingNumber: 'B-P4HPH6', status: 'PENDING_PAYMENT', paymentIntentId: 999901 },
  340 |         },
  341 |       })
  342 |     );
  343 | 
  344 |     await dialog.locator('.reschedule-option-card').first().click();
  345 |     const estimate = dialog.locator('.reschedule-estimate');
  346 |     await expect(estimate).toBeVisible({ timeout: 15_000 });
  347 |     await expect(estimate.locator('.reschedule-estimate__net')).toContainText('You pay');
  348 |     await expect(estimate.locator('.reschedule-estimate__net')).toContainText('150');
  349 | 
  350 |     await dialog.locator('.reschedule-step__actions .btn-primary').click();
  351 | 
  352 |     const paymentStep = dialog.locator('.reschedule-payment-step');
  353 |     await expect(paymentStep).toBeVisible({ timeout: 15_000 });
  354 |     // The real top-up amount must be visible in the note text regardless of
  355 |     // the embedded app-payment-summary's own (zeroed/stale) panel below it.
  356 |     await expect(paymentStep.locator('.reschedule-step__hint')).toContainText('150');
  357 |     await page.screenshot({ path: 'e2e-evidence/topup-payment-step.png', fullPage: true });
  358 | 
```