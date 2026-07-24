import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ExpenseRow } from '../expenses-page.mappers';

// Presentational delete confirm modal (OBRS-685), mirroring
// VehicleDeleteModalComponent (OBRS-261) byte-for-byte in shape. Owns no
// state, makes no API calls — the smart parent page owns the deleteExpense()
// call, the optimistic store.mutate, and the isDeleting guard on close.
@Component({
  selector: 'app-expense-delete-modal',
  templateUrl: './expense-delete-modal.component.html',
  styleUrl: './expense-delete-modal.component.scss',
})
export class ExpenseDeleteModalComponent {
  @Input() isOpen = false;
  @Input() expense: ExpenseRow | null = null;
  @Input() isDeleting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
