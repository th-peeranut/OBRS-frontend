import { FleetVehicleStatus } from '../../../../shared/lib/fleet-vehicle-status';

/** UX-OBRS-424-fleet-live-map.md §3.3 — marker opacity per status. Only
 * OFFLINE/GPS_LOST/LIVE ever reach this (NOT_TRACKED/AWAITING_SIGNAL never
 * get a marker — see FLEET_STATUS_HAS_MARKER). */
export const FLEET_MARKER_OPACITY: Partial<Record<FleetVehicleStatus, number>> = {
  OFFLINE: 0.45,
  GPS_LOST: 0.7,
  LIVE: 1,
};

/** §3.3 — a marker's fill/halo CSS var pair per status, and (OFFLINE only) an
 * overlay Material Symbol. `-text` is the fill, `-bg` is the halo — same
 * tokens as the `.admin-status` chip, a different visual role (design-system
 * §12 "Marker fill/halo from a status token's -text/-bg pair"). */
export interface FleetMarkerColorSpec {
  fillVar: string;
  haloVar: string;
  overlayIcon?: string;
}

export const FLEET_MARKER_COLORS: Partial<Record<FleetVehicleStatus, FleetMarkerColorSpec>> = {
  OFFLINE: { fillVar: '--admin-danger-text', haloVar: '--admin-danger-bg', overlayIcon: 'signal_disconnected' },
  GPS_LOST: { fillVar: '--admin-warning-text', haloVar: '--admin-warning-bg' },
  LIVE: { fillVar: '--admin-success-text', haloVar: '--admin-success-bg' },
};

/** OBRS-905 — km/h floor below which a GPS `course` reading is treated as
 * noise rather than a real heading. A vehicle sitting still still reports
 * SOME `course` value (whatever it last had while moving, or GPS jitter), so
 * gating on `speed` (not on `course != null`) is what keeps a parked van from
 * showing a direction arrow/text that implies it's driving somewhere. */
export const FLEET_HEADING_MIN_SPEED_KMH = 5;
