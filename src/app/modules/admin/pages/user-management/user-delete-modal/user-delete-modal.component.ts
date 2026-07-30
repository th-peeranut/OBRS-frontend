import { Component, EventEmitter, Input, Output } from '@angular/core';
import { UserRow } from '../user-management.mappers';

// Presentational delete confirm modal, extracted from
// UserManagementPageComponent (OBRS-257, mirroring OBRS-251's
// PromotionDeactivateModalComponent). Owns no state and makes no API calls —
// the smart parent page owns the deleteUser() call, the optimistic
// store.mutate, and the isDeleting guard on close; this component only
// renders its inputs and emits intent.
@Component({
    selector: 'app-user-delete-modal',
    templateUrl: './user-delete-modal.component.html',
    styleUrl: './user-delete-modal.component.scss',
    standalone: false
})
export class UserDeleteModalComponent {
  @Input() isOpen = false;
  @Input() user: UserRow | null = null;
  @Input() isDeleting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
