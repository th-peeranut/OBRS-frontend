/**
 * Builds a Google Maps **Directions** deep-link (`maps/dir/?api=1&...`) from the
 * user's current location to a fixed destination — distinct from the existing
 * "view on map" pin link (`maps/search`/`googleMapsUrl` on `RouteStop`). Deep-link
 * only: no Google Maps/Directions API call, no API key involved.
 *
 * Shared by the three "Navigate" buttons that all build the same URL shape
 * (route-map detail card, e-ticket card, e-ticket page) so a change to the deep-link
 * format (e.g. adding a travel-mode option) lands in one place.
 */
export function buildMapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
}
