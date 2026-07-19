import { Component, Input } from '@angular/core';
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
})
export class FleetVehicleStatusListComponent {
  @Input() vehicles: FleetPositionRespDto[] = [];

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
