import { Component, EventEmitter, Input, Output } from '@angular/core';
import { UserRow } from '../user-management.mappers';

// Presentational unlock confirm modal, extracted from
// UserManagementPageComponent (OBRS-257, mirroring OBRS-251's
// PromotionDeactivateModalComponent). Owns no state and makes no API calls —
// the smart parent page owns the unlockUser() call, the optimistic
// store.mutate, and the isUnlocking guard on close; this component only
// renders its inputs and emits intent.
@Component({
    selector: 'app-user-unlock-modal',
    templateUrl: './user-unlock-modal.component.html',
    styleUrl: './user-unlock-modal.component.scss',
    standalone: false
})
export class UserUnlockModalComponent {
  @Input() isOpen = false;
  @Input() user: UserRow | null = null;
  @Input() isUnlocking = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
