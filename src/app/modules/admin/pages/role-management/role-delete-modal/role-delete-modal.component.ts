import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoleRow } from '../role-management.mappers';

// Presentational delete confirm modal, extracted from RoleManagementPageComponent
// (OBRS-263, mirroring OBRS-261's VehicleDeleteModalComponent / OBRS-257's
// UserDeleteModalComponent / OBRS-251's PromotionDeactivateModalComponent).
// Owns no state and makes no API calls — the smart parent page owns the
// deleteRole() call, the optimistic store.mutate, and the isDeleting guard on
// close; this component only renders its inputs and emits intent.
@Component({
  selector: 'app-role-delete-modal',
  templateUrl: './role-delete-modal.component.html',
  styleUrl: './role-delete-modal.component.scss',
})
export class RoleDeleteModalComponent {
  @Input() isOpen = false;
  @Input() role: RoleRow | null = null;
  @Input() isDeleting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
