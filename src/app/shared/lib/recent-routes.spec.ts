import { MyBookingDto } from '../interfaces/my-booking.interface';
import { StationApi } from '../interfaces/station.interface';
import {
  RECENT_ROUTES_CACHE_KEY,
  deriveRecentRouteCandidates,
  extractRecentRoutePairsFromBookings,
  loadRecentRoutesFromLocalStorage,
  rankRecentRoutePairs,
  saveRecentRoute,
  tallyRecentRoutePairs,
} from './recent-routes';

function station(id: number, slug = `station-${id}`): StationApi {
  return {
    id,
    slug,
    status: 'active',
    stopType: 'station',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function booking(overrides: Partial<MyBookingDto> = {}): MyBookingDto {
  return {
    id: 1,
    createdAt: '2026-06-01T10:00:00',
    bookingSchedules: [
      {
        id: 1,
        fromStop: { id: 1, code: 'a' },
        toStop: { id: 2, code: 'b' },
      },
    ],
    ...overrides,
  };
}

describe('recent-routes lib', () => {
  afterEach(() => {
    localStorage.removeItem(RECENT_ROUTES_CACHE_KEY);
  });

  describe('deriveRecentRouteCandidates', () => {
    it('dedupes by directional (origin,destination) pair, keeping the first (most recent) occurrence', () => {
      const stations = [station(1), station(2), station(3)];
      const pairs = [
        { originId: 1, destinationId: 2 },
        { originId: 3, destinationId: 1 },
        { originId: 1, destinationId: 2 }, // duplicate — dropped
      ];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result.length).toBe(2);
      expect(result[0].originStation.id).toBe(1);
      expect(result[0].destinationStation.id).toBe(2);
      expect(result[1].originStation.id).toBe(3);
      expect(result[1].destinationStation.id).toBe(1);
    });

    it('treats A->B and B->A as distinct routes (directional dedupe)', () => {
      const stations = [station(1), station(2)];
      const pairs = [
        { originId: 1, destinationId: 2 },
        { originId: 2, destinationId: 1 },
      ];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result.length).toBe(2);
    });

    it('preserves most-recent-first ordering from the input pair order', () => {
      const stations = [station(1), station(2), station(3), station(4)];
      const pairs = [
        { originId: 3, destinationId: 4 },
        { originId: 1, destinationId: 2 },
      ];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result[0].originStation.id).toBe(3);
      expect(result[1].originStation.id).toBe(1);
    });

    it('caps at 3 candidates, applied AFTER dedupe/filter', () => {
      const stations = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => station(id));
      // 5 distinct pairs — only the first 3 valid ones should survive.
      const pairs = [
        { originId: 1, destinationId: 2 },
        { originId: 3, destinationId: 4 },
        { originId: 5, destinationId: 6 },
        { originId: 7, destinationId: 8 },
        { originId: 2, destinationId: 1 },
      ];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result.length).toBe(3);
    });

    it('AC#6: drops the whole route when the ORIGIN is not in the current active station list', () => {
      const stations = [station(2)]; // id 1 missing
      const pairs = [{ originId: 1, destinationId: 2 }];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result).toEqual([]);
    });

    it('AC#6: drops the whole route when the DESTINATION is not in the current active station list', () => {
      const stations = [station(1)]; // id 2 missing
      const pairs = [{ originId: 1, destinationId: 2 }];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result).toEqual([]);
    });

    it('AC#6: a deactivated route never occupies one of the 3 slots — a valid 4th pair backfills it', () => {
      const stations = [station(1), station(2), station(5), station(6)]; // 3,4 missing
      const pairs = [
        { originId: 1, destinationId: 2 }, // valid
        { originId: 3, destinationId: 4 }, // dropped (both missing)
        { originId: 5, destinationId: 6 }, // valid — should backfill the dropped slot
      ];

      const result = deriveRecentRouteCandidates(pairs, stations);

      expect(result.length).toBe(2);
      expect(result.map((c) => c.originStation.id)).toEqual([1, 5]);
    });

    it('returns an empty array for an empty pair list (the empty state is a legitimate value, not an error)', () => {
      expect(deriveRecentRouteCandidates([], [station(1), station(2)])).toEqual([]);
    });
  });

  describe('extractRecentRoutePairsFromBookings', () => {
    it('sorts by root booking.createdAt descending (newest first)', () => {
      const bookings = [
        booking({ id: 1, createdAt: '2026-01-01T00:00:00', bookingSchedules: [{ fromStop: { id: 1 }, toStop: { id: 2 } }] }),
        booking({ id: 2, createdAt: '2026-06-01T00:00:00', bookingSchedules: [{ fromStop: { id: 3 }, toStop: { id: 4 } }] }),
      ];

      const pairs = extractRecentRoutePairsFromBookings(bookings);

      expect(pairs[0]).toEqual({ originId: 3, destinationId: 4 });
      expect(pairs[1]).toEqual({ originId: 1, destinationId: 2 });
    });

    it('treats a missing createdAt as oldest', () => {
      const bookings = [
        booking({ id: 1, createdAt: undefined, bookingSchedules: [{ fromStop: { id: 1 }, toStop: { id: 2 } }] }),
        booking({ id: 2, createdAt: '2026-06-01T00:00:00', bookingSchedules: [{ fromStop: { id: 3 }, toStop: { id: 4 } }] }),
      ];

      const pairs = extractRecentRoutePairsFromBookings(bookings);

      expect(pairs[0]).toEqual({ originId: 3, destinationId: 4 });
      expect(pairs[1]).toEqual({ originId: 1, destinationId: 2 });
    });

    it('skips a booking whose leg is missing fromStop.id or toStop.id', () => {
      const bookings = [
        booking({ id: 1, bookingSchedules: [{ fromStop: { code: 'a' }, toStop: { id: 2 } }] }),
        booking({ id: 2, bookingSchedules: [{ fromStop: { id: 1 }, toStop: { code: 'b' } }] }),
        booking({ id: 3, bookingSchedules: [{ fromStop: { id: 1 }, toStop: { id: 2 } }] }),
      ];

      const pairs = extractRecentRoutePairsFromBookings(bookings);

      expect(pairs).toEqual([{ originId: 1, destinationId: 2 }]);
    });

    it('does not dedupe — dedupe is the shared derivation step, not this extraction', () => {
      const bookings = [
        booking({ id: 1, createdAt: '2026-06-02T00:00:00' }),
        booking({ id: 2, createdAt: '2026-06-01T00:00:00' }),
      ];

      const pairs = extractRecentRoutePairsFromBookings(bookings);

      expect(pairs.length).toBe(2);
    });
  });

  describe('localStorage contract', () => {
    it('returns an empty array when nothing is stored', () => {
      expect(loadRecentRoutesFromLocalStorage()).toEqual([]);
    });

    it('reads back a previously saved route', () => {
      saveRecentRoute(1, 2);

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes.length).toBe(1);
      expect(routes[0].originId).toBe(1);
      expect(routes[0].destinationId).toBe(2);
      expect(typeof routes[0].savedAt).toBe('string');
    });

    it('newest-first: a later save unshifts to the front', () => {
      saveRecentRoute(1, 2);
      saveRecentRoute(3, 4);

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes[0]).toEqual(jasmine.objectContaining({ originId: 3, destinationId: 4 }));
      expect(routes[1]).toEqual(jasmine.objectContaining({ originId: 1, destinationId: 2 }));
    });

    it('write dedup: re-saving the same directional pair moves it to front instead of duplicating', () => {
      saveRecentRoute(1, 2);
      saveRecentRoute(3, 4);
      saveRecentRoute(1, 2);

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes.length).toBe(2);
      expect(routes[0]).toEqual(jasmine.objectContaining({ originId: 1, destinationId: 2 }));
    });

    it('caps stored entries at 10 raw entries', () => {
      for (let i = 0; i < 12; i++) {
        saveRecentRoute(i, i + 100);
      }

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes.length).toBe(10);
      // Most recent (i=11) stays at the front; the two oldest (i=0,1) are evicted.
      expect(routes[0]).toEqual(jasmine.objectContaining({ originId: 11, destinationId: 111 }));
    });

    it('clears the key and returns [] on a version mismatch', () => {
      localStorage.setItem(
        RECENT_ROUTES_CACHE_KEY,
        JSON.stringify({ version: 'v0', routes: [{ originId: 1, destinationId: 2, savedAt: 'x' }] })
      );

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes).toEqual([]);
      expect(localStorage.getItem(RECENT_ROUTES_CACHE_KEY)).toBeNull();
    });

    it('clears the key and returns [] when routes is not an array', () => {
      // Must be the CURRENT version, or this would pass on the version branch
      // instead of the not-an-array branch and pin nothing.
      localStorage.setItem(RECENT_ROUTES_CACHE_KEY, JSON.stringify({ version: 'v2', routes: 'not-an-array' }));

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes).toEqual([]);
      expect(localStorage.getItem(RECENT_ROUTES_CACHE_KEY)).toBeNull();
    });

    it('clears the key and returns [] on a JSON parse failure', () => {
      localStorage.setItem(RECENT_ROUTES_CACHE_KEY, '{not valid json');

      const routes = loadRecentRoutesFromLocalStorage();

      expect(routes).toEqual([]);
      expect(localStorage.getItem(RECENT_ROUTES_CACHE_KEY)).toBeNull();
    });
  });

  describe('frequency ranking (OBRS-923)', () => {
    describe('tallyRecentRoutePairs', () => {
      it('counts repeated pairs — the API source expresses frequency as duplicates', () => {
        const tallied = tallyRecentRoutePairs([
          { originId: 1, destinationId: 2 },
          { originId: 3, destinationId: 4 },
          { originId: 1, destinationId: 2 },
          { originId: 1, destinationId: 2 },
        ]);

        expect(tallied.length).toBe(2);
        expect(tallied[0]).toEqual({ originId: 1, destinationId: 2, count: 3, recencyIndex: 0 });
        expect(tallied[1]).toEqual({ originId: 3, destinationId: 4, count: 1, recencyIndex: 1 });
      });

      it('sums an explicit count — the localStorage source expresses frequency as a field', () => {
        const tallied = tallyRecentRoutePairs([
          { originId: 1, destinationId: 2, count: 7 },
          { originId: 3, destinationId: 4, count: 2 },
        ]);

        expect(tallied.map((t) => t.count)).toEqual([7, 2]);
      });

      it('is idempotent — tallying an already-tallied list does not inflate the weights', () => {
        const once = tallyRecentRoutePairs([
          { originId: 1, destinationId: 2 },
          { originId: 1, destinationId: 2 },
        ]);

        expect(tallyRecentRoutePairs(once).map((t) => t.count)).toEqual([2]);
      });

      it('treats a missing/garbage count as 1 rather than NaN', () => {
        const tallied = tallyRecentRoutePairs([
          { originId: 1, destinationId: 2, count: NaN },
          { originId: 3, destinationId: 4, count: 0 },
        ]);

        expect(tallied.map((t) => t.count)).toEqual([1, 1]);
      });

      it('keeps A->B and B->A as separate tallies (directional)', () => {
        const tallied = tallyRecentRoutePairs([
          { originId: 1, destinationId: 2 },
          { originId: 2, destinationId: 1 },
        ]);

        expect(tallied.length).toBe(2);
      });
    });

    describe('rankRecentRoutePairs', () => {
      it('reserves slot 1 for the MOST RECENT route even when it is the least frequent', () => {
        const ranked = rankRecentRoutePairs([
          { originId: 9, destinationId: 8, count: 1, recencyIndex: 0 },
          { originId: 1, destinationId: 2, count: 5, recencyIndex: 1 },
        ]);

        expect(ranked[0].originId).toBe(9);
        expect(ranked[1].originId).toBe(1);
      });

      it('orders every slot AFTER the first by frequency, descending', () => {
        const ranked = rankRecentRoutePairs([
          { originId: 9, destinationId: 8, count: 1, recencyIndex: 0 },
          { originId: 1, destinationId: 2, count: 2, recencyIndex: 1 },
          { originId: 3, destinationId: 4, count: 6, recencyIndex: 2 },
          { originId: 5, destinationId: 6, count: 4, recencyIndex: 3 },
        ]);

        expect(ranked.map((r) => r.originId)).toEqual([9, 3, 5, 1]);
      });

      it('breaks a frequency tie by recency', () => {
        const ranked = rankRecentRoutePairs([
          { originId: 9, destinationId: 8, count: 1, recencyIndex: 0 },
          { originId: 5, destinationId: 6, count: 3, recencyIndex: 2 },
          { originId: 1, destinationId: 2, count: 3, recencyIndex: 1 },
        ]);

        // Both 3s — the one seen more recently (lower recencyIndex) wins.
        expect(ranked.map((r) => r.originId)).toEqual([9, 1, 5]);
      });

      it('returns the input unchanged for 0 and 1 entries', () => {
        expect(rankRecentRoutePairs([])).toEqual([]);
        const single = [{ originId: 1, destinationId: 2, count: 1, recencyIndex: 0 }];
        expect(rankRecentRoutePairs(single)).toEqual(single);
      });

      it('does not mutate its input', () => {
        const input = [
          { originId: 9, destinationId: 8, count: 1, recencyIndex: 0 },
          { originId: 1, destinationId: 2, count: 5, recencyIndex: 1 },
        ];
        const snapshot = JSON.stringify(input);

        rankRecentRoutePairs(input);

        expect(JSON.stringify(input)).toBe(snapshot);
      });
    });

    describe('deriveRecentRouteCandidates — end to end', () => {
      it('the OBRS-923 case: three off-pattern trips no longer evict the habitual route', () => {
        const stations = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => station(id));
        // Newest-first, as both sources deliver: three one-off trips on top of a
        // route booked five times.
        const pairs = [
          { originId: 7, destinationId: 8 },
          { originId: 5, destinationId: 6 },
          { originId: 3, destinationId: 4 },
          ...Array.from({ length: 5 }, () => ({ originId: 1, destinationId: 2 })),
        ];

        const result = deriveRecentRouteCandidates(pairs, stations);

        // Slot 1 = the trip just taken; slot 2 = the habit that used to be evicted.
        expect(result.map((c) => c.originStation.id)).toEqual([7, 1, 5]);
      });

      // Must-NOT: pure frequency would rank the habitual route FIRST and drop the
      // just-taken trip to slot 2. Without this, "hybrid" and "pure frequency"
      // would both satisfy the case above's membership.
      it('does NOT rank purely by frequency — the just-taken trip keeps slot 1', () => {
        const stations = [1, 2, 9, 8].map((id) => station(id));
        const pairs = [
          { originId: 9, destinationId: 8 },
          ...Array.from({ length: 4 }, () => ({ originId: 1, destinationId: 2 })),
        ];

        const result = deriveRecentRouteCandidates(pairs, stations);

        expect(result[0].originStation.id).toBe(9);
      });

      it('honours an explicit count coming from the localStorage source', () => {
        const stations = [1, 2, 3, 4, 9, 8].map((id) => station(id));
        // Already deduped, one entry per route — exactly what
        // loadRecentRoutesFromLocalStorage() hands HomeBookingComponent.
        const pairs = [
          { originId: 9, destinationId: 8, count: 1 },
          { originId: 3, destinationId: 4, count: 1 },
          { originId: 1, destinationId: 2, count: 9 },
        ];

        const result = deriveRecentRouteCandidates(pairs, stations);

        expect(result.map((c) => c.originStation.id)).toEqual([9, 1, 3]);
      });

      it('AC#6 still applies AFTER ranking — a frequent route with a deactivated station is dropped', () => {
        const stations = [station(9), station(8), station(3), station(4)]; // 1,2 missing
        const pairs = [
          { originId: 9, destinationId: 8, count: 1 },
          { originId: 1, destinationId: 2, count: 99 }, // most frequent, but deactivated
          { originId: 3, destinationId: 4, count: 2 },
        ];

        const result = deriveRecentRouteCandidates(pairs, stations);

        expect(result.map((c) => c.originStation.id)).toEqual([9, 3]);
      });
    });

    describe('localStorage count contract', () => {
      it('starts a new route at count 1', () => {
        saveRecentRoute(1, 2);

        expect(loadRecentRoutesFromLocalStorage()[0].count).toBe(1);
      });

      it('increments the count when the same directional pair is searched again', () => {
        saveRecentRoute(1, 2);
        saveRecentRoute(1, 2);
        saveRecentRoute(1, 2);

        const routes = loadRecentRoutesFromLocalStorage();
        expect(routes.length).toBe(1);
        expect(routes[0].count).toBe(3);
      });

      it('carries the count across an intervening save of a different route', () => {
        saveRecentRoute(1, 2);
        saveRecentRoute(3, 4);
        saveRecentRoute(1, 2);

        const routes = loadRecentRoutesFromLocalStorage();
        expect(routes[0]).toEqual(jasmine.objectContaining({ originId: 1, count: 2 }));
        expect(routes[1]).toEqual(jasmine.objectContaining({ originId: 3, count: 1 }));
      });

      it('counts A->B and B->A separately', () => {
        saveRecentRoute(1, 2);
        saveRecentRoute(2, 1);

        const routes = loadRecentRoutesFromLocalStorage();
        expect(routes.length).toBe(2);
        expect(routes.every((r) => r.count === 1)).toBe(true);
      });

      it('normalizes a garbage stored count to 1 instead of returning NaN', () => {
        localStorage.setItem(
          RECENT_ROUTES_CACHE_KEY,
          JSON.stringify({
            version: 'v2',
            routes: [{ originId: 1, destinationId: 2, savedAt: 'x', count: 'lots' }],
          })
        );

        expect(loadRecentRoutesFromLocalStorage()[0].count).toBe(1);
      });

      // The accepted migration consequence, pinned so it cannot regress into a
      // surprise: a v1 payload carries no counts and is discarded wholesale.
      it('discards a v1 payload — anonymous history is wiped exactly once on upgrade', () => {
        localStorage.setItem(
          RECENT_ROUTES_CACHE_KEY,
          JSON.stringify({
            version: 'v1',
            routes: [{ originId: 1, destinationId: 2, savedAt: 'x' }],
          })
        );

        expect(loadRecentRoutesFromLocalStorage()).toEqual([]);
        expect(localStorage.getItem(RECENT_ROUTES_CACHE_KEY)).toBeNull();
      });
    });
  });
});
