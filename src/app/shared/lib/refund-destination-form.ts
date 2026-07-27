import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { trimmedRequiredValidator } from '../validators/trimmed-required.validator';
import { promptPayPhoneValidator } from '../validators/promptpay-phone.validator';
import { RefundDestinationReqDto, RefundDestinationType } from '../interfaces/refund-destination.interface';

export interface RefundDestinationFormValue {
  mode: RefundDestinationType | null;
  accountName: string;
  bank: string;
  accountNumber: string;
  promptpayPhone: string;
}

/**
 * Central factory for the refund-destination form (OBRS-286 UI spec, "Forms —
 * RefundDestinationForm"). Both call sites — `CancelRefundDestinationModalComponent`
 * (customer) and `OverrideCancelModalComponent` (OWNER override) — build their
 * form through this ONE function so validators/shape can never drift between
 * them (design-system §10: shared logic, not a second copy).
 *
 * `mode` starts unselected — no pre-seeded default, the design-system §3.1 rule
 * applied to a hand-rolled 2-segment toggle instead of `app-admin-dropdown`
 * (the UI spec explicitly rules out a dropdown here: `bank` is free text, no
 * enum exists to back a select).
 *
 * Whether `mode` itself is REQUIRED is a separate, caller-controlled axis — see
 * `applyRefundDestinationRequired` below — because the two call sites disagree:
 * always-required for the customer path, server-resolved (and sometimes
 * optional) for the override path (UI spec Flow A3).
 */
export function buildRefundDestinationForm(fb: FormBuilder): FormGroup {
  const form = fb.group({
    mode: fb.control<RefundDestinationType | null>(null),
    accountName: fb.control(''),
    bank: fb.control(''),
    accountNumber: fb.control(''),
    promptpayPhone: fb.control(''),
  });

  form.get('mode')!.valueChanges.subscribe(() => applyModeFieldValidators(form));
  applyModeFieldValidators(form);

  return form;
}

/** The per-field validators depend on which mode is currently selected —
 * independent of whether choosing a mode at all is required (see
 * `applyRefundDestinationRequired`). Re-run on every `mode` change. */
function applyModeFieldValidators(form: FormGroup): void {
  const mode = form.get('mode')?.value as RefundDestinationType | null;

  for (const name of ['accountName', 'bank', 'accountNumber']) {
    const control = form.get(name);
    control?.setValidators(mode === 'bank_account' ? [trimmedRequiredValidator] : []);
    control?.updateValueAndValidity({ emitEvent: false });
  }

  const promptpayPhone = form.get('promptpayPhone');
  promptpayPhone?.setValidators(
    mode === 'promptpay' ? [trimmedRequiredValidator, promptPayPhoneValidator] : []
  );
  promptpayPhone?.updateValueAndValidity({ emitEvent: false });
}

/**
 * Toggles whether CHOOSING a mode is itself required, without touching the
 * per-field validators above (those already stay inert while `mode` is null).
 * The customer path calls this once with `required=true`. The override-cancel
 * path (UI spec Flow A3) calls it again every time the server-resolved
 * `destinationRequired` changes — including down to `false`/optional on a
 * failed check — mirroring `OverrideCancelModalComponent`'s existing
 * `applyReasonValidators()` shape.
 */
export function applyRefundDestinationRequired(form: FormGroup, required: boolean): void {
  const mode = form.get('mode');
  mode?.setValidators(required ? [Validators.required] : []);
  mode?.updateValueAndValidity({ emitEvent: false });
}

/**
 * Maps the form's value onto the exact SA `refundDestination` request shape
 * (SA-SPEC-OBRS-286.md contract #1). Returns `undefined` when no mode is
 * chosen — callers spread this straight into the request body as an optional
 * field, matching the wire contract precisely (no invented fields).
 */
export function toRefundDestinationPayload(form: FormGroup): RefundDestinationReqDto | undefined {
  const value = form.value as RefundDestinationFormValue;
  if (value.mode === 'bank_account') {
    return {
      type: 'bank_account',
      accountName: value.accountName.trim(),
      bank: value.bank.trim(),
      accountNumber: value.accountNumber.trim(),
    };
  }
  if (value.mode === 'promptpay') {
    return {
      type: 'promptpay',
      promptpayPhone: value.promptpayPhone.trim(),
    };
  }
  return undefined;
}
