/**
 * OBRS-905 — GPS `course` (0–360°, clockwise from north) -> 8-point compass
 * bucketing for the fleet map's direction arrow + detail-text direction.
 * Pure functions, no Angular/Leaflet dependency, so they're testable at exact
 * boundaries independent of the marker/DOM machinery in
 * `fleet-map-panel.component.ts`.
 */
export type CompassPoint = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const COMPASS_POINTS: readonly CompassPoint[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Normalizes a raw GPS `course` value into `[0, 360)`. Treats any non-finite
 * input (`null`, `NaN`, `Infinity`) as "no direction" rather than throwing or
 * producing `NaN` downstream — a GPS fix with no heading component is a real,
 * expected case, not an error.
 */
export function normalizeCourse(course: number | null | undefined): number | null {
  if (course === null || course === undefined || !Number.isFinite(course)) {
    return null;
  }
  return ((course % 360) + 360) % 360;
}

/**
 * Buckets a heading into one of 8 compass points — 45° sectors, north
 * centred on 0° (`[337.5°, 22.5°)`). Deliberately 8 points, not 16: the
 * upstream GPS fix rate is ~1/min (`FLEET_MAP_POLL_INTERVAL_MS`), so 22.5°
 * (16-point) precision would be precision the data doesn't actually have.
 */
export function compassPointFromCourse(course: number | null | undefined): CompassPoint | null {
  const normalized = normalizeCourse(course);
  if (normalized === null) {
    return null;
  }
  // Shift by half a sector before dividing so the N sector is CENTRED on 0°
  // rather than starting at it — e.g. 350° must resolve to N, not NW.
  const index = Math.floor(((normalized + 22.5) % 360) / 45);
  return COMPASS_POINTS[index];
}
