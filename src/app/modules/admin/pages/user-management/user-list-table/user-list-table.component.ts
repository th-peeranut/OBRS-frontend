import { Component, EventEmitter, Input, Output } from '@angular/core';
import { UserRow, statusClass as statusClassValue } from '../user-management.mappers';

// Presentational user list table, extracted from UserManagementPageComponent
// (OBRS-257, mirroring OBRS-251's PromotionListTableComponent / OBRS-213's
// RouteListTableComponent). No Store/HTTP access — all data comes in via
// @Input, all user actions go out via @Output. `canUnlock` is passed in
// (rather than injecting AuthService here) so this stays a pure
// presentational component like its siblings; the per-row unlock action is
// additionally gated on `user.locked`, same as the pre-split template.
@Component({
  selector: 'app-user-list-table',
  templateUrl: './user-list-table.component.html',
  styleUrl: './user-list-table.component.scss',
})
export class UserListTableComponent {
  @Input() rows: UserRow[] = [];
  @Input() isLoading = false;
  @Input() skeletonRows: unknown[] = Array.from({ length: 5 });
  @Input() hasError = false;
  @Input() canUnlock = false;
  // Total (unfiltered) user count for the "Showing X-Y of Z" footer — distinct
  // from `rows.length`, which reflects the filtered set. Matches the
  // pre-split template's `users.length` vs `filteredUsers.length` split.
  @Input() totalCount = 0;
  @Output() edit = new EventEmitter<UserRow>();
  @Output() delete = new EventEmitter<UserRow>();
  @Output() unlock = new EventEmitter<UserRow>();

  protected statusClass(status: string): string {
    return statusClassValue(status);
  }
}
