export interface RouteStop {
  order: number;
  slug: string;
  name: string;
  address: string;
  approxTime: string;
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

export interface RouteListItem {
  slug: string;
  status: RouteStatusValue;
  [key: string]: unknown;
}

export type RouteStatusValue =
  | string
  | { code?: string; slug?: string; [key: string]: unknown };

export interface PickupDropoffConfirmedEvent {
  pickupSlug: string;
  dropoffSlug: string;
}
