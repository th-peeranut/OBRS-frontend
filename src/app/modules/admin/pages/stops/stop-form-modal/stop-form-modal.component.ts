import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Option, StopDetailForm } from '../stops.mappers';

/**
 * OBRS-1298: presentational modal shell for the stop edit form, split out of
 * `StopsPageComponent`'s inline detail section (previously rendered below the table,
 * forcing a scroll to see it after clicking "แก้ไข" — the owner's own SIT feedback on
 * this card).
 *
 * <p><b>Deliberately dumb.</b> Unlike `VehicleFormModalComponent` / `RouteFormModalComponent`
 * (which own their own `AdminApiService/AlertService` calls), this component injects
 * NOTHING and fetches NOTHING. `StopsPageComponent` already owns every behaviour this form
 * needs — the detail fetch, the optimistic-open + staleness guard, save, the photo actions,
 * and the `onLangChange` re-fetch — so duplicating any of that here would be a second copy
 * of logic that already exists, not a reuse of it. This component only renders what it is
 * handed and bubbles user actions back up via `@Output`.
 *
 * <p>`[isOpen]`/`(closed)` mirrors the house convention used by all 6 existing admin form
 * modals (`VehicleFormModalComponent` et al.) so this stays recognizable to the next reader,
 * even though — unlike those — this one has no `FormGroup` of its own: `selected` is the
 * SAME `StopDetailForm` object instance `StopsPageComponent` holds, and the `[(ngModel)]`
 * bindings below mutate its fields directly through that reference (template-driven forms,
 * matching how this form worked before the split). That is a deliberate byte-for-byte MOVE
 * of the existing binding shape, not a new pattern — converting it to a Reactive Form the
 * modal owns itself would be a bigger change than this card's locked scope (AC-6: diff
 * confined to stops files + admin.module.ts) allows.
 */
@Component({
  selector: 'app-stop-form-modal',
  templateUrl: './stop-form-modal.component.html',
  styleUrl: './stop-form-modal.component.scss',
  standalone: false,
})
export class StopFormModalComponent {
  @Input() isOpen = false;
  @Input() selected: StopDetailForm | null = null;
  @Input() isDetailLoading = false;
  @Input() isSaving = false;
  @Input() isPhotoBusy = false;
  @Input() provinceOptions: Option[] = [];
  @Input() statusOptions: Option[] = [];
  @Input() stopTypeOptions: Option[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() photoSelected = new EventEmitter<Event>();
  @Output() photoRemove = new EventEmitter<void>();

  // Mirrors VehicleFormModalComponent.requestClose: refuse to close mid-save so a
  // stray Escape/backdrop click during the PUT can't leave the owner unsure whether
  // their edit was saved.
  protected requestClose(): void {
    if (this.isSaving) {
      return;
    }
    this.closed.emit();
  }
}
