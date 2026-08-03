export interface RouteStop {
  order: number;
  slug: string;
  name: string;
  address: string;
  approxTime: string;
  /** Distance (km) of this stop along the route from the origin. Used to
   *  derive the segment distance/time between a selected pickup and dropoff.
   *  Optional so older fixtures/consumers remain valid; the component treats a
   *  missing value the same as null (falls back to whole-route figures). */
  distanceKmFromOrigin?: number | null;
  /** Minutes from the route origin's departure baseline to this stop
   *  (authoritative, offset-based — from the seeded `route_stops` table).
   *  Used with `distanceKmFromOrigin` to derive the exact pickup→dropoff
   *  segment distance/duration. Optional/nullable so older fixtures and a
   *  stop missing this field degrade to whole-route figures. */
  offsetMinutesFromOrigin?: number | null;
  latitude: number | null;
  longitude: number | null;
  primaryPhotoUrl: string | null;
  googleMapsUrl: string | null;
  /** OBRS-1022: the owner-written landmark note for this stop ("opposite the mobile
   *  phone shop") — `stop_translations.description` in the request locale, with an
   *  `en` fallback. Optional AND nullable on purpose: the backend omits null keys, so
   *  a stop with no note written yet arrives with the property ABSENT, not null, and
   *  that is the default state of every stop today — not an error to report. */
  description?: string | null;
}

/** Authoritative pickup→dropoff span, derived from two `RouteStop` offsets
 *  (never fabricated — a missing side on either stop yields `null` for that
 *  figure rather than a misleading `0`). */
export interface TripEstimate {
  distanceKm: number | null;
  durationMinutes: number | null;
}

export interface RouteMeta {
  slug: string;
  titleLocalized: {
    en: string;
    th: string;
    zh: string;
  };
  totalDistanceKm: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  originProvinceLabel: string;
  destinationProvinceLabel: string;
}

export interface RoutePickupDropoffData {
  route: RouteMeta;
  pickup: RouteStop[];
  dropoff: RouteStop[];
}

export interface RoutePickupDropoffResponse {
  status: string;
  message: string;
  data: RoutePickupDropoffData;
}

export interface RouteListItemTranslation {
  label: string;
  description?: string | null;
}

export interface RouteListItem {
  id: number;
  slug: string;
  status: RouteStatusValue;
  translations: Partial<Record<'en' | 'th' | 'zh', RouteListItemTranslation>>;
  createdAt?: string;
  updatedAt?: string;
}

export type RouteStatusValue =
  | string
  | { code?: string; slug?: string; [key: string]: unknown };

export interface PickupDropoffConfirmedEvent {
  pickupSlug: string;
  dropoffSlug: string;
}
