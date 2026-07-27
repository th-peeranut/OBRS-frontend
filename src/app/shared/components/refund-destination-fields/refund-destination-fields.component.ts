import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { RefundDestinationType } from '../../interfaces/refund-destination.interface';

/**
 * OBRS-286 — dumb, cross-shell input control for a refund bank/PromptPay
 * destination. Renders inside BOTH the customer shell
 * (`CancelRefundDestinationModalComponent`) and the admin shell
 * (`OverrideCancelModalComponent`), and is declared in `SharedModule` for
 * exactly that reason (precedent: `AdminModalBackdropDirective`, ADR-0017).
 *
 * Deliberately dumb: the caller owns the `FormGroup` (built via
 * `buildRefundDestinationForm()`, `shared/lib/refund-destination-form.ts`) and
 * all NgRx/HTTP concerns — this component only renders the fields bound to it
 * and reflects `[disabled]` while a submit is in flight. See
 * `docs/adr/0032-cross-shell-refund-destination-fields-component.md` for the
 * `--rdf-*` token-override pattern this component's stylesheet uses to render
 * correctly in four combinations (customer/admin × light/dark) with no
 * dependency on `.admin-field`'s `--admin-*` tokens (which don't resolve
 * outside `.admin-shell`).
 */
@Component({
  selector: 'app-refund-destination-fields',
  templateUrl: './refund-destination-fields.component.html',
  styleUrl: './refund-destination-fields.component.scss',
})
export class AppRefundDestinationFieldsComponent {
  @Input({ required: true }) formGroup!: FormGroup;
  @Input() disabled = false;

  protected selectMode(mode: RefundDestinationType): void {
    if (this.disabled) {
      return;
    }
    this.formGroup.get('mode')?.setValue(mode);
    this.formGroup.get('mode')?.markAsDirty();
  }

  protected get mode(): RefundDestinationType | null {
    return (this.formGroup.get('mode')?.value ?? null) as RefundDestinationType | null;
  }

  protected isInvalid(controlName: string): boolean {
    const control = this.formGroup.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected hasError(controlName: string, errorKey: string): boolean {
    return !!this.formGroup.get(controlName)?.errors?.[errorKey];
  }
}
