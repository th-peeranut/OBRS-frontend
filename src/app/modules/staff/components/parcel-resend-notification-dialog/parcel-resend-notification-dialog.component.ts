import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * OBRS-1811: resend the "your parcel arrived" SMS, optionally to a corrected
 * number. Inline `.admin-modal-backdrop` dialog, same shape as
 * `ParcelCollectDialogComponent` next door.
 *
 * The number field is PRE-FILLED with the parcel's current recipient number
 * and is editable. That is the whole interaction: leave it alone and the SMS
 * goes again to the same handset (it was off, the provider was down); change
 * it and the parcel's recipient number is corrected before the SMS goes out.
 * The second case is the one that matters, because a mistyped-but-well-formed
 * number is accepted by the SMS provider and reported as sent — so pressing
 * "resend" at it forever would never work and nothing would ever say why.
 *
 * ⛔ It does NOT show the collection code, and must not be changed to. The
 * owner rejected that (option ค on the card): a handoff secret that staff can
 * read back is not a secret, and it would make the backend's brute-force
 * lockout decorative. Recovery here is re-sending the code, never revealing it.
 *
 * Dumb component: the parent page owns the HTTP call and feeds back
 * `isSubmitting`/`serverErrorKey`, mirroring the collect dialog's split.
 */
@Component({
    selector: 'app-parcel-resend-notification-dialog',
    templateUrl: './parcel-resend-notification-dialog.component.html',
    standalone: false
})
export class ParcelResendNotificationDialogComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() parcel: ParcelDeliveryListItemDto | null = null;
  @Input() isSubmitting = false;
  @Input() serverErrorKey: string | null = null;

  @Output() dismiss = new EventEmitter<void>();
  /** The number to send to. The parent decides whether it is a correction. */
  @Output() confirm = new EventEmitter<string>();

  protected readonly form: FormGroup;

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      // Mirrors the backend's ThaiMsisdn.ACCEPTED_PATTERN: both the 0… and 66…
      // spellings of one handset, because the server canonicalises rather than
      // refusing one of them. Validating a NARROWER shape here would reject
      // values the server accepts, which is a worse failure than a round trip.
      recipientPhone: ['', [Validators.required, Validators.pattern(/^(0[689]\d{8}|66[689]\d{8})$/)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      // Pre-filled, not blank: the common case is "this number is right, the
      // phone was off", and making staff retype a correct number invites a
      // second typo on the screen that exists to fix the first one.
      this.form.reset({ recipientPhone: this.parcel?.recipientPhone ?? '' });
    }
  }

  /** True once the staff member has actually changed the number. */
  protected get isCorrection(): boolean {
    const current = String(this.form.value.recipientPhone ?? '').trim();
    return !!this.parcel && !!current && current !== this.parcel.recipientPhone;
  }

  protected get canConfirm(): boolean {
    return this.form.valid && !this.isSubmitting;
  }

  protected onConfirm(): void {
    if (this.isSubmitting) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.confirm.emit(String(this.form.value.recipientPhone ?? '').trim());
  }

  protected onDismiss(): void {
    if (this.isSubmitting) return;
    this.dismiss.emit();
  }
}
