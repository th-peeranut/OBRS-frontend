import { Component, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  FleetStatusChip,
  fleetVehicleStatusChip,
  resolveFleetVehicleStatus,
} from '../../../../shared/lib/fleet-vehicle-status';
import { fleetRelativeTime, fleetRelativeTimeLabel, FleetRelativeTimeLabel } from '../../../../shared/lib/fleet-relative-time';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';

/**
 * OBRS-424 — dumb side-list component: renders EVERY vehicle via
 * `resolveFleetVehicleStatus()` directly (UX-OBRS-424-fleet-live-map.md §2).
 * It has no notion of "has marker" (that's a map-only concern) and never
 * reads `FLEET_STATUS_HAS_MARKER` — this is the fallback source of truth
 * when the map itself can't render at all (§4.4, no MapTiler key).
 */
@Component({
    selector: 'app-fleet-vehicle-status-list',
    templateUrl: './fleet-vehicle-status-list.component.html',
    styleUrl: './fleet-vehicle-status-list.component.scss',
    standalone: false
})
export class FleetVehicleStatusListComponent {
  @Input() vehicles: FleetPositionRespDto[] = [];

  constructor(private readonly translate: TranslateService) {}

  /** OBRS-1070 AC7 — the speed cell. `SPEED_VALUE` is the bare number + unit;
   * the popup's own `POPUP.SPEED` is NOT reusable here because it carries a
   * "Speed:" prefix, which under a column already headed "Speed" reads as
   * "Speed: 62 km/h". A vehicle with no speed reading gets the em dash this
   * repo already uses for an empty cell (parcel-share-clawbacks-section
   * .component.ts:124), never a stranded unit. */
  protected speedTextFor(vehicle: FleetPositionRespDto): string {
    if (vehicle.speed === null) {
      return '—';
    }
    return this.translate.instant('STAFF.FLEET_MAP.SPEED_VALUE', { value: vehicle.speed });
  }

  protected chipFor(vehicle: FleetPositionRespDto): FleetStatusChip {
    return fleetVehicleStatusChip(resolveFleetVehicleStatus(vehicle));
  }

  protected lastUpdateLabelFor(vehicle: FleetPositionRespDto): FleetRelativeTimeLabel {
    return fleetRelativeTimeLabel(fleetRelativeTime(vehicle.recordedAt, new Date()));
  }

  protected trackByVehicleId(_index: number, vehicle: FleetPositionRespDto): number {
    return vehicle.vehicleId;
  }
}
