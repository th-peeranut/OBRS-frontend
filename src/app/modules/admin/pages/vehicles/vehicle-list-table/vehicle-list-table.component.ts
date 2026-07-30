import { Component, EventEmitter, Input, Output } from '@angular/core';
import { VehicleRow, statusClass as statusClassValue } from '../vehicles-page.mappers';

// Presentational vehicles list table, extracted from VehiclesPageComponent
// (OBRS-261, mirroring OBRS-251's PromotionListTableComponent / OBRS-257's
// UserListTableComponent). No Store/HTTP access — all data comes in via
// @Input, all user actions go out via @Output. The status-filter control
// itself stays in the parent template (same precedent as the promotions/user
// pages keeping their filter controls out of the list-table child); this
// component only renders the already-filtered `rows`.
//
// `trackById` is carried over verbatim from VehiclesPageComponent, including
// the pre-existing quirk that the original *ngFor never actually wired it in
// (see the split report) — preserved as dead code rather than "fixed", per
// the behavior-preservation invariant.
@Component({
    selector: 'app-vehicle-list-table',
    templateUrl: './vehicle-list-table.component.html',
    styleUrl: './vehicle-list-table.component.scss',
    standalone: false
})
export class VehicleListTableComponent {
  @Input() rows: VehicleRow[] = [];
  @Input() isLoading = false;
  @Input() skeletonRows: unknown[] = Array.from({ length: 5 });
  @Input() hasError = false;
  // Total (unfiltered) vehicle count for the "Showing X-Y of Z" footer —
  // distinct from `rows.length`, which reflects the filtered set. Matches
  // the pre-split template's `vehicles.length` vs `filteredVehicles.length`
  // split.
  @Input() totalCount = 0;
  @Output() edit = new EventEmitter<VehicleRow>();
  @Output() delete = new EventEmitter<VehicleRow>();
  @Output() manageMaintenance = new EventEmitter<VehicleRow>();
  // OBRS-312: row action opening the read-only inspection-history tab.
  @Output() viewInspections = new EventEmitter<VehicleRow>();

  protected trackById(_index: number, item: VehicleRow): number {
    return item.id;
  }

  protected statusClass(status: string): string {
    return statusClassValue(status);
  }
}
