import { Component, EventEmitter, Input, Output } from '@angular/core';
import { VehicleRow } from '../vehicles-page.mappers';

// Presentational delete confirm modal, extracted from VehiclesPageComponent
// (OBRS-261, mirroring OBRS-251's PromotionDeactivateModalComponent /
// OBRS-257's UserDeleteModalComponent). Owns no state and makes no API
// calls — the smart parent page owns the deleteVehicle() call, the
// optimistic store.mutate, and the isDeleting guard on close; this
// component only renders its inputs and emits intent.
@Component({
  selector: 'app-vehicle-delete-modal',
  templateUrl: './vehicle-delete-modal.component.html',
  styleUrl: './vehicle-delete-modal.component.scss',
})
export class VehicleDeleteModalComponent {
  @Input() isOpen = false;
  @Input() vehicle: VehicleRow | null = null;
  @Input() isDeleting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
