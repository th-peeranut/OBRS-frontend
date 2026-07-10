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
  passengerName: string;
  seatNumber: string;
  boardedAt: string;
}

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
] as const;

export type BoardingActionErrorCode = (typeof BOARDING_ACTION_ERROR_CODES)[number] | 'GENERIC';
