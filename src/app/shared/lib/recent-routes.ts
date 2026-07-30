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

/** A raw localStorage entry — the pair, when it was last saved, and how many
 *  times it has been searched. `count` is what makes the anonymous source
 *  rankable by frequency at all: the write path dedupes on the pair, so without
 *  an explicit counter every stored route looks equally habitual (OBRS-923). */
export interface RecentRouteRawEntry extends RecentRoutePair {
  savedAt: string;
  count: number;
}

/**
 * One entry per distinct route, carrying how often it appears and how recent
 * its newest appearance was — the single shape BOTH sources collapse into
 * before ranking, so the ranking rule is written once instead of per source.
 *
 * `recencyIndex` is a RANK, not a timestamp (0 = most recent). The API source
 * has no per-pair `savedAt` to compare, only the newest-first order it arrives
 * in, and that order is all the tie-break needs.
 */
export interface RecentRouteTally extends RecentRoutePair {
  count: number;
  recencyIndex: number;
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

// v1 -> v2 (OBRS-923): entries gained `count`. A v1 payload has no counts to
// migrate FROM — every v1 route was written exactly once by construction — so
// there is nothing to salvage and the existing version-mismatch branch below
// clears the key. Consequence, accepted deliberately rather than discovered
// later: every anonymous visitor's route history is wiped ONCE, on their first
// Home load after this deploys. Logged-in users are unaffected (their source is
// the bookings API, which is not cached here).
export const RECENT_ROUTES_CACHE_KEY = 'obrs.recentRoutes.v2';
const RECENT_ROUTES_CACHE_VERSION = 'v2';

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

    // Normalize `count` on read rather than trusting the payload: the version
    // check above only proves the SHAPE version, not that a hand-edited or
    // partially-written entry carries a usable number. A missing/garbage count
    // means "seen once", never NaN — a NaN would sort unpredictably and quietly
    // shuffle the strip.
    return parsed.routes.map((entry) => ({
      ...entry,
      count: Number.isFinite(entry?.count) && entry.count >= 1 ? Math.floor(entry.count) : 1,
    }));
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
  const isSamePair = (entry: RecentRouteRawEntry) =>
    entry.originId === originId && entry.destinationId === destinationId;

  // Write dedup: drop any existing entry for the same directional pair before
  // unshifting, so a repeat search moves to the front instead of growing the
  // array unbounded. The dedup is exactly why `count` has to be CARRIED FORWARD
  // here — it is the only place the anonymous source ever learns that a route
  // was searched more than once (OBRS-923).
  const previousCount = existing.find(isSamePair)?.count ?? 0;
  const deduped = existing.filter((entry) => !isSamePair(entry));

  const next: RecentRouteRawEntry[] = [
    {
      originId,
      destinationId,
      savedAt: new Date().toISOString(),
      count: previousCount + 1,
    },
    ...deduped,
    // Known limitation, not a bug: a route evicted by the 10-entry cap loses its
    // count and restarts at 1 if searched again. Keeping counts for routes the
    // user has abandoned would let a long-dead habit outrank a live one.
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
 * Collapses a newest-first, possibly-duplicated pair list into ONE weighted
 * entry per distinct route, preserving first-seen (= most recent) order.
 *
 * Handles both sources without branching on which one it got:
 *  - API pairs carry no `count`, so each occurrence contributes 1 — the
 *    duplicates ARE the frequency signal (`extractRecentRoutePairsFromBookings`
 *    deliberately does not dedupe).
 *  - localStorage entries are already one-per-route and carry their own count,
 *    which is summed in unchanged.
 *
 * Idempotent: tallying an already-tallied list returns the same weights, so a
 * caller cannot corrupt the ranking by funnelling twice.
 */
export function tallyRecentRoutePairs(
  pairs: ReadonlyArray<RecentRoutePair & { count?: number }>
): RecentRouteTally[] {
  const byKey = new Map<string, RecentRouteTally>();

  for (const pair of pairs) {
    const key = `${pair.originId}_${pair.destinationId}`;
    const weight = Number.isFinite(pair.count) && (pair.count as number) >= 1 ? (pair.count as number) : 1;

    const existing = byKey.get(key);
    if (existing) {
      existing.count += weight;
      continue;
    }

    byKey.set(key, {
      originId: pair.originId,
      destinationId: pair.destinationId,
      count: weight,
      // Insertion order over the newest-first input IS the recency rank.
      recencyIndex: byKey.size,
    });
  }

  return [...byKey.values()];
}

/**
 * The OBRS-923 ranking rule — HYBRID, not pure frequency:
 * slot 1 is reserved for the MOST RECENT route unconditionally, and the
 * remaining slots are ordered by how often each route was booked, ties broken
 * by recency.
 *
 * Why not pure frequency: a customer who has just moved, or is travelling
 * somewhere new this month, would otherwise see three slots owned entirely by a
 * habit they have stopped having, with the trip they actually just took nowhere
 * on the strip. Why not pure recency (the OBRS-575 behaviour this replaces):
 * three off-pattern trips evict a habitual customer's usual route from all
 * three slots. Reserving one slot buys both properties with no tunable
 * constant — deliberately NOT a time-decay score, which cannot be calibrated
 * against a production environment that has no traffic yet (OBRS-46).
 *
 * Pure and total: input order in, ranked order out, no side effects.
 */
export function rankRecentRoutePairs(
  tallied: ReadonlyArray<RecentRouteTally>
): RecentRouteTally[] {
  if (tallied.length <= 1) return [...tallied];

  const [mostRecent, ...rest] = tallied;
  const byFrequency = [...rest].sort(
    (a, b) => b.count - a.count || a.recencyIndex - b.recencyIndex
  );

  return [mostRecent, ...byFrequency];
}

/**
 * Shared derivation both sources (API history, localStorage) funnel through:
 * tally into one weighted entry per directional pair, rank by the hybrid
 * recency/frequency rule above, resolve against the CURRENT active station
 * roster, drop any route where either station is missing (AC#6 — covers both
 * "removed" and "deactivated", since `/api/stops` is the same roster the form
 * dropdowns already trust), cap at `RECENT_ROUTES_DISPLAY_CAP` — cap is applied
 * AFTER tally+filter so a deactivated route never silently occupies a slot.
 *
 * Tally and rank are called HERE rather than by each caller on purpose: they
 * used to be a dedupe inlined in the loop below, and moving them out would have
 * made "forgot to rank" a silent, correct-looking bug at every call site.
 * Pure: pairs + station list → candidates, no side effects.
 */
export function deriveRecentRouteCandidates(
  pairs: ReadonlyArray<RecentRoutePair & { count?: number }>,
  stationList: ReadonlyArray<StationApi>,
  cap: number = RECENT_ROUTES_DISPLAY_CAP
): RecentRouteCandidate[] {
  const ranked = rankRecentRoutePairs(tallyRecentRoutePairs(pairs));
  const candidates: RecentRouteCandidate[] = [];

  for (const pair of ranked) {
    if (candidates.length >= cap) break;

    const originStation = stationList.find((station) => station.id === pair.originId);
    const destinationStation = stationList.find((station) => station.id === pair.destinationId);
    if (!originStation || !destinationStation) continue;

    candidates.push({ originStation, destinationStation });
  }

  return candidates;
}
