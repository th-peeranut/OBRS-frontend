# MANUAL TEST — OBRS-1802: the e-ticket download is a server-rendered PDF, on three doors

Frontend worktree `OBRS-frontend-wt-obrs-1802`, branch `ao/obrs-1802-pdf-eticket` @ `6b80ce5c`, cut
from `origin/dev` @ `0cf54b32`. Backend worktree `OBRS-backend-wt-obrs-1802`, same branch @
`70ddfcb0`, cut from `origin/dev` @ `d6a84d62`. **Everything below was executed by the QA agent on
2026-09-12 between 01:28 and 02:30 (+07:00). Nothing here is a plan for the owner to run**, and no
case is listed that was not actually executed — what could not be reached is in
[Known-unverified](#known-unverified) with the reason.

## Setup

One local stack, reused from the previous QA session (started 23:29, verified still listening with
`netstat -ano` and a foreground `curl`):

| Piece | Where | Evidence it was the right thing |
|---|---|---|
| Backend | pid 45656 on `:8181`, profiles `dev,local`, database **`obrs1802qa`** (disposable) | `GET /actuator/health` → **200** (measured); the log line names `jdbc:postgresql://localhost:5432/obrs1802qa` |
| Frontend, live lane | pid 37012, `ng serve --configuration e2e` on `:4210` (`apiUrl` → `:8181`) | `GET /` → **200** (measured) |
| Frontend, gate lane | started by this run: `ng serve --configuration gate --port 4230 --no-live-reload` | `lane-tree-guard` printed `tree …OBRS-frontend-wt-obrs-1802`, `head 6b80ce5c`, `the server on 4230 is this tree's own` |

An unrelated `ng serve` on `:4200` (pid 28400) belongs to another session and was left alone.

## Cases

| # | Scenario | What was run | Expected | Result |
|---|---|---|---|---|
| 1 | **The shared hermetic merge gate**, after commit `86267b0e` changed `e2e/support/customer-pages.ts` (nobody had run it since) | `npx playwright test --config=playwright.gate.config.ts --shard=1/2` then `--shard=2/2` | whole lane green | **PASS** — measured **120 passed (13.2 m)** + **115 passed (3.5 m)** = **235 cases, 0 failed**, both exit 0. Logs: `gate-shard1.log`, `gate-shard2.log` |
| 2 | The *point* of that harness edit: the contrast lane's hover sweep `continue`s past a target it cannot find, so `.download-btn` could have gone unmeasured in silence | `e2e/qa-probe-1802/download-btn-measured.probe.spec.ts`, two arms, using the lane's own `seedCustomerSession` + `seedStore` against `:4230` | arm 1 finds the control; arm 2, with `active_booking_id` removed (the pre-`86267b0e` state), finds none | **PASS** — measured `arm 1 … count = 1`, `arm 2 … count = 0`, 3 passed (11.1 s) |
| 3 | **Door 1**, signed in: the download is a PDF and no served bundle still mentions the rasteriser | `playwright.qa1802.config.ts` (live stack), `AC3 door 1` case | `%PDF-` magic, `e-ticket-DRV-FIXTURE-1.pdf`, zero `html2canvas` hits in any served bundle | **PASS** |
| 4 | **Door 1 via the `/my-bookings` ticket modal** (same `<app-e-ticket-card>`, different surface) | same lane, modal case | a PDF named for the booking the modal opened | **PASS** — see the note below on a first red caused by this QA's own data |
| 5 | **Door 2**, guest holding a payment grant: no sign-in, no typing | same lane, door-2 case | PDF served with `X-Guest-Payment-Token`, and **no** fall-through request to `POST /api/bookings/e-ticket` | **PASS** — on a RESERVED booking, not a paid one; see [Known-unverified](#known-unverified) |
| 6 | **Door 3**, a guest grant the backend refuses | same lane, door-3 case, plus `door3-toast-timing.live.spec.ts` (arms 1–2), `door3-arm3-store-seeded.live.spec.ts` (arm 3) and `door3-arm4-gate-build.probe.spec.ts` (**arm 4, the one that decides it**) | the refusal falls through to the phone-confirm dialog (ADR-0044 / commit `86267b0e`) | **PASS on arm 4** — the dialog appears at 0 ms and stays up. Arms 1–3 reported the opposite and were **wrong for a harness reason**; both results and the reason are below |
| 7 | A **`zh` document rendering the Han title and a Thai name in one field**, plus a Thai plate, with no substitution glyph | booking created through `POST /api/private/bookings` with passenger `สมชาย ใจดี`, the contact user's `preferred_locale` flipped to `zh`, `title_snapshot='MR'`, paid through `POST /api/private/payments/mock`, then `GET /api/private/bookings/7/e-ticket` and `pdftotext -enc UTF-8 -layout` | `先生` and `สมชาย` present, plate present, zero `?` | **PASS** — measured: line 9 of the text layer is exactly `先生 สมชาย ใจดี`; `车牌号` → `กข 1234`; `'?'` → **0 lines**; the page is a real boarding pass (`票号 T-RFWHN9JAHT`, no `不可用于乘车`) |
| 8 | **No `eticket.pdf.glyph-missing` on the shipped locales** — and the detector is actually live | offset-marked the running backend's log, then rendered th / en / zh documents, then rendered a booking whose passenger name is **Devanagari** (`हिन्दी`) as a positive control | zero events for th/en/zh; the control **fires** | **PASS** — measured: `glyph_missing_lines_in_new_tail=1`, and that one line is `event=eticket.pdf.glyph-missing scripts=[DEVANAGARI]`. Every th/en/zh render in the window produced **0** |
| 9 | **The e-mail attachment versus the PDF a web door serves**, same booking | `sha256sum` + `pdftotext` over `door2-web.pdf` and `mail-attachment.pdf` (both booking `B-3C5DD9`, captured by the previous session through a local SMTP sink on `:1025`) | the card says "byte-identical" | **CLAIM CORRECTED** — measured **not** byte-identical: `598aacf3…` / 24,385 B vs `f5ff9826…` / 24,358 B. Their **text layers are identical** (my own `pdftotext`, `diff` empty). This matches what `ETicketPdfServiceTest#quietly_producesTheSameDocument` asserts and says in its own comment: one renderer, one document, per-render `iat` and PDFBox `/ID` differ by design |

### Case 4's first red was this QA's own doing, not the code

The modal case first failed `Expected: "e-ticket-DRV-FIXTURE-1.pdf"` / `Received:
"e-ticket-B-AZ2J4D.pdf"`. `B-AZ2J4D` is the booking **case 7 created** for the same customer, so it
became the newest row the modal opens. The mechanism under test was working — it served a correctly
named backend PDF for the booking actually opened. That booking and its dependent rows were deleted
from `obrs1802qa` (`payments`, `tickets`, `booking_schedules`, `bookings`; the other eight
booking-referencing tables had no rows), restoring the fixture, and the lane re-run gave **5 passed,
1 failed** with only case 6 red.

### Case 6 in detail — what the customer actually gets

The door-3 spec waits 6000 ms after the click and then counts SweetAlert2 nodes. That cannot tell
"nothing happened" from "something happened and went away", so the timing was measured from the
click instead (20 samples, 300 ms apart):

```
0ms    toast=1 dialog=0 visiblePhoneInput=0 "Could not download your e-ticket. Please try again."
...    (toast visible through 2700ms)
3000ms toast=0 dialog=0 visiblePhoneInput=0      <- and 0 for the rest of the 6s window
api calls: 200 GET /api/stops | 400 GET /api/bookings/5/e-ticket
```

So in that state the customer is **not** left with nothing: an error toast is up for ~2.7 s. But that
state is **not the scenario door 3 is for**, and arms 1–3 never left it:

- `resolveBookingNumber()` returns `''` whenever the card's `bookingNumber` is `'-'`, and it
  deliberately has no `localStorage` fallback (security review L3, whose own comment says "the card
  always has this number when it is rendering a ticket, so `''` is the degenerate render"). With
  `''`, `downloadByCredential()` calls `reportFailure(null)` — the toast — and returns before
  `promptText()`.
- For a guest the number can only come from the checkout store: `this.bookingNumber = bookingNumber
  || '-'` fed from `booking?.bookingNumber`, and the page says so — *"the store pass is the ONLY pass
  a guest ever gets (OBRS-858)"*. Arms 1–2 seeded the token and never the store.
- Arm 3 seeded the store and **still** failed its own precondition. The diagnostics said why:
  `page.bookingNumber` was already `B-3C5DD9` with `ticketIncomplete: false` while the screen read
  *"Online ticket booking is not open yet"*. `environment.base.ts` sets
  `features.onlineTicketBooking: false` and the `e2e`/`sit` configurations inherit it (OBRS-1302), so
  **no arm on `:4210` could ever have rendered a ticket**. `environment.gate.ts` sets it `true`.

**Arm 4** therefore ran on the gate build (`:4230`), as a guest (`seedCustomerSession` reused for its
`/api/**` fixture and consent seeding, then its three auth keys removed), with the store seeded, and
with the guest door answering the **exact 400 body the live backend produced** for booking 3's
aged-out grant (measured with curl: `errorCode: GUEST_PAYMENT_TOKEN_EXPIRED`; replayed because the
gate build's `apiUrl` points at `:8080` where nothing listens). One more thing was needed and is
worth recording: `seedStore` dispatches from `page.evaluate`, i.e. **outside Angular's zone**, so the
page's fields updated while the template never re-rendered — measured: `page.bookingNumber` was
`B-3C5DD9` while the DOM still carried `eticket-unavailable` and the card still read `'-'`. Forcing
change detection with Angular's own `ng.applyChanges` is what a real in-zone dispatch would have done.

With all six preconditions asserted green — `cardBookingNumber: "B-3C5DD9"`, `unavailable: 0`,
`authToken: null`, `bookingOnScreen: true`, `featureFlagPlaceholder: false`, one download button —
the click produced:

```
0ms    toast=0 dialog=1 visiblePhoneInput=1 "Confirm your phone number  To protect booking B-3C5DD9,
                                             please confirm the phone number used to make it. …"
…      (unchanged through 5700ms — a dialog, so it does not auto-dismiss)
guest-door 400s served: 1; credential-lane POSTs: 0
```

⇒ **door 3 behaves as documented.** The zero credential-lane POSTs is correct, not a gap: the POST
happens only after the customer submits a phone number, and this probe deliberately types none. This
also agrees with the unit coverage — `e-ticket-card.component.spec.ts` has `falls through to the
phone step on GUEST_PAYMENT_TOKEN_EXPIRED` / `_INVALID`, asserting `promptText` is called once.

## FINDING — in the `ticketIncomplete` render the download button is live and its failure copy is a dead end

Independent of door 3, and measured rather than reasoned:

- the degenerate render keeps **one live `button.download-btn`** (`downloadButtons: 1` in every arm
  that hit that state, including both `:4210` arms and the pre-`applyChanges` arm 4);
- clicking it can **never** succeed there, because `resolveBookingNumber()` is `''` by construction in
  that state, so `downloadByCredential()` refuses before it asks for anything;
- what the customer is told is `E_TICKET.DOWNLOAD_FAILED` — *"Could not download your e-ticket. Please
  try again."* — for ~2.7 s (measured timeline above). **Retrying cannot change the outcome**;
- the correct answer is **already on the same screen, directly above**: the `.ticket-incomplete` aside
  at `e-ticket.component.html:33-40` carries `E_TICKET.INCOMPLETE_TITLE` / `_BODY` and a
  `routerLink="/find-booking"` retrieval link.

**QA's judgement: (a) suppress or disable the button in that state**, rather than (b) re-wording the
failure copy to point at `/find-booking`. Reasons: (b) leaves a control on screen that cannot succeed
and duplicates a link already rendered a few lines above it, while (a) removes the dead end outright;
and the page already owns a single boolean for exactly this state (`ticketIncomplete`).

One coupling a fix must not trip, checked here so nobody has to rediscover it: gating the button on
`!ticketIncomplete` does **not** re-open the silent-skip hole that commit `86267b0e` closed. The
contrast sweep seeds an authenticated session, and `ticketApiPassExpected = !!bookingId &&
isAuthenticated()` is then true, so `ticketIncomplete` is **false** in that sweep regardless of the
booking number — the hover target stays findable. Measured corroboration: the arm-1 probe on the gate
build (signed in) found `button.download-btn count = 1`. **Not implemented here — the fix is routed by
the coordinator.**

### ⚠️ Correction — QA's recommendation (a) was implemented, failed review, and was replaced

Recorded here because the paragraphs above would otherwise teach the wrong fix to the next reader.

`9f03dd8c` did exactly what QA recommended: it gated the button on `!ticketIncomplete` via a new
`@Input()`. **Review rejected it, and the rejection was verified against the code rather than argued.**
`ticketIncomplete` is not a predicate for *"can this click succeed"* — it is computed from whether the
**private tickets API** pass is coming (`e-ticket.component.ts:331-332`, which only asks
`isAuthenticated()`), so it cannot see lane 2 at all:

- `canDownloadETicketByBookingId()` is `isAuthenticated() || !!getGuestPaymentToken()?.trim()`
  (`booking.service.ts:276-281`);
- the guest grant lives in `localStorage` under `active_booking_payment_grant` (`:712-714`) — note the
  key name contains no "guest", so grepping for one finds nothing — and therefore **survives a hard
  reload**, exactly like `active_booking_id`;
- lane 2 (`GET /api/bookings/{id}/e-ticket` + `X-Guest-Payment-Token`, `:298-312`) takes **only the
  booking id**. It never uses a booking reference;
- `clearActiveBookingId()` (`:686-694`) drops id, number and grant **together**, and its only non-spec
  caller in the repo is `parcel-booking-page.component.ts:449` — never `/e-ticket`.

⇒ The very condition that makes this degenerate render reachable (an `active_booking_id` in storage) is
the condition under which the grant is still present. So **a guest who paid and hard-reloads
`/e-ticket` inside the 60-minute TTL has a working lane 2**, and recommendation (a) would have hidden
their button and sent them to `/find-booking` to supply a reference that is not on their screen. That
is worse than the defect it set out to fix.

**What shipped instead** (`8f7f4103`) is a card-local predicate — `canAttemptDownload` at
`e-ticket-card.component.ts:200-206` — gating on *which lane is open* rather than on the render:
`bookingId != null && (canDownloadETicketByBookingId() || resolveBookingNumber() !== '')`. Measured in
a browser on a gate build, three arms: `LANE banner=0 btn=1 authToken=true grant=null` ·
`NO-CRED banner=1 btn=0 grant=null` · `LIVE-TOKEN banner=1 btn=1 grant=probe-live-token`. The third arm
is the one recommendation (a) would have failed.

⚠️ **`LIVE-TOKEN` shows `banner=1` together with `btn=1`** — the retrieval banner sits above a button
that really works. That is deliberate, not a defect: the banner is about this *render* being
incomplete, the button about a *lane* being open, and they are independent facts.

And recommendation (b) was **not** discarded after all: the sub-case where it was the only possible
answer — a grant that has **expired** with an empty store, which the client cannot distinguish from a
live one before it asks — now toasts `E_TICKET.DOWNLOAD_NEEDS_RETRIEVAL` instead of
`DOWNLOAD_FAILED`'s "try again". Present in all three locale files the repo carries (`en`/`th`/`zh`;
`npm run test:i18n` measured `en=3678 th=3678 zh=3678`, same key set).

## What existing backend tests already prove, and was therefore not re-proved

| Claim | Already covered by | Note |
|---|---|---|
| The QR in a rendered PDF decodes to the boarding-token JWT | `ETicketPdfServiceTest#twoPassengersTwoLegs_rendersFourPages_eachQrDecodingToItsOwnTicketId` — a real ZXing decode of the embedded bitmap, then `Jwts.parser().verifyWith(...)` under the real boarding-token key; corroborated over HTTP by `ETicketPdfBoardingScanIT#door2_qrCodesFromTheGuestPdf_board_andReplayIsRefused` (scan → 200, `boarded_at` set, replay → 409) | Not re-proved here; a ZXing decode plus signature verification is strictly stronger than anything this lane could assert |
| The three **web** doors return the same bytes | `ETicketCrossDoorIdentityTest#theThreeDoorsProduceOneDocument` (real byte equality) | This is why case 9 compares the mail lane against door 2 rather than door 1 |
| A zh document prints a Thai plate with no `?` | `ETicketPdfFontFallbackTest#zhDocument_printsAThaiPlate` | Case 7 adds what no test asserts: that `先生` itself renders |
| Thai + Han in **one field** | `ETicketPdfFontFallbackTest#aFieldMixingThaiAndHan_rendersBothScripts` | Case 7 is the live-render counterpart |

Suites reported green by the developers and **not** re-run here: backend surefire 4,959 / 0 fail / 0
err / 4 skip and failsafe 32 / 0 / 0; frontend unit `Executed 6982 of 6982 SUCCESS`.

## Playwright lanes: what ran and what did not

`e2e/lanes.json` partitions the suite; the census is **GATE 35, OWN-DB 19, SIT-LIVE 9, CAPTURE 44**
(measured by reading the registry).

- **GATE — ran, all of it** (case 1). It is the only merge gate.
- **SIT-LIVE (9) — deliberately not run.** It hits the deployed SIT backend, and this branch is
  unpushed, so the e-ticket endpoints it would need **do not exist there**; it is also a shared
  mutable environment. Running it would have measured `dev`, not this card.
- **OWN-DB (19) — not run.** Each member provisions its own database for booking/report states that
  exist only by construction, and none of them touches the e-ticket surface. The card's own live
  walk (cases 3–6) is the OWN-DB-shaped coverage that is actually about this change.
- **CAPTURE (44) — not run.** `lanes.json` says in its own words that this lane "is not a test".

## Known-unverified

Each of these is unproven, with the reason. None is homework for the owner; the first is simply an
artifact no machine here can produce.

1. **The iPhone / iOS Safari save path.** This is an **artifact only the owner can obtain** — iOS
   Safari handles a `Content-Disposition: attachment` PDF by opening it in its own viewer with a
   Share sheet rather than writing a file, and that behaviour exists only on a physical iOS device.
   There is no iOS device and no iOS simulator on this machine, and headless Chromium cannot emulate
   the file-handling layer (a `webkit` Playwright project is desktop Safari's engine, not iOS's).
2. **Door 3 end-to-end through a real guest checkout in one browser.** Arm 4 proves the behaviour with
   the store seeded the way checkout leaves it and the refusal replayed byte-for-byte from the live
   backend, which is what the claim is about; what is still not walked is the full
   search → pay → wait-out-the-grant journey in one browser session. That needs a guest payment to
   complete, and it cannot here: the card door calls the real Omise API (`OmiseClient.createCharge`)
   and rejects this QA's fake card token with `GATEWAY_ERROR` (measured, twice), while the mock that
   bypasses it (`POST /api/private/payments/mock`) is a **private** endpoint a guest grant cannot
   reach. Note also that no such walk can be done on `--configuration e2e`/`sit` at all —
   `features.onlineTicketBooking` is `false` there (OBRS-1302).
3. **Door 2 against a genuinely PAID guest booking, at this hour.** The paid booking the previous
   session used (`B-3C5DD9`) carries a 60-minute grant (ADR-0123 D6) which had aged out — measured:
   its token now answers **400 `GUEST_PAYMENT_TOKEN_EXPIRED`**. Case 5 therefore ran against a fresh
   RESERVED guest booking (`B-CLNTRB`, booking 5), which exercises the same door and the same
   no-typing assertion but renders a document marked "not usable for boarding". The paid version of
   that walk is the previous session's `OBRS-1802-E2E-door2-guest-no-typing.webm`, already on the card.
4. **Byte-identity of the e-mail attachment** is not merely unverified but **false as worded** (case
   9). Nothing was found that *should* make the bytes equal, and the backend's own test says why they
   are not.
5. **`npm run test:e2e-lanes` is red while this QA's artifacts sit in the tree**, and that is
   expected, not a finding about the card: rule 1 of `scripts/check-e2e-lanes.mjs` fails any
   `e2e/tests/*.spec.ts` not declared in `lanes.json`, and `obrs-1802-qa.spec.ts` /
   `obrs-1802-diag.spec.ts` are uncommitted QA artifacts. The probes this run added were put in
   `e2e/qa-probe-1802/` precisely so they do not widen that.

## Artifacts

Left in the worktree, **uncommitted**:

- `e2e/tests/obrs-1802-qa.spec.ts`, `e2e/tests/obrs-1802-diag.spec.ts`, `playwright.qa1802.config.ts`
  (previous session; the guest-booking constants in the first were re-pointed at booking 5 with the
  reason written in the file)
- `e2e/qa-probe-1802/download-btn-measured.probe.spec.ts`,
  `e2e/qa-probe-1802/door3-toast-timing.live.spec.ts` (arms 1–2, **superseded** — they measure the
  degenerate render), `e2e/qa-probe-1802/door3-arm3-store-seeded.live.spec.ts` (arm 3, kept because
  its failing precondition is the evidence that `e2e` cannot render a ticket),
  `e2e/qa-probe-1802/door3-arm4-gate-build.probe.spec.ts` (**arm 4, the decisive one**), and the two
  configs beside them

⚠️ **The door-3 case inside `e2e/tests/obrs-1802-qa.spec.ts` is wrong as written and must not be
trusted or committed in that shape**: it runs on a build where `/e-ticket` cannot render a ticket, and
it samples once after 6000 ms, which cannot see a ~2.7 s toast. Arm 4 is the version of that question
that holds.

In the session scratchpad (`…/a2cc1ca4-…/scratchpad/`): `gate-shard1.log`, `gate-shard2.log`,
`probe-downloadbtn.log`, `probe-door3b.log`, `probe-door3c.log`, `qa-lane-rerun2.log`, and
`pdfs/OBRS-1802-zh-han-title-thai-name.pdf` — the case-7 document, attached to the card.
