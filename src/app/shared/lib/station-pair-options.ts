import {
  collectBookableDestinationSlugs,
  collectBookableOriginSlugs,
  filterStationsBySlugs,
  RouteSegments,
} from './bookable-stations';
import {
  buildStopOrderMap,
  groupStationsByProvince,
  ProvinceStopsApi,
  RouteSide,
  sortStationsByStopOrder,
  StationGroup,
} from './station-groups';
import { isEmptyStationValue } from './station-swap';
import { getStationSlugById, StationApi } from '../interfaces/station.interface';

/**
 * OBRS-1701: everything the origin/destination pair of a search bar renders,
 * derived from one (roster, routes, provinces, chosen pair).
 *
 * <p>Lifted out of `HomeBookingComponent.syncStationOptions()` unchanged. It
 * moved because it had to run on a SECOND screen: `/schedule-booking`'s filter
 * bar carried its own `syncStationOptions()` that only ever removed the mirror
 * stop, so from `nong_chak` it offered 27 destinations where `/home` offered 6
 * (measured on prod 2026-09-01). A second hand-written copy of the same three
 * filters is how the two screens would drift apart again, one card at a time.
 *
 * <p>Everything it composes was already shared and is not re-derived here —
 * `bookable-stations.ts` decides WHICH stops (OBRS-1213), `station-groups.ts`
 * decides their ORDER and their headings (OBRS-1212). What this adds is the
 * order those are applied in, and the one piece of state neither could own: a
 * destination the newly-chosen origin has invalidated must be CLEARED, and it
 * must be cleared before the origin list is built.
 */
export interface StationPairOptionsInput {
  /** The full station roster, as `/api/provinces/stops` flattened it. */
  stations: StationApi[];
  /** `null` means "route data unavailable" — offer everything (OBRS-1213 AC#6). */
  routeSegments: RouteSegments[] | null;
  /** `null` means "province data unavailable" — render flat (OBRS-1212). */
  provinceStops: ProvinceStopsApi[] | null;
  startStationId: string | number | null | undefined;
  stopStationId: string | number | null | undefined;
}

export interface StationPairOptions {
  origins: StationApi[] | StationGroup[];
  destinations: StationApi[] | StationGroup[];
  /**
   * True when `stopStationId` names a stop the chosen origin cannot reach. The
   * caller owns the form, so it does the clearing; this flag is how it learns
   * that it must. Hiding the stop without clearing it would submit exactly the
   * impossible pair the narrowing exists to prevent, and the list on screen
   * would no longer contain it, so nothing would show the customer why.
   */
  clearStopStation: boolean;
}

export function buildStationPairOptions(
  input: StationPairOptionsInput
): StationPairOptions {
  const { stations, routeSegments, provinceStops, startStationId } = input;
  let stopStationId = input.stopStationId;

  const originSlugs = routeSegments ? collectBookableOriginSlugs(routeSegments) : null;

  // A start that is not a bookable origin at all — a stale prefill from
  // booking history, a stop retired since — narrows nothing instead of
  // narrowing to nothing. The alternative is a destination dropdown that is
  // simply empty, with nothing on screen saying why.
  const startSlug = getStationSlugById(startStationId, stations);
  const narrowFrom = originSlugs?.has(startSlug) ? startSlug : '';

  const destinationSlugs = routeSegments
    ? collectBookableDestinationSlugs(routeSegments, narrowFrom)
    : null;

  let clearStopStation = false;
  if (destinationSlugs && !isEmptyStationValue(stopStationId)) {
    const stopSlug = getStationSlugById(stopStationId, stations);
    if (!destinationSlugs.has(stopSlug)) {
      clearStopStation = true;
      // Cleared BEFORE the lists are built, not after: the origin list
      // excludes whatever the destination currently is, so recomputing off
      // the stale id would keep the just-released stop hidden from the
      // origin dropdown until some later sync happened to run.
      stopStationId = '';
    }
  }

  const origins = filterStationsBySlugs(stations, originSlugs).filter(
    (item) => item.id !== Number(stopStationId)
  );
  const destinations = filterStationsBySlugs(stations, destinationSlugs).filter(
    (item) => item.id !== Number(startStationId)
  );

  return {
    origins: toDropdownOptions(origins, 'pickup', routeSegments, provinceStops),
    destinations: toDropdownOptions(destinations, 'dropoff', routeSegments, provinceStops),
    clearStopStation,
  };
}

/**
 * OBRS-1212: turns a filtered station list into what the dropdown renders —
 * ordered by position along the route, then bucketed by province.
 *
 * <p>Order comes from the ROUTE (`pickup`/`dropoff` `order`), never from
 * `/api/stops`' id order and never from the order `/api/provinces/stops`
 * happens to return: `Province.stops` is a bare `@OneToMany` with no
 * `@OrderBy`, so its order is whatever Postgres returns and moves whenever a
 * row is updated. Measured 2026-08-10 it already puts "ตลาดเนื่องจำนงค์"
 * last in Chonburi, where the live dropdown shows it second.
 *
 * <p>Sort BEFORE grouping, not after: the buckets keep insertion order, so
 * one sort of the flat list orders every group at once — and it means the
 * ungrouped fallback below is ordered identically to the grouped one, rather
 * than being a second, differently-sorted screen.
 *
 * <p>Falls back to the flat list whenever province data is unavailable
 * (`groupStationsByProvince` returns null). Ordering survives that fallback:
 * losing the province lookup costs the headings, not the sequence.
 */
function toDropdownOptions(
  stations: StationApi[],
  side: RouteSide,
  routeSegments: RouteSegments[] | null,
  provinceStops: ProvinceStopsApi[] | null
): StationApi[] | StationGroup[] {
  const ordered = sortStationsByStopOrder(stations, buildStopOrderMap(routeSegments, side));
  return groupStationsByProvince(ordered, provinceStops) ?? ordered;
}
