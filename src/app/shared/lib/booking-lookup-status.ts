import { hasOwnKey } from './own-key';

/**
 * OBRS-857 — booking/ticket status slug → the i18n key and chip token the public lookup renders.
 *
 * <p><b>Why it reuses `MY_BOOKINGS.STATUS.*` rather than minting `FIND_BOOKING.STATUS.*`.</b> Both
 * screens show the same five booking statuses to the same audience — the customer who made the
 * booking — so a second copy of that wording would be a second thing to keep in sync across three
 * locales, and the two would drift. This is NOT the mistake OBRS-427 fixed: that one leaked the
 * driver/back-office `STAFF.*` copy onto a customer screen, i.e. it reused wording written for a
 * different reader. Here the reader is identical.
 *
 * <p><b>Why a map and not string concatenation.</b> `'MY_BOOKINGS.STATUS.' + status | translate`
 * is what my-bookings does, and it renders the raw key verbatim when the backend adds a status
 * this bundle has never heard of — the exact user-visible failure the i18n parity gate cannot
 * catch, because the key does not exist in ANY locale. The lookup below can only ever produce a
 * key that ships, and `hasOwnKey` keeps `constructor`/`__proto__` off the screen (ADR-0028).
 */
const BOOKING_STATUS_KEYS = {
  pending: 'MY_BOOKINGS.STATUS.pending',
  confirmed: 'MY_BOOKINGS.STATUS.confirmed',
  cancelled: 'MY_BOOKINGS.STATUS.cancelled',
  expired: 'MY_BOOKINGS.STATUS.expired',
  refunded: 'MY_BOOKINGS.STATUS.refunded',
} as const;

/** Chip tone per status — mirrors `MyBookingsComponent.statusClass`. */
const BOOKING_STATUS_TONES = {
  confirmed: 'is-success',
  pending: 'is-warning',
  refunded: 'is-info',
  cancelled: 'is-danger',
  expired: 'is-danger',
} as const;

function normalize(status: string | null | undefined): string {
  return String(status ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Falls back to a generic "unknown status" line rather than to the slug: a passenger reading
 * `awaiting_settlement` off their own ticket has learned nothing, and it is how a database value
 * reaches a screen.
 */
export function bookingLookupStatusKey(status: string | null | undefined): string {
  const key = normalize(status);
  return hasOwnKey(BOOKING_STATUS_KEYS, key)
    ? BOOKING_STATUS_KEYS[key]
    : 'FIND_BOOKING.STATUS_UNKNOWN';
}

export function bookingLookupStatusTone(status: string | null | undefined): string {
  const key = normalize(status);
  return hasOwnKey(BOOKING_STATUS_TONES, key) ? BOOKING_STATUS_TONES[key] : 'is-danger';
}

/**
 * A stop's display label, falling back to its `code` — see `BookingLookupStop`. The backend
 * returns a null `label` for a stop renamed since the booking or missing a translation row for
 * this locale, and neither is a reason to render an empty cell on a boarding screen.
 */
export function bookingLookupStopLabel(
  stop: { code?: string | null; label?: string | null } | null | undefined
): string {
  if (!stop) {
    return '-';
  }
  const label = String(stop.label ?? '').trim();
  return label || String(stop.code ?? '').trim() || '-';
}
