# The e-ticket download is a backend PDF, reached through three doors (OBRS-1802)

## Context

`<app-e-ticket-card>` is the only place in the frontend that downloads a ticket,
and both AC-3 surfaces mount it — the public `/e-ticket` page
(`app-routing.module.ts`: `customerArea: true`, **no** `requireAuth`) and the My
Bookings ticket modal. Until this card it produced the file itself:
`downloadTicketImage()` rasterised `.ticket-paper` with a client-side canvas
library and handed the customer a PNG via a `data:` URL.

Three things were wrong with that, in order of how much they cost:

1. **What the customer keeps was a screenshot of one browser's layout**, not the
   document the operator is the authority on. Fonts, device pixel ratio and
   whatever the page happened to have rendered all went into it; nothing
   server-side could vouch for it.
2. **It only worked for a customer whose browser could draw the whole card.** A
   guest skips the ticket API entirely (OBRS-858: `/api/private/**` would 401),
   so their PNG had no per-ticket QR in it at all.
3. **A `data:` URL the size of a rasterised ticket is the weakest save path
   there is** — historically the one that failed on iOS Safari.

## Decision

**The e-ticket is the PDF the backend renders.** The frontend asks for it, names
it from `Content-Disposition`, and saves the bytes. `downloadTicketImage()` and
the canvas-rasteriser dependency are gone (one import, one call site, zero
references in `e2e/`), along with its `allowedCommonJsDependencies` entry.

### Three doors, one document, and the CREDENTIAL picks the door

| Lane | Request | Who |
| --- | --- | --- |
| 1 | `GET /api/private/bookings/{id}/e-ticket` | signed in |
| 2 | `GET /api/bookings/{id}/e-ticket` + `X-Guest-Payment-Token` | a guest still holding the booking-scoped token checkout gave them — **types nothing** |
| 3 | `POST /api/bookings/e-ticket` `{ bookingNumber, phoneNumber }` | a guest with no token (came back later, another device) |

`BookingService.canDownloadETicketByBookingId()` is the single answer to "can
this browser ask by id alone", and `downloadETicketPdf()` picks lane 1 vs 2 from
the same credential — mirroring `payment.service.ts#createPayment`. This is
deliberately **not** `getQrImage`'s path-prefix sniff: there the server chose the
path so reading it back is right, here the *caller* chooses the path, so the
credential must decide and the guest header can never reach a `/api/private/`
URL. Both directions are pinned in `booking.service.spec.ts`.

`GUEST_PAYMENT_TOKEN_EXPIRED` / `GUEST_PAYMENT_TOKEN_INVALID` fall **through** to
lane 3 rather than dead-ending — an aged-out 60-minute token (ADR-0123 D6) is
exactly the case the phone step exists for, and it is what that message's server
copy already tells the customer to do.

### The button is visible to guests

No `isAuthenticated()` condition anywhere in the template (owner decision
2026-09-11). The only gate is `bookingId != null`: with no id there is nothing for
the backend to render, and on `/e-ticket` that is already the incomplete-ticket
state the page warns about. `bookingId` is a new `@Input()` rather than a read of
`BookingService.getActiveBookingId()`, because that key holds whatever checkout
last wrote — the wrong booking whenever the card is the modal showing an older
row — and it cannot live on `legs`, which are per-leg.

### The phone number is asked for, used once, and dropped

One dialog (`AlertService.promptText()` — the existing Swal-through-AlertService
idiom with one field added, not a second overlay mechanism), one request, then
gone. It is **never** prefilled and **never** stored: not `localStorage`, not
`sessionStorage`, not a field on the component. The app does not persist a phone
number today (correctly, PDPA) and this card does not start. The booking *number*
is shown read-only inside the dialog copy, since it is already on the card.

### One neutral refusal for a 404

The backend answers "no such booking number", "wrong phone" and "that is a parcel
booking" with one byte-identical 404 so the endpoint cannot be used to confirm
which booking numbers exist — the same rule `/find-booking` is built on
(`find-booking-page.component.ts`'s class comment). The frontend renders
`E_TICKET.DOWNLOAD_NOT_FOUND` and nothing else: no variant wording, no
per-reason field state. A spec asserts that two *different* 404 error codes
produce the byte-identical message, which is the form of that claim a test can
actually go red on.

`fromCredentialLane` is **not** a second variant of that refusal: it selects
which lane's copy is *true*. `DOWNLOAD_NOT_FOUND` names the booking reference and
the phone number, and on lanes 1/2 the customer typed neither, so telling them to
"check both" would be a claim about input that does not exist on that screen. The
branch reads which credential *this client* chose — never anything the server
disclosed.

### A 429 gets its own copy, checked first and on every lane

Owner decision, 2026-09-11. The reason is **not** symmetry with `/find-booking`:
`DOWNLOAD_FAILED` reads *"please try again"*, and a throttled customer who obeys
it **extends their own throttle window**. It is the one failure where the generic
toast does not merely under-inform — it misdirects. `E_TICKET.DOWNLOAD_RATE_LIMITED`
explains the wait instead of inviting an immediate retry. Oracle risk is nil and
already adjudicated on this exact quota at `find-booking-page.component.ts:116`:
a 429 is a fact about *this caller's request rate*, not about whether the booking
exists.

### The save path: one mechanism, no iOS branch — and why

`saveBlob()` (blob → object URL → `<a download>` → revoke), lifted verbatim out of
`ExportService` into `shared/lib/blob-download.ts` and now shared by both callers
along with `parseContentDispositionFilename()` and `parseBlobErrorCode()`.

`payment-qrcode.component.ts` has an iOS Web-Share branch (OBRS-1203) and it was
considered here. **Not taken**, for a reason worth stating plainly rather than
deciding by vibe: the PNG path's iOS failure was the `data:` URL, which is a
different mechanism from the one this card uses. `saveBlob` is the repo's one
blob-save path already in production, and a PDF is a file type iOS Safari opens
natively. A Web-Share branch would add a share sheet, an abort-detection path and
another i18n key to cover a failure mode **nobody here has reproduced** — and it
cannot be verified from this machine either way. Two known, unmeasured risks are
recorded instead of guessed at:

- `URL.revokeObjectURL` fires synchronously after `click()` (inherited from
  `ExportService`, in production since OBRS-642). Some WebKit builds are reported
  to need the URL to outlive the click.
- iOS Safari may open the PDF in a viewer tab rather than saving to Files.

Both are one real-device check, and both are cheaper to fix once observed than to
pre-empt with a branch nobody can test. QA owns that check.

### Two invariants this side now states itself (security review, 2026-09-11)

Both were safe before, and in both cases what made them safe was a coincidence
rather than a statement — which is the part worth fixing.

- **The saved filename is sanitised here, not only in the backend.** `saveBlob`
  strips path separators and the C0 range (CR/LF/NUL included) via
  `sanitizeDownloadFilename`. Traversal and extension-spoofing were already
  closed by `ETicketPdfService.java`'s `replaceAll("[^A-Za-z0-9_-]", "-")` — a
  real protection, but an invariant of *another repository* that nothing on this
  side asserted, on a value that arrives over the wire. A deny list of the two
  dangerous classes, deliberately not an allow list: this app ships Thai and
  Chinese documents, and an allow list would have to enumerate every script a
  filename may legitimately use. ⚠️ The specs assert the **sanitiser's output**.
  They do not test what a browser does with a `download` attribute — Karma cannot
  see the file that lands on disk. The claim locked is "this string never reaches
  the attribute", not "the browser would have written it safely".
- **Lane 3 asks only about the booking on the card.** It used to fall back to
  `localStorage['active_booking_number']`, i.e. whatever checkout last wrote. Not
  an escalation — both bookings are this browser's and the server still has to
  match the phone — but it let a customer type the phone for the booking in front
  of them while the request asked about a different one, sending PII paired with
  an identifier they did not choose and spending their own per-IP quota on the
  wrong lookup. With no number on the card, lane 3 now refuses instead of
  guessing. The dialog's prefill is unchanged; it is the *request* that no longer
  falls back.

### The one coupling left open, and why it is a card rather than a fix here

**Today's behaviour is correct, and provably so. This is about a future change.**

Lane selection and bearer attachment are two independent decisions that happen to
agree:

| | decides | expression |
| --- | --- | --- |
| lane | `booking.service.ts:299` (`downloadETicketPdf`) | `authService.isAuthenticated()` |
| bearer | `auth.interceptor.ts:100-101`, from the token read at `:68` | `!!authService.getToken()` — **no URL predicate at all** |

They cannot disagree at the moment this is written, because `isAuthenticated()` is
literally `return !!this.getToken()` (`auth.service.ts:570-572`). So both reduce
to `!!localStorage['auth_token']` and the guest lane is only ever taken when no
bearer exists. Nothing attaches `X-Guest-Payment-Token` globally either — it is
set per request in exactly two places (`booking.service.ts:309`,
`payment.service.ts:59`).

What that is, though, is **a coincidence of two implementations agreeing, not a
gate**. The day `isAuthenticated()` starts checking the JWT's `exp` — which it
arguably should — an expired token sends the caller down the *guest* lane while
the interceptor still sees `getToken()` as truthy, and one request goes out
carrying a bearer token *and* a booking-scoped guest capability. No spec in this
repo can catch that regression: `HttpTestingController` does not run
interceptors.

**OBRS-1839 owns turning it into a gate** — a `SKIP_AUTH_HEADER`
`HttpContextToken` the interceptor reads, set on both guest lanes. It is a
separate card, not part of this one, for the reason the owner split it out: the
shape predates this work (`payment.service.ts:53-59`, OBRS-858, chose its lane the
same way), so it is not this card's defect, and one gate in the interceptor
closes both call sites where two local fixes would close one and leave the other.
Anyone reading this file before touching either guest lane should read that card
first; do not re-derive the analysis, and do not "tidy" the predicate on one side
only — making the two expressions differ is precisely the change that breaks it.

## Consequences

- The frontend no longer decides what an e-ticket looks like when printed; the
  backend does, for every customer, on every device.
- A guest gets the real ticket — including the QR the private-API skip denied
  them — which is the half of OBRS-858 that was still missing.
- One dependency left the tree. The lazy-chunk rationale for keeping
  `ETicketCardModule` out of the eager `SharedModule` now rests on `qrcode`
  alone, which still renders the ON-SCREEN per-passenger QRs (`BoardingQrService`)
  and is unchanged by this card.
- `.download-btn` and `E_TICKET.DOWNLOAD` keep their names on purpose:
  `e2e/support/customer-pages.ts` names that class in the contrast gate's hover
  sweep, a job `ng test` cannot see. That sweep **skips** a hover target it cannot
  find, so gating the button on `bookingId` also required seeding
  `active_booking_id` in `seedCustomerSession` — without it the gate would have
  gone on reporting green while silently measuring nothing there.
