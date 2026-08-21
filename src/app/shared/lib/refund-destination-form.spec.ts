import { FormBuilder } from '@angular/forms';
import {
  applyRefundDestinationRequired,
  buildRefundDestinationForm,
  toRefundDestinationPayload,
} from './refund-destination-form';

describe('refund-destination-form', () => {
  const fb = new FormBuilder();

  describe('buildRefundDestinationForm', () => {
    it('starts with no mode selected and no field errors (§3.1: no pre-seeded default)', () => {
      const form = buildRefundDestinationForm(fb);
      expect(form.get('mode')?.value).toBeNull();
      // Not required by default — a fresh form with nothing chosen is valid
      // until a caller opts in via applyRefundDestinationRequired.
      expect(form.valid).toBeTrue();
    });

    it('requires the bank fields only while mode=bank_account', () => {
      const form = buildRefundDestinationForm(fb);
      form.get('mode')?.setValue('bank_account');
      expect(form.get('accountName')?.valid).toBeFalse();
      expect(form.get('bank')?.valid).toBeFalse();
      expect(form.get('accountNumber')?.valid).toBeFalse();
      expect(form.get('promptpayPhone')?.valid).toBeTrue();

      form.get('accountName')?.setValue('Somchai');
      form.get('bank')?.setValue('KBank');
      form.get('accountNumber')?.setValue('1234567890');
      expect(form.valid).toBeTrue();
    });

    it('requires only promptpayPhone while mode=promptpay, and validates its shape', () => {
      const form = buildRefundDestinationForm(fb);
      form.get('mode')?.setValue('promptpay');
      expect(form.get('accountName')?.valid).toBeTrue();
      expect(form.get('promptpayPhone')?.valid).toBeFalse();

      form.get('promptpayPhone')?.setValue('1101700156175');
      expect(form.get('promptpayPhone')?.errors?.['checkDigit']).toBeTrue();

      form.get('promptpayPhone')?.setValue('1101700156176');
      expect(form.valid).toBeTrue();

      form.get('promptpayPhone')?.setValue('0812345678');
      expect(form.valid).toBeTrue();
    });

    it('clears the bank fields back to inert when mode switches away from bank_account', () => {
      const form = buildRefundDestinationForm(fb);
      form.get('mode')?.setValue('bank_account');
      form.get('mode')?.setValue('promptpay');
      // Untouched bank fields must not block validity anymore.
      expect(form.get('accountName')?.valid).toBeTrue();
    });
  });

  describe('applyRefundDestinationRequired', () => {
    it('makes an unset mode invalid when required=true', () => {
      const form = buildRefundDestinationForm(fb);
      applyRefundDestinationRequired(form, true);
      expect(form.get('mode')?.valid).toBeFalse();

      form.get('mode')?.setValue('promptpay');
      form.get('promptpayPhone')?.setValue('0812345678');
      expect(form.valid).toBeTrue();
    });

    it('leaves mode optional when required=false, even after having been required', () => {
      const form = buildRefundDestinationForm(fb);
      applyRefundDestinationRequired(form, true);
      applyRefundDestinationRequired(form, false);
      expect(form.get('mode')?.valid).toBeTrue();
      expect(form.valid).toBeTrue();
    });
  });

  describe('toRefundDestinationPayload', () => {
    it('returns undefined when no mode is chosen', () => {
      const form = buildRefundDestinationForm(fb);
      expect(toRefundDestinationPayload(form)).toBeUndefined();
    });

    it('maps a bank_account form to the exact SA request shape, trimmed', () => {
      const form = buildRefundDestinationForm(fb);
      form.get('mode')?.setValue('bank_account');
      form.get('accountName')?.setValue('  Somchai Jaidee  ');
      form.get('bank')?.setValue(' KBank ');
      form.get('accountNumber')?.setValue(' 1234567890 ');

      expect(toRefundDestinationPayload(form)).toEqual({
        type: 'bank_account',
        accountName: 'Somchai Jaidee',
        bank: 'KBank',
        accountNumber: '1234567890',
      });
    });

    it('maps a promptpay form to the exact SA request shape', () => {
      const form = buildRefundDestinationForm(fb);
      form.get('mode')?.setValue('promptpay');
      form.get('promptpayPhone')?.setValue('0812345678');

      expect(toRefundDestinationPayload(form)).toEqual({
        type: 'promptpay',
        promptpayPhone: '0812345678',
      });
    });
  });
});
