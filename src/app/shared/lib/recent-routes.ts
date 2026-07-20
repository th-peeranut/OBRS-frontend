// Recent-route quick pick (OBRS-575) — Home search-form "tap to prefill" strip.
// Pure derivation + localStorage contract, deliberately kept out of any component
// so it can be unit-tested in isolation (same "ordered ladder, shared resolver"
// posture as `fleet-vehicle-status.ts` — see design-system.md §12).

import { MyBookingDto } from '../interfaces/my-booking.interface';
import { StationApi } from '../interfaces/station.interface';

/** An origin/destination id pair, source-agnostic (API history or localStorage). */
export interface RecentRoutePair {
  originId: number;
  destinationId: number;
}

/** A raw localStorage entry — the pair plus when it was saved. */
export interface RecentRouteRawEntry extends RecentRoutePair {
  savedAt: string;
}

/** A dedupe-and-resolved candidate ready for display — station objects come
 *  from the current active roster (`allProvinceStationList`), never a stale copy. */
export interface RecentRouteCandidate {
  originStation: StationApi;
  destinationStation: StationApi;
}

interface RecentRoutesCache {
  version: string;
  routes: RecentRouteRawEntry[];
}

export const RECENT_ROUTES_CACHE_KEY = 'obrs.recentRoutes.v1';
const RECENT_ROUTES_CACHE_VERSION = 'v1';

/** Raw entries kept in localStorage — more than the 3 displayed, so AC#6's
 *  active-station filter still has enough history left to fill 3 slots after
 *  a station is deactivated. */
const RECENT_ROUTES_STORAGE_CAP = 10;

/** Candidates actually rendered by the quick-pick strip. */
export const RECENT_ROUTES_DISPLAY_CAP = 3;

/**
 * Reads the recent-routes cache from localStorage.
 * Same parse-guard/version-check/clear-on-mismatch shape as
 * `station.reducer.ts`'s `loadFromLocalStorage()` — never throws, never
 * partially trusts a malformed payload.
 */
export function loadRecentRoutesFromLocalStorage(): RecentRouteRawEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_ROUTES_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as RecentRoutesCache;
    if (parsed.version !== RECENT_ROUTES_CACHE_VERSION || !Array.isArray(parsed.routes)) {
      localStorage.removeItem(RECENT_ROUTES_CACHE_KEY);
      return [];
    }

    return parsed.routes;
  } catch {
    try {
      localStorage.removeItem(RECENT_ROUTES_CACHE_KEY);
    } catch {
      // Secondary localStorage failure (e.g. private mode quota) — ignore.
    }
    return [];
  }
}

/**
 * Records a successful search's origin/destination pair for the anonymous
 * quick-pick source. Unconditional (not gated on auth state) — a route stays
 * available immediately after logout, when the source switches back to
 * localStorage. Caller is responsible for gating the CALL itself on both ids
 * resolving to a real station (see `HomeBookingComponent.onSearch()`).
 */
export function saveRecentRoute(originId: number, destinationId: number): void {
  const existing = loadRecentRoutesFromLocalStorage();
  // Write dedup: drop any existing entry for the same directional pair before
  // unshifting, so a repeat search moves to the front instead of growing the
  // array unbounded.
  const deduped = existing.filter(
    (entry) => !(entry.originId === originId && entry.destinationId === destinationId)
  );

  const next: RecentRouteRawEntry[] = [
    { originId, destinationId, savedAt: new Date().toISOString() },
    ...deduped,
  ].slice(0, RECENT_ROUTES_STORAGE_CAP);

  const cache: RecentRoutesCache = { version: RECENT_ROUTES_CACHE_VERSION, routes: next };
  try {
    localStorage.setItem(RECENT_ROUTES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota/private-mode write failure — best-effort, non-fatal.
  }
}

/**
 * Extracts an ordered (newest-first), non-deduped raw pair list from a page of
 * `GET /api/private/bookings/me` results.
 *
 * Sorts on root `booking.createdAt` — NOT `audit.createdAt`. `BookingRespDto`
 * flattens `AuditFields` via `@JsonUnwrapped`, so the wire payload has no
 * `audit` key at all; verified against live SIT
 * (`GET /api/private/bookings/me` root keys include `createdAt` directly).
 * A missing/unparseable value sorts as oldest.
 *
 * Takes `bookingSchedules[0]` as "the leg" — the same convention
 * `MyBookingsComponent.toView()` already uses, not the stricter
 * `legType.code === 'outbound'` resolver — v1 is scoped to the outbound leg
 * only (no round-trip prefill).
 */
export function extractRecentRoutePairsFromBookings(
  bookings: ReadonlyArray<MyBookingDto>
): RecentRoutePair[] {
  const sorted = [...bookings].sort(
    (a, b) => parseCreatedAtMillis(b.createdAt) - parseCreatedAtMillis(a.createdAt)
  );

  const pairs: RecentRoutePair[] = [];
  for (const booking of sorted) {
    const leg = booking.bookingSchedules?.[0];
    const originId = leg?.fromStop?.id;
    const destinationId = leg?.toStop?.id;

    if (originId === undefined || originId === null || destinationId === undefined || destinationId === null) {
      continue;
    }

    pairs.push({ originId: Number(originId), destinationId: Number(destinationId) });
  }

  return pairs;
}

function parseCreatedAtMillis(value: string | undefined): number {
  if (!value) return -Infinity;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : -Infinity;
}

/**
 * Shared derivation both sources (API history, localStorage) funnel through:
 * dedupe on the directional key, resolve against the CURRENT active station
 * roster, drop any route where either station is missing (AC#6 — covers both
 * "removed" and "deactivated", since `/api/stops` is the same roster the form
 * dropdowns already trust), cap at `RECENT_ROUTES_DISPLAY_CAP` — cap is applied
 * AFTER dedupe+filter so a deactivated route never silently occupies a slot.
 * Pure: pairs + station list → candidates, no side effects.
 */
export function deriveRecentRouteCandidates(
  pairs: ReadonlyArray<RecentRoutePair>,
  stationList: ReadonlyArray<StationApi>,
  cap: number = RECENT_ROUTES_DISPLAY_CAP
): RecentRouteCandidate[] {
  const seenPairs = new Set<string>();
  const candidates: RecentRouteCandidate[] = [];

  for (const pair of pairs) {
    if (candidates.length >= cap) break;

    const key = `${pair.originId}_${pair.destinationId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    const originStation = stationList.find((station) => station.id === pair.originId);
    const destinationStation = stationList.find((station) => station.id === pair.destinationId);
    if (!originStation || !destinationStation) continue;

    candidates.push({ originStation, destinationStation });
  }

  return candidates;
}
