import {
  collectBookableDestinationSlugs,
  collectBookableOriginSlugs,
  filterStationsBySlugs,
  RouteSegments,
} from './bookable-stations';
import { RouteStop } from '../interfaces/route-map.interface';
import { StationApi } from '../interfaces/station.interface';

function stop(order: number, slug: string): RouteStop {
  return {
    order,
    slug,
    name: slug,
    address: '',
    approxTime: '',
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

function station(id: number, slug: string): StationApi {
  return {
    id,
    slug,
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };
}

/** The prod shape in miniature (measured 2026-08-10): two routes that are the
 *  two directions of one corridor, and a drop-off-only stop on each side. */
const OUTBOUND: RouteSegments = {
  pickup: [stop(1, 'ban-bueng'), stop(2, 'nong-chak')],
  dropoff: [stop(3, 'mo-chit'), stop(4, 'lat-krabang')],
};
const INBOUND: RouteSegments = {
  pickup: [stop(1, 'mo-chit'), stop(2, 'si-nakharin')],
  dropoff: [stop(3, 'nong-chak'), stop(4, 'ban-bueng')],
};

describe('collectBookableOriginSlugs', () => {
  it('unions the pickups of every route and excludes drop-off-only stops', () => {
    const slugs = collectBookableOriginSlugs([OUTBOUND, INBOUND]);

    expect([...slugs].sort()).toEqual([
      'ban-bueng',
      'mo-chit',
      'nong-chak',
      'si-nakharin',
    ]);
    // `lat-krabang` is a dropoff on the outbound route and appears on no
    // pickup list — the exact defect OBRS-1213 was opened for.
    expect(slugs.has('lat-krabang')).toBeFalse();
  });

  it('returns an empty set for no routes rather than throwing', () => {
    expect(collectBookableOriginSlugs([]).size).toBe(0);
    expect(collectBookableOriginSlugs(null).size).toBe(0);
  });
});

describe('collectBookableDestinationSlugs', () => {
  it('offers every drop-off across all routes when no origin is chosen', () => {
    const slugs = collectBookableDestinationSlugs([OUTBOUND, INBOUND], null);

    expect([...slugs].sort()).toEqual([
      'ban-bueng',
      'lat-krabang',
      'mo-chit',
      'nong-chak',
    ]);
  });

  it('keeps only the drop-offs downstream of the chosen origin', () => {
    const slugs = collectBookableDestinationSlugs([OUTBOUND, INBOUND], 'nong-chak');

    // `nong-chak` is a pickup at order 2 on OUTBOUND (drop-offs 3 and 4 both
    // qualify) and is NOT a pickup on INBOUND, so INBOUND contributes nothing —
    // its own `ban-bueng` drop-off must not leak in.
    expect([...slugs].sort()).toEqual(['lat-krabang', 'mo-chit']);
  });

  it('compares `order`, not array position — an upstream drop-off is excluded', () => {
    const route: RouteSegments = {
      pickup: [stop(5, 'midway')],
      // Deliberately listed newest-first so index order contradicts `order`:
      // an index-based rule would keep `early` and drop `late`.
      dropoff: [stop(9, 'late'), stop(2, 'early')],
    };

    const slugs = collectBookableDestinationSlugs([route], 'midway');

    expect([...slugs]).toEqual(['late']);
  });

  it('excludes a drop-off sharing the origin stop’s own order', () => {
    const route: RouteSegments = {
      pickup: [stop(3, 'same-stop')],
      dropoff: [stop(3, 'same-stop'), stop(4, 'onward')],
    };

    expect([...collectBookableDestinationSlugs([route], 'same-stop')]).toEqual([
      'onward',
    ]);
  });

  it('unions what BOTH routes can reach when the origin is served by both', () => {
    const a: RouteSegments = {
      pickup: [stop(1, 'shared')],
      dropoff: [stop(2, 'only-on-a')],
    };
    const b: RouteSegments = {
      pickup: [stop(1, 'shared')],
      dropoff: [stop(2, 'only-on-b')],
    };

    expect([...collectBookableDestinationSlugs([a, b], 'shared')].sort()).toEqual([
      'only-on-a',
      'only-on-b',
    ]);
  });

  it('returns an empty set for an origin that is on no pickup list', () => {
    expect(
      collectBookableDestinationSlugs([OUTBOUND, INBOUND], 'lat-krabang').size
    ).toBe(0);
  });
});

describe('filterStationsBySlugs', () => {
  const roster = [
    station(1, 'ban-bueng'),
    station(2, 'nong-chak'),
    station(3, 'mo-chit'),
    station(4, 'lat-krabang'),
  ];

  it('keeps only the stations whose slug is in the set', () => {
    const kept = filterStationsBySlugs(roster, new Set(['nong-chak', 'mo-chit']));

    expect(kept.map((s) => s.id)).toEqual([2, 3]);
  });

  it('returns the roster untouched for a null set (AC#6 degrade path)', () => {
    expect(filterStationsBySlugs(roster, null).map((s) => s.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('honours an EMPTY set as "nothing qualifies", unlike null', () => {
    expect(filterStationsBySlugs(roster, new Set<string>())).toEqual([]);
  });

  it('does not mutate or alias the roster it was handed', () => {
    const kept = filterStationsBySlugs(roster, null);

    expect(kept).not.toBe(roster as unknown as StationApi[]);
    expect(roster.length).toBe(4);
  });
});
