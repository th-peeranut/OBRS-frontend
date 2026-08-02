import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

/**
 * Inline `.admin-modal-backdrop` dialog (`[adminModalBackdrop]` from
 * `SharedModule`, OBRS-272 precedent) for the driver/salesperson "Collect"
 * action. MVP scope note: the design spec allows either a camera QR scan
 * (reusing `BoardingListComponent`'s `@zxing/browser` scanner) or a
 * code-only text input when no shared scanner component exists yet — the
 * existing camera scan is tightly embedded inline in `BoardingListComponent`
 * (ADR 0017, "purely additive... not a new component"), not extracted as a
 * reusable unit, so extracting it is out of scope for this card. This dialog
 * ships the code-only input the spec explicitly permits; a future card can
 * extract the scanner into a shared component for reuse here.
 *
 * Dumb component: the parent page owns the `collectParcel()` HTTP call and
 * feeds back `isSubmitting`/`serverErrorKey`, mirroring
 * `ParcelConsignFormComponent`'s smart/dumb split.
 */
@Component({
    selector: 'app-parcel-collect-dialog',
    templateUrl: './parcel-collect-dialog.component.html',
    styleUrl: './parcel-collect-dialog.component.scss',
    standalone: false
})
export class ParcelCollectDialogComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() isSubmitting = false;
  @Input() serverErrorKey: string | null = null;

  @Output() dismiss = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string>();

  protected readonly form: FormGroup;

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      collectionCode: ['', [Validators.required]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.form.reset();
    }
  }

  protected get canConfirm(): boolean {
    return this.form.valid && !this.isSubmitting;
  }

  protected onConfirm(): void {
    if (this.isSubmitting) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.confirm.emit(String(this.form.value.collectionCode ?? '').trim());
  }

  protected onDismiss(): void {
    if (this.isSubmitting) return;
    this.dismiss.emit();
  }
}
