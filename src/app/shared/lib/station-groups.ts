import { RouteSegments } from './bookable-stations';
import { StationApi } from '../interfaces/station.interface';

/**
 * OBRS-1212: one province as `GET /api/provinces/stops` returns it, reduced to
 * the two things the grouping needs — who belongs to it, and what to call it.
 *
 * <p>`stops[].code` is the join key, and it is the SAME string as
 * `StationApi.slug` from `GET /api/stops`: measured against prod 2026-08-11,
 * the two sets are equal (28 = 28) with no orphan on either side. That equality
 * is what lets the option objects keep coming from `/api/stops` — this endpoint
 * contributes membership and a province name, never a station.
 */
export interface ProvinceStopsApi {
  slug: string;
  translations?: Record<string, { label?: string | null } | null | undefined> | null;
  stops?: { code?: string | null }[] | null;
}

/**
 * A `dropdown-group-obrs` group. The `stations` array is what makes
 * `isGroupedOptions()` true — that check is `Array.isArray(options[0]?.stations)`
 * and has been false at runtime since it shipped, because `/api/stops` has no
 * such field (OBRS-1212's whole premise).
 *
 * <p>The three `name*` fields exist instead of passing the province's raw
 * `translations` through: `getValue()` resolves those with a locale collapsed to
 * `th | en` (`dropdown-group-obrs.component.ts`), so a `zh` visitor would read
 * the English province name even though prod HAS Chinese ones (春武里 / 曼谷,
 * measured 2026-08-11). `localizedDropdownName()` — which `getValue()` tries
 * FIRST — handles zh correctly and already falls back to English when a Chinese
 * label is missing. Carrying the label in the shape that helper reads closes
 * AC#5 without touching `getValue()`, which 7 other call sites share.
 */
export interface StationGroup {
  slug: string;
  nameThai: string;
  nameEnglish: string;
  nameChinese?: string;
  stations: StationApi[];
}

/** Which half of a route an ordering is being taken from. */
export type RouteSide = 'pickup' | 'dropoff';

/**
 * slug → position along the route, for one side of every active route.
 *
 * <p>This is the ONLY acceptable source of order for the dropdown (AC#8).
 * `/api/provinces/stops` returns the province's stops in whatever order
 * Postgres hands back — `Province.stops` is a plain `@OneToMany` with no
 * `@OrderBy` (`model/Province.java:25-26`) — and measured 2026-08-10 that put
 * "ตลาดเนื่องจำนงค์" last in Chonburi while today's dropdown shows it second.
 * Sorting by `id` is not a substitute either: id 17/18 are swapped against
 * `stop_order` on `chonburi_bangkok` (`V66__reorder_chonburi_bangkok_pickup.sql`).
 *
 * <p>Returns `null` when there is no route data, which every consumer reads as
 * "leave the incoming order alone" — the same load-bearing null as
 * `filterStationsBySlugs` (OBRS-1213 AC#6).
 *
 * <p>A slug present on more than one route keeps the FIRST order seen. Measured
 * on prod 2026-08-11 the two directions' pickup sets are disjoint, and so are
 * their dropoff sets, so today no slug is ever claimed twice on one side; the
 * rule is stated so that a third route on the corridor produces a stable list
 * rather than one that depends on request-completion order.
 */
export function buildStopOrderMap(
  routes: readonly RouteSegments[] | null | undefined,
  side: RouteSide
): Map<string, number> | null {
  if (!routes) {
    return null;
  }

  const orderBySlug = new Map<string, number>();
  for (const route of routes) {
    for (const stop of route?.[side] ?? []) {
      if (stop?.slug && !orderBySlug.has(stop.slug)) {
        orderBySlug.set(stop.slug, stop.order);
      }
    }
  }
  return orderBySlug;
}

/**
 * Sorts a station list by its position along the route, ascending.
 *
 * <p>Stations the map does not know about keep the incoming relative order and
 * are pushed AFTER the ones it does, rather than being dropped or floated to the
 * top: this function orders, it never removes — removal is
 * `filterStationsBySlugs`'s job and doing both here would let an ordering bug
 * silently delete a bookable stop.
 *
 * <p>The sort is made total by falling back to the incoming index, so it is
 * deterministic across reruns and backend restarts (AC#10) even when two stops
 * report the same `order`.
 */
export function sortStationsByStopOrder(
  stations: readonly StationApi[] | null | undefined,
  orderBySlug: ReadonlyMap<string, number> | null | undefined
): StationApi[] {
  const list = [...(stations ?? [])];
  if (!orderBySlug) {
    return list;
  }

  const indexOf = new Map<StationApi, number>();
  list.forEach((station, index) => indexOf.set(station, index));

  return list.sort((a, b) => {
    const orderA = orderBySlug.get(a?.slug);
    const orderB = orderBySlug.get(b?.slug);

    if (orderA === undefined && orderB === undefined) {
      return (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);
    }
    if (orderA === undefined) return 1;
    if (orderB === undefined) return -1;
    if (orderA !== orderB) return orderA - orderB;
    return (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);
  });
}

/**
 * Buckets an already-filtered, already-sorted station list into province groups.
 *
 * <p>Returns `null` when the province data is unavailable — the caller then
 * binds the flat list exactly as it does today. This is AC#6's rule from
 * OBRS-1213 applied to the new dependency: a customer whose
 * `/api/provinces/stops` fails gets an ungrouped but complete dropdown, never an
 * empty one. `[]` is not used for this: an empty array of groups is a claim that
 * no station belongs anywhere, and it would blank the dropdown.
 *
 * <p>Groups follow the order of the province payload; stations keep the order
 * they arrive in, so the caller sorts once (by route order) and the buckets
 * inherit it. A province that ends up with no station is dropped — an empty
 * header is a heading over nothing.
 *
 * <p>A station whose slug is in no province is NOT discarded: it goes into a
 * trailing unnamed group so it stays selectable. Measured 2026-08-11 there are
 * none (the two sets match exactly), which is precisely why this path must be
 * written now — the day a stop is added to `/api/stops` before its province row
 * exists, the alternative is a stop that silently cannot be booked.
 */
export function groupStationsByProvince(
  stations: readonly StationApi[] | null | undefined,
  provinces: readonly ProvinceStopsApi[] | null | undefined
): StationGroup[] | null {
  if (!provinces) {
    return null;
  }

  const list = [...(stations ?? [])];
  const provinceBySlug = new Map<string, ProvinceStopsApi>();
  for (const province of provinces) {
    for (const stop of province?.stops ?? []) {
      if (stop?.code) {
        provinceBySlug.set(stop.code, province);
      }
    }
  }

  const buckets = new Map<ProvinceStopsApi, StationApi[]>();
  const ungrouped: StationApi[] = [];
  for (const station of list) {
    const province = provinceBySlug.get(station?.slug);
    if (!province) {
      ungrouped.push(station);
      continue;
    }
    const bucket = buckets.get(province);
    if (bucket) {
      bucket.push(station);
    } else {
      buckets.set(province, [station]);
    }
  }

  const groups: StationGroup[] = [];
  for (const province of provinces) {
    const bucket = buckets.get(province);
    if (bucket?.length) {
      groups.push(toStationGroup(province, bucket));
    }
  }

  if (ungrouped.length) {
    groups.push({
      slug: '',
      nameThai: '',
      nameEnglish: '',
      nameChinese: '',
      stations: ungrouped,
    });
  }

  return groups;
}

/**
 * Reads the province's own label per locale, with English as the last resort.
 *
 * <p>Deliberately NOT the "any label that exists" fallback
 * `getTranslationLabel()` applies: that one returns the FIRST entry of the map,
 * which is Thai, so a missing Chinese label would put Thai text in front of an
 * English-reading visitor. Absent stays absent here and
 * `localizedDropdownName()` does the falling back, in one place.
 */
function toStationGroup(province: ProvinceStopsApi, stations: StationApi[]): StationGroup {
  const label = (locale: string): string =>
    province?.translations?.[locale]?.label ?? '';

  return {
    slug: province?.slug ?? '',
    nameThai: label('th'),
    nameEnglish: label('en'),
    nameChinese: label('zh'),
    stations,
  };
}
