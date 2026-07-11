import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoleRow, statusClass as statusClassValue } from '../role-management.mappers';

// Presentational role list table, extracted from RoleManagementPageComponent
// (OBRS-263, mirroring OBRS-261's VehicleListTableComponent / OBRS-257's
// UserListTableComponent / OBRS-251's PromotionListTableComponent). No
// Store/HTTP access — all data comes in via @Input, all user actions go out
// via @Output. The status-filter control itself stays in the parent
// template (same precedent as the vehicles/users/promotions pages keeping
// their filter controls out of the list-table child); this component only
// renders the already-filtered `rows`.
//
// `trackById` is carried over verbatim from RoleManagementPageComponent,
// including the pre-existing quirk that the original *ngFor never actually
// wired it in (see the split report) — preserved as dead code rather than
// "fixed", per the behavior-preservation invariant.
@Component({
  selector: 'app-role-list-table',
  templateUrl: './role-list-table.component.html',
  styleUrl: './role-list-table.component.scss',
})
export class RoleListTableComponent {
  @Input() rows: RoleRow[] = [];
  @Input() isLoading = false;
  @Input() skeletonRows: unknown[] = Array.from({ length: 5 });
  @Input() hasError = false;
  // Total (unfiltered) role count for the "Showing X-Y of Z" footer —
  // distinct from `rows.length`, which reflects the filtered set. Matches
  // the pre-split template's `roles.length` vs `filteredRoles.length` split.
  @Input() totalCount = 0;
  @Output() edit = new EventEmitter<RoleRow>();
  @Output() delete = new EventEmitter<RoleRow>();

  protected trackById(_index: number, item: RoleRow): number {
    return item.id;
  }

  protected statusClass(status: string): string {
    return statusClassValue(status);
  }
}
