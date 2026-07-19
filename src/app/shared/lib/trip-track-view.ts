import { formatDisplayDateTime, formatDisplayTime } from './display-date-time';

/** SPEC-OBRS-426 — GET /api/private/tickets/{ticketId}/vehicle-position
 * response `data` (shipped by OBRS-425, frozen contract, not changed here).
 * `state` is typed as the six known values but the resolver below treats an
 * unrecognized future value safely (U6) — this type is documentation, not an
 * enforced runtime guarantee. Key presence is guaranteed by the backend
 * (`CustomerTripPositionRespDto` is deliberately NOT `@JsonInclude(NON_NULL)`)
 * — every field below is always present on the wire, even when `null`. */
export interface CustomerTripPositionRespDto {
  state: 'LIVE' | 'STALE' | 'NO_SIGNAL' | 'UNAVAILABLE' | 'NOT_YET_OPEN' | 'CLOSED';
  lat: number | null;
  lon: number | null;
  recordedAt: string | null;
  stale: boolean;
  windowOpensAt: string | null;
}

export type TripTrackMarkerStyle = 'live' | 'stale';

/** Active lane: LIVE / STALE / NO_SIGNAL / UNAVAILABLE — the van is (or may at
 * any moment be) moving. */
export const TRIP_TRACK_POLL_ACTIVE_MS = 60000;
/** Idle lane: NOT_YET_OPEN / CLOSED — nothing is moving, but NEITHER state is
 * terminal (BR-16 — `CLOSED` reopens when staff enter a delay;
 * `NOT_YET_OPEN`'s window opens on schedule). Do NOT reuse
 * `ADMIN_POLL_INTERVAL_MS` (a different product's cadence). */
export const TRIP_TRACK_POLL_IDLE_MS = 300000;

export interface TripTrackView {
  /** The raw backend state, carried through for template branching — the
   * DISPATCH decision (which copy/lane/marker to use) has already happened
   * below; this is display convenience, not a second dispatch. */
  state: CustomerTripPositionRespDto['state'];
  chipKey: string;
  bodyKey: string;
  hasMap: boolean;
  markerStyle: TripTrackMarkerStyle | null;
  pollIntervalMs: number;
  lat: number | null;
  lon: number | null;
  /** Pre-formatted display string — NEVER a raw ISO value (BR-12/BR-12a).
   * '' when this state carries no timestamp to show. */
  timeText: string;
}

const NS = 'MY_BOOKINGS.TRIP_TRACK.STATE.';

/** The neutral "can't show a position" panel — also the fail-closed default
 * for an unrecognized future backend state (U6). */
function unavailableView(): TripTrackView {
  return {
    state: 'UNAVAILABLE',
    chipKey: NS + 'UNAVAILABLE',
    bodyKey: NS + 'UNAVAILABLE_BODY',
    hasMap: false,
    markerStyle: null,
    pollIntervalMs: TRIP_TRACK_POLL_ACTIVE_MS,
    lat: null,
    lon: null,
    timeText: '',
  };
}

/**
 * L1 (SPEC-OBRS-426 BR-10) — the ordered `state` → view-model resolver for
 * the customer trip tracker. `state` is the ONLY dispatch key: never `stale`
 * (decorative-redundant per the backend javadoc — branching on it first would
 * paint five of six states identically) and never `lat != null` (`STALE` also
 * carries coordinates, and that is exactly the state that must not look
 * live). The switch is exhaustive over the six known backend states, with a
 * `default` that fails CLOSED to the neutral "unavailable" panel so an
 * unrecognized future state can never render as live (U6).
 *
 * `lang` is only consulted for `NOT_YET_OPEN`'s `windowOpensAt` (BR-12a — the
 * one timestamp on this surface that needs a localized month name because it
 * can be genuinely days away).
 */
export function resolveTripTrackView(
  dto: CustomerTripPositionRespDto,
  lang?: string | null
): TripTrackView {
  switch (dto.state) {
    case 'LIVE':
      return {
        state: 'LIVE',
        chipKey: NS + 'LIVE',
        bodyKey: NS + 'LIVE_BODY',
        hasMap: true,
        markerStyle: 'live',
        pollIntervalMs: TRIP_TRACK_POLL_ACTIVE_MS,
        lat: dto.lat,
        lon: dto.lon,
        // BR-12a: recordedAt can only ever be "today" — time-only.
        timeText: formatDisplayTime(dto.recordedAt),
      };

    case 'STALE':
      return {
        state: 'STALE',
        chipKey: NS + 'STALE',
        bodyKey: NS + 'STALE_BODY',
        hasMap: true,
        // BR-11: STALE must be visually degraded, never the live token.
        markerStyle: 'stale',
        pollIntervalMs: TRIP_TRACK_POLL_ACTIVE_MS,
        lat: dto.lat,
        lon: dto.lon,
        timeText: formatDisplayTime(dto.recordedAt),
      };

    case 'NO_SIGNAL':
      return {
        state: 'NO_SIGNAL',
        chipKey: NS + 'NO_SIGNAL',
        bodyKey: NS + 'NO_SIGNAL_BODY',
        hasMap: false,
        markerStyle: null,
        // Transient by definition — active lane (BR-16).
        pollIntervalMs: TRIP_TRACK_POLL_ACTIVE_MS,
        lat: null,
        lon: null,
        timeText: '',
      };

    case 'UNAVAILABLE':
      return {
        state: 'UNAVAILABLE',
        chipKey: NS + 'UNAVAILABLE',
        bodyKey: NS + 'UNAVAILABLE_BODY',
        hasMap: false,
        markerStyle: null,
        // Not terminal — a mutable admin/staff fact (vehicle assignment) can
        // flip this to LIVE at any moment. Active lane (BR-16).
        pollIntervalMs: TRIP_TRACK_POLL_ACTIVE_MS,
        lat: null,
        lon: null,
        timeText: '',
      };

    case 'NOT_YET_OPEN':
      return {
        state: 'NOT_YET_OPEN',
        chipKey: NS + 'NOT_YET_OPEN',
        bodyKey: NS + 'NOT_YET_OPEN_BODY',
        hasMap: false,
        markerStyle: null,
        // Idle lane — an inbound leg can be days out (BR-16).
        pollIntervalMs: TRIP_TRACK_POLL_IDLE_MS,
        lat: null,
        lon: null,
        // BR-12a: windowOpensAt is UNBOUNDED (may be days away) — full date+time.
        timeText: formatDisplayDateTime(dto.windowOpensAt, lang),
      };

    case 'CLOSED':
      return {
        state: 'CLOSED',
        chipKey: NS + 'CLOSED',
        bodyKey: NS + 'CLOSED_BODY',
        hasMap: false,
        markerStyle: null,
        // Not terminal — a staff delay entry can reopen the window mid-session
        // (BR-16). Idle lane.
        pollIntervalMs: TRIP_TRACK_POLL_IDLE_MS,
        lat: null,
        lon: null,
        timeText: '',
      };

    default:
      return unavailableView();
  }
}
