import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PromotionRow } from '../promotions-page.mappers';

// Presentational soft-delete confirm modal, extracted from
// PromotionsPageComponent (OBRS-251, mirroring the routes delete-confirm
// dialog). Owns no state and makes no API calls — the smart parent page owns
// the deletePromotion() call, the optimistic store.mutate, and the
// isDeactivating guard on close; this component only renders its inputs and
// emits intent.
@Component({
  selector: 'app-promotion-deactivate-modal',
  templateUrl: './promotion-deactivate-modal.component.html',
  styleUrl: './promotion-deactivate-modal.component.scss',
})
export class PromotionDeactivateModalComponent {
  @Input() isOpen = false;
  @Input() promotion: PromotionRow | null = null;
  @Input() isDeactivating = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
