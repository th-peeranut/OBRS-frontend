import { RouteSegments } from './bookable-stations';
import { RouteStop } from '../interfaces/route-map.interface';
import {
  buildStopOrderMap,
  groupStationsByProvince,
  ProvinceStopsApi,
  sortStationsByStopOrder,
} from './station-groups';
import { StationApi } from '../interfaces/station.interface';

/** A station in the shape `GET /api/stops` returns — only `id`/`slug` matter here. */
function station(id: number, slug: string): StationApi {
  return {
    id,
    slug,
    status: 'operational',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };
}

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

/**
 * The real prod shape, trimmed: `chonburi_bangkok` runs Chonburi → Bangkok and
 * `bangkok_chonburi` is the return leg. The interesting part reproduced here is
 * that the two routes' pickup sets are disjoint, and that `dropoff` orders do
 * NOT restart at 1 (measured 2026-08-11: 20–25 on one leg, 5–8 on the other).
 */
const ROUTES: RouteSegments[] = [
  {
    pickup: [stop(1, 'nong_chak'), stop(2, 'talat_nueang_chamnong'), stop(3, 'utcc')],
    dropoff: [stop(20, 'mo_chit_2'), stop(22, 'lat_krabang')],
  },
  {
    pickup: [stop(1, 'mo_chit_2'), stop(2, 'chatuchak')],
    dropoff: [stop(6, 'ban_bueng'), stop(8, 'nong_chak')],
  },
];

const PROVINCES: ProvinceStopsApi[] = [
  {
    slug: 'chonburi',
    translations: { th: { label: 'ชลบุรี' }, en: { label: 'Chonburi' }, zh: { label: '春武里' } },
    stops: [
      { code: 'nong_chak' },
      { code: 'talat_nueang_chamnong' },
      { code: 'utcc' },
      { code: 'ban_bueng' },
    ],
  },
  {
    slug: 'bangkok',
    translations: { th: { label: 'กรุงเทพมหานคร' }, en: { label: 'Bangkok' } },
    stops: [{ code: 'mo_chit_2' }, { code: 'chatuchak' }, { code: 'lat_krabang' }],
  },
];

describe('station-groups (OBRS-1212)', () => {
  describe('buildStopOrderMap', () => {
    it('returns null for null routes — "no route data", which callers read as "leave the order alone"', () => {
      expect(buildStopOrderMap(null, 'pickup')).toBeNull();
    });

    it('reads the pickup half for origins and the dropoff half for destinations', () => {
      const pickup = buildStopOrderMap(ROUTES, 'pickup')!;
      const dropoff = buildStopOrderMap(ROUTES, 'dropoff')!;

      // `nong_chak` is pickup #1 on the outbound leg and dropoff #8 on the
      // return leg. Reading the wrong half is how it would sort last in the
      // origin dropdown while being the very first stop of the route.
      expect(pickup.get('nong_chak')).toBe(1);
      expect(dropoff.get('nong_chak')).toBe(8);
    });

    it('keeps the FIRST order when a slug appears on more than one route, so the result cannot depend on which request finished first', () => {
      const flipped = [ROUTES[1], ROUTES[0]];
      // `mo_chit_2` is pickup #1 on the return leg and is not a pickup at all
      // on the outbound one, so this asserts the rule rather than an accident.
      expect(buildStopOrderMap(ROUTES, 'pickup')!.get('mo_chit_2')).toBe(1);
      expect(buildStopOrderMap(flipped, 'pickup')!.get('mo_chit_2')).toBe(1);
    });
  });

  describe('sortStationsByStopOrder', () => {
    it('AC#8: orders by position along the route, NOT by id', () => {
      // Ids ascending, route order descending — if the sort ever falls back to
      // id this test is the thing that goes red. This is the real defect
      // `V66__reorder_chonburi_bangkok_pickup.sql` left behind, where id 17/18
      // are swapped against `stop_order`.
      const stations = [station(30, 'utcc'), station(31, 'nong_chak')];
      const sorted = sortStationsByStopOrder(stations, buildStopOrderMap(ROUTES, 'pickup'));

      expect(sorted.map((s) => s.slug)).toEqual(['nong_chak', 'utcc']);
    });

    it('AC#8: puts "talat_nueang_chamnong" second, where the live dropdown shows it — not last, where /api/provinces/stops returns it', () => {
      const stations = [
        station(1, 'nong_chak'),
        station(3, 'utcc'),
        station(2, 'talat_nueang_chamnong'),
      ];
      const sorted = sortStationsByStopOrder(stations, buildStopOrderMap(ROUTES, 'pickup'));

      expect(sorted.map((s) => s.slug)).toEqual([
        'nong_chak',
        'talat_nueang_chamnong',
        'utcc',
      ]);
    });

    it('AC#10: is deterministic — the same input sorts the same way every run, and a repeated sort is a no-op', () => {
      const stations = [
        station(3, 'utcc'),
        station(1, 'nong_chak'),
        station(2, 'talat_nueang_chamnong'),
      ];
      const order = buildStopOrderMap(ROUTES, 'pickup');

      const once = sortStationsByStopOrder(stations, order).map((s) => s.slug);
      const twice = sortStationsByStopOrder(
        sortStationsByStopOrder(stations, order),
        order
      ).map((s) => s.slug);

      expect(twice).toEqual(once);
    });

    it('keeps stops the route map does not mention, placed after the ones it does — it orders, it never removes', () => {
      const stations = [station(9, 'somewhere_new'), station(1, 'nong_chak')];
      const sorted = sortStationsByStopOrder(stations, buildStopOrderMap(ROUTES, 'pickup'));

      expect(sorted.map((s) => s.slug)).toEqual(['nong_chak', 'somewhere_new']);
    });

    it('leaves the incoming order untouched when there is no route data', () => {
      const stations = [station(3, 'utcc'), station(1, 'nong_chak')];
      expect(sortStationsByStopOrder(stations, null).map((s) => s.slug)).toEqual([
        'utcc',
        'nong_chak',
      ]);
    });
  });

  describe('groupStationsByProvince', () => {
    it('AC#1: buckets stations under the province they belong to', () => {
      const groups = groupStationsByProvince(
        [station(1, 'nong_chak'), station(2, 'mo_chit_2'), station(3, 'utcc')],
        PROVINCES
      )!;

      expect(groups.map((g) => g.slug)).toEqual(['chonburi', 'bangkok']);
      expect(groups[0].stations.map((s) => s.slug)).toEqual(['nong_chak', 'utcc']);
      expect(groups[1].stations.map((s) => s.slug)).toEqual(['mo_chit_2']);
    });

    it('AC#5: carries the province label for th, en AND zh, in the shape localizedDropdownName() reads', () => {
      const groups = groupStationsByProvince([station(1, 'nong_chak')], PROVINCES)!;

      expect(groups[0].nameThai).toBe('ชลบุรี');
      expect(groups[0].nameEnglish).toBe('Chonburi');
      expect(groups[0].nameChinese).toBe('春武里');
    });

    it('AC#5: leaves a missing Chinese label EMPTY rather than filling it with Thai — localizedDropdownName() falls back to English, and Thai text in front of a zh reader is not a fallback', () => {
      const groups = groupStationsByProvince([station(2, 'mo_chit_2')], PROVINCES)!;

      // Bangkok has no zh label in this fixture, exactly as SIT has none today.
      expect(groups[0].nameChinese).toBe('');
      expect(groups[0].nameEnglish).toBe('Bangkok');
    });

    it('preserves the incoming station order inside each bucket, so ONE sort of the flat list orders every group', () => {
      const groups = groupStationsByProvince(
        [station(3, 'utcc'), station(1, 'nong_chak')],
        PROVINCES
      )!;

      expect(groups[0].stations.map((s) => s.slug)).toEqual(['utcc', 'nong_chak']);
    });

    it('drops a province that ends up with no station — a heading over nothing', () => {
      const groups = groupStationsByProvince([station(2, 'mo_chit_2')], PROVINCES)!;

      expect(groups.map((g) => g.slug)).toEqual(['bangkok']);
    });

    it('returns null when there is no province data, so the caller renders the flat list it has today', () => {
      expect(groupStationsByProvince([station(1, 'nong_chak')], null)).toBeNull();
    });

    it('keeps a station that belongs to no province, in a trailing unnamed group — the alternative is a stop that silently cannot be booked', () => {
      const groups = groupStationsByProvince(
        [station(1, 'nong_chak'), station(9, 'stop_with_no_province')],
        PROVINCES
      )!;

      expect(groups.length).toBe(2);
      expect(groups[1].slug).toBe('');
      expect(groups[1].stations.map((s) => s.slug)).toEqual(['stop_with_no_province']);
    });

    it('AC#9: never writes a sequence number into any label it produces', () => {
      const groups = groupStationsByProvince(
        [station(1, 'nong_chak'), station(3, 'utcc')],
        PROVINCES
      )!;

      const labels = [
        ...groups.map((g) => `${g.nameThai}${g.nameEnglish}${g.nameChinese ?? ''}`),
        ...groups.flatMap((g) => g.stations.map((s) => s.slug)),
      ];
      for (const label of labels) {
        expect(label).not.toMatch(/^\s*\d+[.)\s]/);
      }
    });
  });
});
