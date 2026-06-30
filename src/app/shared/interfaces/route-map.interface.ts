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
  latitude: number | null;
  longitude: number | null;
  primaryPhotoUrl: string | null;
  googleMapsUrl: string | null;
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
