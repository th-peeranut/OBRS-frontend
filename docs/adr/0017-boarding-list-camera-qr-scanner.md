# OBRS-266 boarding-list camera QR scanner (additive to `BoardingListComponent`)

## Context

OBRS-96 (see `0013-per-ticket-qr-eticket-and-boarding-scan.md`) shipped manual
boarding validation: a staff operator pastes/types the `boardingToken` decoded
from a passenger's e-ticket QR into a text box, which calls
`POST /api/private/tickets/boarding-scan`. The customer-side QR
(`e-ticket.component.ts`, `QRCode.toDataURL(result.boardingToken)`) encodes the
**raw `boardingToken` string** — no wrapper JSON, no URL. A camera decode of
that QR therefore yields exactly the string `submitToken()` already expects;
no parsing/extraction step is needed. OBRS-266 adds a camera mode as an
alternative input to the existing text box — this is purely additive to
`BoardingListComponent`, not a new component and not an access-model change
(no new role, no new endpoint; same `POST /boarding-scan` call as before).

## Decision 1: `@zxing/browser`, loaded via a dynamic `import()`, not a top-level value import

`@zxing/browser` (`BrowserMultiFormatReader.decodeFromVideoDevice()`) wraps
`@zxing/library`'s multi-format decoder. A top-level `import {
BrowserMultiFormatReader } from '@zxing/browser'` measured **+500kB raw / +94kB
gzip** on the app's eager initial chunk in a production build — `SharedModule`
(where `BoardingListComponent` is declared) is imported eagerly, so a static
value import there ships the decoder to every visitor, not just staff who open
the boarding tab, let alone camera mode specifically. That pushed the initial
bundle well past the CLAUDE.md/design-system 1.5MB warning budget.

The fix: only a **type-only** import (`import type { BrowserMultiFormatReader,
IScannerControls } from '@zxing/browser'`, erased at compile time — zero
runtime cost) at the top of the file; the actual class is loaded via `const {
BrowserMultiFormatReader } = await import('@zxing/browser');` inside
`startCameraScan()`, the first time an operator actually switches to camera
mode. This code-splits the decoder into its own on-demand lazy chunk
(confirmed in a production build: a new ~484kB/93kB "index" lazy chunk
appears, and the initial bundle returns to its pre-change size). `codeReader`
is cached on the component instance after the first load, so toggling
camera↔text repeatedly only pays the download cost once per page session.

## Decision 2: `decodeFromVideoDevice(undefined, ...)`, not manual `enumerateDevices()`/`facingMode` plumbing

The installed `@zxing/browser@0.2.1`'s own doc comment on
`decodeFromVideoDevice` states: passing `undefined` as the `deviceId` lets it
"decode from one of the available devices, **preferring the main camera
(environment-facing) if available**." That already satisfies "use the rear
camera when present" without this component enumerating
`navigator.mediaDevices.enumerateDevices()` or constructing its own
`facingMode: 'environment'` constraint — one call, no extra device-selection
state to maintain or test.

## Decision 3: one `stopCameraStream()` teardown helper, called from every path that can end a camera session

Mirrors the existing `disposePrintPortal()` idempotent-guard style
(`docs/adr/0015-boarding-manifest-print-isolation.md`): `scannerControls?.stop()`
+ null the ref + reset `cameraStatus` to `'idle'`, safe to call with no active
stream. Four call sites, not one:

- `ngOnChanges` on a `scheduleId` re-bind (before the store re-inits — a stale
  stream must not survive switching to a different trip's boarding tab).
- The toggle-to-text handler (`setScanMode('text')`).
- `handleArrivedTransition()` — `isScheduleArrived` is a **pure getter**, so it
  cannot stop the camera itself; both places that can flip `tripHeader.statusCode`
  to `'arrived'` (`onScheduleStatusAction()`'s success branch and
  `loadTripHeader()`'s success branch — a driver's screen can pick up the
  arrived state on a background refresh, not just via the salesperson's own
  transition button) call this explicitly.
- `ngOnDestroy` — unconditional, same rationale as `disposePrintPortal()`'s
  ngOnDestroy call: an operator navigating away mid-session must not leak a
  live `MediaStream`/camera indicator.

## Decision 4: the camera decode callback shares `submitToken()` with the manual button — not a second boarding-scan code path

`validateScan()` (manual button / Enter key) was split into a thin caller-side
empty-check plus a new private `submitToken(token)` that owns the `isScanning`
guard, the `boardingScan({ token, scheduleId })` call, `reflectBoardedInList()`
on success, and the existing `boarding-scan-error.ts` error mapping. The camera
decode callback calls the exact same `submitToken()`. This keeps error-code
handling, the count-lock guard, and the optimistic list update in one place —
a second parallel path here would eventually drift (e.g. only one of the two
re-checking `isScheduleArrived`).

`submitToken()` re-checks `isScheduleArrived` at its own top, in addition to
`validateScan()`'s check — a camera decode is asynchronous relative to the
schedule's state, so the schedule can lock (mark-arrived) in the gap between a
frame decoding and this call landing; the manual button doesn't have that gap
(the click and the check happen in the same synchronous tick) but the guard is
now shared code, so both paths get it for free.

## Decision 5: success auto-dismisses in camera mode only; the error banner never auto-dismisses in either mode

A text-entry submit is one deliberate, staff-initiated action per token — the
existing manual-dismiss banner is correct as-is. A camera session, though, is
naturally continuous (one QR after another as passengers board), so a
`scanResult` success banner is auto-dismissed after 4s (only when
`scanMode === 'camera'`) so it doesn't block the next scan's visual space. A
`scanError` (`WRONG_SCHEDULE_TICKET`, `TICKET_NOT_CONFIRMED`, etc.) is
**never** auto-dismissed in either mode — a rejection is exactly the case an
operator must consciously acknowledge, not have silently time out from under
them.

## Decision 6: 3-second same-token debounce, not a full pause-after-decode

`@zxing/browser`'s continuous decode loop re-decodes a QR sitting in frame on
every scan tick. Rather than pausing the whole loop after a hit (which would
require re-starting decode for the next passenger), `lastScannedToken` /
`lastScannedAt` ignore a re-decode of the **same** token within 3000ms —
short enough that the next passenger's different QR is picked up immediately,
long enough to absorb the frames it takes an operator to move the previous
ticket out of frame.

## Non-decision: this is not an access-model change

No new role, permission, or endpoint. The camera path is an alternative input
mechanism for the same `POST /api/private/tickets/boarding-scan` call the text
box already made — the ADR-CI access-model gate does not apply.

## Considered alternatives

- **A static top-level `@zxing/browser` import** — rejected per Decision 1:
  measured a ~500kB/94kB regression on the eager initial bundle for a feature
  most page loads never use.
- **Manual `enumerateDevices()` + `facingMode: 'environment'` constraint
  construction** — rejected per Decision 2: `decodeFromVideoDevice(undefined,
  ...)` already prefers the rear camera; the extra plumbing would duplicate
  behavior the library provides for free.
- **A second "camera scan" method parallel to `validateScan()`** — rejected per
  Decision 4: would duplicate (and risk drifting from) the count-lock guard,
  the error-code mapping, and the optimistic list update.
- **Auto-dismissing the error banner too, or never auto-dismissing success even
  in camera mode** — rejected per Decision 5: a rejection needs a conscious
  acknowledgment; a continuous scanning session needs the success banner out
  of the way for the next scan.
