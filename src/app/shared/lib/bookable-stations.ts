import { RouteStop } from '../interfaces/route-map.interface';
import { StationApi } from '../interfaces/station.interface';

/**
 * OBRS-1213: the pickup/dropoff halves of one active route, as
 * `RouteMapService.getPickupDropoffCached` returns them. Declared structurally
 * (not as `RoutePickupDropoffData`) because none of the derivations below need
 * `route` — keeping the input minimal is what lets the specs state a case in
 * two stops instead of a full route fixture.
 */
export interface RouteSegments {
  pickup: RouteStop[];
  dropoff: RouteStop[];
}

/**
 * Every stop that is a `pickup` on at least one active route — i.e. the stops a
 * customer can actually depart from.
 *
 * The origin dropdown was offering the whole `GET /api/stops` roster, which on
 * prod is 28 stops against 24 real origins: four Bangkok stops that are
 * `dropoff`-only were selectable and could never produce a trip. The union (not
 * one route's list) is deliberate — the form is not bound to whichever direction
 * the map happens to be showing.
 */
export function collectBookableOriginSlugs(
  routes: readonly RouteSegments[] | null | undefined
): Set<string> {
  const slugs = new Set<string>();
  for (const route of routes ?? []) {
    for (const stop of route?.pickup ?? []) {
      if (stop?.slug) {
        slugs.add(stop.slug);
      }
    }
  }
  return slugs;
}

/**
 * The stops reachable as a destination — every `dropoff` on any active route
 * when no origin is chosen yet, and only the ones the van reaches AFTER the
 * chosen origin once there is one.
 *
 * <p>The "after" test is on `order` (the stop's position along the route), NOT
 * on array index: `pickup` and `dropoff` are two independently-ordered lists, so
 * an index means nothing across them. This is the same rule
 * `RouteMapHomeComponent.refreshDropoffOptions()` applies to the map's own
 * lists (OBRS-1052) — reused here on purpose rather than re-derived, because two
 * spellings of "which drop-offs are downstream" on ONE screen is how the map and
 * the form end up disagreeing about the same trip.
 *
 * <p>A route where the origin is not a pickup contributes nothing; a route where
 * it is contributes that route's downstream drop-offs. So a stop served by two
 * routes offers the union of what both can reach from it.
 */
export function collectBookableDestinationSlugs(
  routes: readonly RouteSegments[] | null | undefined,
  originSlug: string | null | undefined
): Set<string> {
  const slugs = new Set<string>();

  for (const route of routes ?? []) {
    const dropoffs = route?.dropoff ?? [];

    if (!originSlug) {
      for (const stop of dropoffs) {
        if (stop?.slug) {
          slugs.add(stop.slug);
        }
      }
      continue;
    }

    const origin = (route?.pickup ?? []).find((stop) => stop?.slug === originSlug);
    if (!origin) {
      continue;
    }

    for (const stop of dropoffs) {
      if (stop?.slug && stop.order > origin.order) {
        slugs.add(stop.slug);
      }
    }
  }

  return slugs;
}

/**
 * Narrows a station roster to the given slugs.
 *
 * <p>`null` means "the route data is not available" and returns the roster
 * untouched — AC#6: a failed `/api/routes` degrades to offering everything, the
 * behaviour customers have today, never to an empty dropdown that makes the
 * whole page look broken. An EMPTY set is a different statement ("nothing
 * qualifies") and is honoured as such.
 */
export function filterStationsBySlugs(
  stations: readonly StationApi[] | null | undefined,
  slugs: ReadonlySet<string> | null | undefined
): StationApi[] {
  const list = [...(stations ?? [])];
  if (!slugs) {
    return list;
  }
  return list.filter((station) => slugs.has(station?.slug));
}
