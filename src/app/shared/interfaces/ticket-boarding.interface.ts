// Digital e-ticket QR + manual boarding-scan validation contract (OBRS-96):
//   GET  /api/private/tickets/{id}/boarding-token   (customer, per-ticket QR payload)
//   POST /api/private/tickets/boarding-scan          (staff/operator, manual code entry)
// Locked by the OBRS-96 UX spec; the backend implementation lands in parallel on
// `ao/obrs-96-eticket-qr` (OBRS-backend) — see docs/handoff.md Contract Requests
// for the cross-repo coordination note.

/** `GET /api/private/tickets/{id}/boarding-token` (200) response — the signed,
 * short-lived payload rendered as this ticket's QR code. */
export interface BoardingTokenDto {
  ticketId: number;
  ticketNumber: string;
  boardingToken: string;
  expiresAt: string;
}

/** `POST /api/private/tickets/boarding-scan` request body. `scheduleId` comes
 * from the boarding-list route param, not user input. */
export interface BoardingScanRequest {
  token: string;
  scheduleId: number;
}

/** `POST /api/private/tickets/boarding-scan` success (200) response. */
export interface BoardingScanResultDto {
  ticketId: number;
  ticketNumber: string;
  /**
   * OBRS-1232: the title as a stable CODE ('MISS'), separate from the name and untranslated on the
   * wire. Render it with the `titleLabel` pipe so switching language changes the word without a
   * refetch. A legacy free-text value the migration left alone comes through verbatim (AC-5).
   */
  passengerTitle?: string | null;
  passengerName: string;
  seatNumber: string;
  boardedAt: string;
}

/** OBRS-142/OBRS-243: one deferred boarding scan replayed by
 * `POST /api/private/tickets/boarding-scan/batch`. `token`/`scheduleId` are the
 * live `BoardingScanRequest` contract above; the two additions are:
 * - `clientRef` — a client-chosen correlation id echoed back verbatim on the
 *   result. OPTIONAL on the wire, but REQUIRED here: it is the IndexedDB key of
 *   the queued row (`OfflineBoardingQueueService`), and it is what lets a result
 *   be matched back to the row to dequeue.
 * - `capturedAt` — offset-ISO, stamped when the device actually scanned the
 *   ticket while offline, NEVER at sync time. The backend persists it as
 *   `boarded_at`. */
export interface BoardingScanBatchItem {
  clientRef: string;
  token: string;
  scheduleId: number;
  capturedAt: string;
}

/** `POST /api/private/tickets/boarding-scan/batch` request body. The backend
 * caps `items` at 500 (`@Size(max = 500)`). */
export interface BoardingBatchRequest {
  items: BoardingScanBatchItem[];
}

/** Per-item outcome inside `BoardingBatchResponse`. `ticketId`/`ticketNumber`
 * are populated once the token resolved to a ticket (even for a later-stage
 * failure), and stay `null` when it never did. `boardedAt` is set only on a
 * `BOARDED` item — note this shape carries NO `passengerName`/`seatNumber`,
 * unlike `BoardingScanResultDto`. */
export interface BoardingBatchItemResult {
  index: number;
  clientRef: string | null;
  ticketId: number | null;
  ticketNumber: string | null;
  /** `BOARDED` on success, otherwise one of `BOARDING_BATCH_ERROR_CODES`.
   * Typed `string` deliberately: this is un-normalized server text and a code
   * added server-side must not become a compile-time lie here (same reason
   * `mapBoardingScanErrorCode()` takes a raw string — see its OBRS-601 note). */
  status: string;
  message: string | null;
  boardedAt: string | null;
}

/** `POST /api/private/tickets/boarding-scan/batch` (200) response data. The
 * envelope is ALWAYS 200 — a per-item rejection is never an HTTP error. */
export interface BoardingBatchResponse {
  total: number;
  boardedCount: number;
  failedCount: number;
  results: BoardingBatchItemResult[];
}

/** OBRS-142: the success literal of `BoardingBatchItemResult.status` —
 * UPPERCASE `BOARDED` (`TicketService.STATUS_BOARDED`). */
export const BOARDING_BATCH_BOARDED_STATUS = 'BOARDED';

/** OBRS-142: the non-success `status` values the batch endpoint can emit, read
 * off `TicketService#processBoardingBatchItem` on `origin/dev` rather than off
 * its Javadoc. Two differences from that Javadoc, both verified in the code:
 * `BOARDING_WINDOW_NOT_OPEN` is NOT reachable here (the deferred path calls
 * `validateBoardingScopeAndRound`, not the `now()`-based
 * `validateBoardingPreconditions`), while `BOARDING_ROUND_ARRIVED` and
 * `TICKET_NOT_PERSON_OCCUPANT` are and the Javadoc omits both. */
export const BOARDING_BATCH_ERROR_CODES = [
  'INVALID_TICKET_TOKEN',
  'EXPIRED_TICKET_TOKEN',
  'WRONG_SCHEDULE_TICKET',
  'FORBIDDEN_DRIVER_SCOPE',
  'BOARDING_ROUND_ARRIVED',
  'TICKET_NOT_CONFIRMED',
  'TICKET_NOT_PERSON_OCCUPANT',
  'INVALID_CAPTURED_AT',
  'ALREADY_BOARDED',
] as const;

export type BoardingBatchErrorCode = (typeof BOARDING_BATCH_ERROR_CODES)[number];

/** Stable UPPER_SNAKE error codes surfaced by the boarding-scan endpoint.
 * Branch on these, never on `error.message` (design-system §9). */
export const BOARDING_SCAN_ERROR_CODES = [
  'INVALID_TICKET_TOKEN',
  'EXPIRED_TICKET_TOKEN',
  'WRONG_SCHEDULE_TICKET',
  'BOARDING_WINDOW_NOT_OPEN',
  'TICKET_NOT_CONFIRMED',
  'ALREADY_BOARDED',
  // Deliberately kept as `TICKET_ERROR_ID_NOT_FOUND` (not tidied to
  // `TICKET_NOT_FOUND`) — must match the backend's stable code exactly.
  'TICKET_ERROR_ID_NOT_FOUND',
  // OBRS-256: a boarding-scan attempted on a schedule already marked
  // `arrived` (backend forward-transition guard) — the boarding-list
  // count-lock surfaces this as a warning (see boarding-scan-error.ts).
  'BOARDING_ROUND_ARRIVED',
] as const;

export type BoardingScanErrorCode = (typeof BOARDING_SCAN_ERROR_CODES)[number] | 'GENERIC';

/** Stable UPPER_SNAKE error codes surfaced by the OBRS-130 board/unboard
 * actions (`POST /tickets/{id}/board`, `POST /tickets/{id}/unboard`) — its
 * own set, distinct from `BOARDING_SCAN_ERROR_CODES` above (no `INVALID_`/
 * `EXPIRED_TICKET_TOKEN`/`WRONG_SCHEDULE_TICKET` here, since these actions
 * take no token; `NOT_BOARDED` is unique to unboard). Branch on these, never
 * on `error.message` (design-system §9). */
export const BOARDING_ACTION_ERROR_CODES = [
  'ALREADY_BOARDED',
  'NOT_BOARDED',
  'TICKET_NOT_CONFIRMED',
  'BOARDING_WINDOW_NOT_OPEN',
  // Deliberately kept as `TICKET_ERROR_ID_NOT_FOUND` (not tidied to
  // `TICKET_NOT_FOUND`) — must match the backend's stable code exactly.
  'TICKET_ERROR_ID_NOT_FOUND',
  // OBRS-256: a board/unboard attempted on a schedule already marked
  // `arrived` (backend forward-transition guard).
  'BOARDING_ROUND_ARRIVED',
] as const;

export type BoardingActionErrorCode = (typeof BOARDING_ACTION_ERROR_CODES)[number] | 'GENERIC';

/** Stable UPPER_SNAKE error codes surfaced by the OBRS-296 child-fare
 * mismatch flag/unflag actions (`POST /tickets/{id}/flag-child-fare`,
 * `POST /tickets/{id}/unflag-child-fare`) — its own set, distinct from
 * `BOARDING_ACTION_ERROR_CODES` (this pair has no boarding-window/ticket-
 * confirmed guard of its own). Branch on these, never on `error.message`
 * (design-system §9). */
export const CHILD_FARE_FLAG_ERROR_CODES = ['ALREADY_FLAGGED', 'NOT_FLAGGED'] as const;

export type ChildFareFlagErrorCode = (typeof CHILD_FARE_FLAG_ERROR_CODES)[number] | 'GENERIC';
