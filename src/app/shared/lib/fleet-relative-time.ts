/**
 * OBRS-424 — "Updated X ago" label for a fleet vehicle's last GPS fix
 * (UX-OBRS-424-fleet-live-map.md §9.6). Pure function, `now` injected so it's
 * testable at exact boundaries and so callers (side list + any open Leaflet
 * popup) recompute it on every 60s poll rather than a separate timer.
 */
export type FleetRelativeTimeResult =
  | { kind: 'no-signal' }
  | { kind: 'just-now' }
  | { kind: 'minutes-ago'; count: number }
  | { kind: 'hours-ago'; count: number };

export function fleetRelativeTime(recordedAt: string | null, now: Date): FleetRelativeTimeResult {
  if (!recordedAt) {
    return { kind: 'no-signal' };
  }
  const recorded = new Date(recordedAt);
  if (Number.isNaN(recorded.getTime())) {
    return { kind: 'no-signal' };
  }

  const diffMs = now.getTime() - recorded.getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSeconds < 60) {
    return { kind: 'just-now' };
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return { kind: 'minutes-ago', count: diffMinutes };
  }
  const diffHours = Math.floor(diffMinutes / 60);
  return { kind: 'hours-ago', count: diffHours };
}

/** i18n key + interpolation params for a {@link FleetRelativeTimeResult} —
 * shared by the side list and any open Leaflet popup so the two surfaces
 * never phrase the same result differently. */
export interface FleetRelativeTimeLabel {
  key: string;
  params?: { count: number };
}

export function fleetRelativeTimeLabel(result: FleetRelativeTimeResult): FleetRelativeTimeLabel {
  switch (result.kind) {
    case 'no-signal':
      return { key: 'STAFF.FLEET_MAP.NO_SIGNAL_LABEL' };
    case 'just-now':
      return { key: 'STAFF.FLEET_MAP.UPDATED_JUST_NOW' };
    case 'minutes-ago':
      return { key: 'STAFF.FLEET_MAP.UPDATED_MINUTES_AGO', params: { count: result.count } };
    case 'hours-ago':
      return { key: 'STAFF.FLEET_MAP.UPDATED_HOURS_AGO', params: { count: result.count } };
  }
}
