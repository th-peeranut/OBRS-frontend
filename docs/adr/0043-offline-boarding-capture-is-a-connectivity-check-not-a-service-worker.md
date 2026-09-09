# Offline boarding capture is a connectivity check, not a service worker (OBRS-142)

## Context

A driver scanning boarding QR codes on a moving bus loses signal. Before this
card the scan box had exactly one path: `POST /boarding-scan`, live. With no
network the scan simply failed, and the operator had nothing but paper.

The backend half (OBRS-243, already on `origin/dev`) added
`POST /api/private/tickets/boarding-scan/batch`, which replays a list of scans
each carrying the `capturedAt` moment the device recorded, and persists that
moment as `boarded_at` rather than the sync-time `now()`. It answers HTTP 200
for the batch and a per-item `status` for each scan; a rejected item never
aborts the others.

The card's own wording permits either "service worker **หรือ** connectivity
check".

## Decision

**Option B — capture on the device, replay later, and let the server decide.**
Connectivity is judged by `navigator.onLine` plus an `HttpErrorResponse` with
`status === 0`; there is no service worker.

Three parts:

1. `OfflineBoardingQueueService` — a raw-IndexedDB queue of
   `{ clientRef, token, scheduleId, capturedAt }` rows, keyed by a
   client-generated `clientRef`. `capturedAt` is stamped at the scan, never at
   sync. No npm dependency (`idb`, `dexie`, `fake-indexeddb` all refused); the
   only seam is an injected `IDBFactory`, which exists so a spec can drive the
   store. Unavailable IndexedDB degrades to "nothing queued" instead of
   throwing, so the scan box behaves exactly as it did before this card.
2. `BoardingListComponent` captures instead of calling the live endpoint when
   there is no network, and drains the queue in one `boardingScanBatch()` call
   on the `online` event and once on init.
3. Nothing client-side decides whether a passenger boarded.

### The captured banner never says "boarded"

The card's locked principle is *ไม่ trust ผล client*. A captured scan has not
been shown to the server, so the banner says **captured, awaiting
confirmation** and the manifest row is left untouched. Only after the batch
comes back does a row change, and it changes by refreshing the manifest.

### Every settled item is dequeued, including the failures

`BOARDED` and every error status alike are settled server-side. A refused item
left in the queue would be re-sent on every reconnect, forever. Rows survive
only when the whole HTTP call failed.

### Dedup is the server's, not ours

Re-sending an already-boarded ticket answers `ALREADY_BOARDED` and leaves the
original `boarded_at` untouched (the CAS in `TicketService`). So the client
does no dedup, and `ALREADY_BOARDED` is counted as boarded, not as a failure.

### The manifest is refreshed, not patched row by row

`BoardingBatchItemResult` carries no `passengerName`/`seatNumber`, and no
`boardedAt` at all for an `ALREADY_BOARDED` item — so the existing
`reflectBoardedInList()` (which takes a `BoardingScanResultDto`) cannot be
reused. Patching rows would mean inventing the values the refresh just fetches,
and the device has by definition just regained the network. One
`store.refresh()` is both the smaller change and the more correct one.

## Why not a service worker

- **The app has none.** There is no `@angular/pwa`, no `ngsw-config.json`, no
  registration anywhere in `src/`. Adding one is not a feature of this card —
  it is a whole-app caching policy with an app-wide blast radius (what is
  precached, what is stale-while-revalidate, how a deploy invalidates it), on a
  Netlify-hosted SPA that ships new bundles frequently.
- **It would not do this job anyway.** The problem is not serving the app shell
  offline; it is holding a *write* until the server can adjudicate it and then
  reconciling per item. A background-sync worker would still need this queue and
  this batch call.
- **A service worker on this project has already cost a QA run.** On SIT one
  served cached JS straight past Playwright's `page.route`, so a stubbed
  response never fired and three runs were spent chasing it
  (`FRONTEND-GOTCHAS.md:169`, OBRS-1085). Introducing one casually would put
  that trap back in front of every future E2E lane.

## Consequences

- A capture is worthless if IndexedDB refuses (private mode). The UI says so
  rather than claiming a capture that does not exist.
- The queue is per-device and per-browser-profile. A driver who captures on one
  device and reconnects on another loses nothing — the scans stay queued on the
  first device until it reconnects.
- `capturedAt` is the device's clock. The backend refuses a future timestamp
  with no skew grace and bounds the capture window at the departure day plus a
  ~06:00 next-day tail (`INVALID_CAPTURED_AT`), so a device with a wrong clock
  is told to fix it rather than silently recording a wrong boarding time.
- Not chunked at the backend's 500-item ceiling: a queue is scoped to one trip's
  seats, so the ceiling is not reachable.

## Links

- Backend: OBRS-243 — `TicketController#boardingScanBatch`,
  `TicketService#reconcileBoardingBatch` / `#admitBoardingDeferred` /
  `#validateCapturedAt`.
- OBRS-696 (`capturedAt`-based window), OBRS-1691 (a replay lands after the
  no-show sweeper has already flipped the ticket).
- OBRS-96 (the boarding-token pipeline this queue stores tokens from, untouched
  here).
