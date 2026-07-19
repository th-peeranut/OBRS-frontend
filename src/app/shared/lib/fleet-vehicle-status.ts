/**
 * OBRS-424 — fleet-position status resolver (UX-OBRS-424-fleet-live-map.md §3).
 *
 * `stale` is `true` whenever `positionKnown` is `false` — backend
 * `FleetPositionService.java:47` computes `stale = !positionKnown || !fresh(...)`.
 * It is NOT a "don't care" in that case. A resolver that checks `stale` before
 * `positionKnown` reads every never-reported/not-tracked vehicle as a false
 * "device offline" state — on day one, all 6 vans. The backend also
 * guarantees `deviceOnline != null` iff `positionKnown` (`:49`) — `deviceOnline`
 * is only meaningful once `positionKnown` has already been confirmed true.
 *
 * The order below is LOAD-BEARING. Do not reorder these checks — see
 * `fleet-vehicle-status.spec.ts` for the locking spec (five real flag
 * combinations resolved through this exact function, plus the §3.2 edge case).
 */
export type FleetVehicleStatus = 'NOT_TRACKED' | 'AWAITING_SIGNAL' | 'OFFLINE' | 'GPS_LOST' | 'LIVE';

export interface FleetVehicleStatusFlags {
  gpsImeiConfigured: boolean;
  positionKnown: boolean;
  deviceOnline: boolean | null;
  stale: boolean;
}

export function resolveFleetVehicleStatus(v: FleetVehicleStatusFlags): FleetVehicleStatus {
  if (!v.gpsImeiConfigured) {
    // §3.2: `VehiclePositionRepository` is upsert-only (no delete) — an
    // unmapped/swapped tracker can leave a stale position row with real
    // lat/lon (positionKnown: true) behind. This check running FIRST means
    // that leftover coordinate is always suppressed in favor of NOT_TRACKED.
    return 'NOT_TRACKED';
  }
  if (!v.positionKnown) {
    // Below this line, deviceOnline is guaranteed non-null (backend :49).
    return 'AWAITING_SIGNAL';
  }
  if (v.deviceOnline === false) {
    return 'OFFLINE';
  }
  if (v.stale) {
    return 'GPS_LOST';
  }
  return 'LIVE';
}

/**
 * Decides whether a vehicle gets a MAP MARKER. Consumed by
 * `FleetMapPanelComponent` ONLY — `FleetVehicleStatusListComponent` renders
 * every vehicle's chip off `resolveFleetVehicleStatus()` directly and has no
 * use for "has marker" at all, since it never omits a row. Not
 * `positionKnown` directly — see §3.2: a vehicle can have `positionKnown:
 * true` and still resolve to `NOT_TRACKED` (a stale leftover coordinate),
 * which must not draw a marker either.
 */
export const FLEET_STATUS_HAS_MARKER: Record<FleetVehicleStatus, boolean> = {
  NOT_TRACKED: false,
  AWAITING_SIGNAL: false,
  OFFLINE: true,
  GPS_LOST: true,
  LIVE: true,
};

/** One of the existing `.admin-status.is-*` tokens (design-system.md §2.4) —
 * never a new hex/class. Shared by the side list (every row) and the map
 * panel (marker-eligible rows only), per §3.3's state -> visual mapping. */
export type FleetStatusToken = 'is-neutral' | 'is-info' | 'is-danger' | 'is-warning' | 'is-success';

export interface FleetStatusChip {
  token: FleetStatusToken;
  i18nKey: string;
}

const FLEET_STATUS_CHIP_MAP: Record<FleetVehicleStatus, FleetStatusChip> = {
  NOT_TRACKED: { token: 'is-neutral', i18nKey: 'STAFF.FLEET_MAP.STATUS.NOT_TRACKED' },
  AWAITING_SIGNAL: { token: 'is-info', i18nKey: 'STAFF.FLEET_MAP.STATUS.AWAITING_SIGNAL' },
  OFFLINE: { token: 'is-danger', i18nKey: 'STAFF.FLEET_MAP.STATUS.OFFLINE' },
  GPS_LOST: { token: 'is-warning', i18nKey: 'STAFF.FLEET_MAP.STATUS.GPS_LOST' },
  LIVE: { token: 'is-success', i18nKey: 'STAFF.FLEET_MAP.STATUS.LIVE' },
};

/** Resolve a {@link FleetVehicleStatus} to its chip token + i18n key (§3.3). */
export function fleetVehicleStatusChip(status: FleetVehicleStatus): FleetStatusChip {
  return FLEET_STATUS_CHIP_MAP[status];
}
