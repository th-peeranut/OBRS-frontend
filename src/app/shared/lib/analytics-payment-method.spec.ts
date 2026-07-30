import {
  ANALYTICS_PAYMENT_METHOD_OTHER,
  ANALYTICS_PAYMENT_METHOD_UNKNOWN,
  normalizeAnalyticsPaymentMethod,
} from './analytics-payment-method';

/**
 * OBRS-902. The bug this file exists to stop is not "a wrong string" — it is
 * two correct strings for one method, which is indistinguishable from a wrong
 * one once it reaches a chart.
 */
describe('normalizeAnalyticsPaymentMethod (OBRS-902)', () => {
  describe('every name for one method collapses to one value', () => {
    // The four spellings that were live in the codebase at once: the UI tab id,
    // the value posted to the API, the API union's second spelling, and the
    // constant `PaymentResultComponent` used to hardcode.
    const CARD = ['creditcard', 'card', 'credit_card', 'CREDIT_CARD', 'credit-card'];
    const QR = ['qrcode', 'qr_promptpay', 'promptpay', 'QR_PromptPay', 'qr'];

    it('maps every card spelling to `card`', () => {
      expect(CARD.map(normalizeAnalyticsPaymentMethod)).toEqual(
        CARD.map(() => 'card')
      );
    });

    it('maps every PromptPay spelling to `qr_promptpay`', () => {
      expect(QR.map(normalizeAnalyticsPaymentMethod)).toEqual(
        QR.map(() => 'qr_promptpay')
      );
    });

    it('keeps the two methods apart', () => {
      // A normaliser that mapped everything to one token would satisfy both
      // tests above.
      expect(normalizeAnalyticsPaymentMethod('card')).not.toBe(
        normalizeAnalyticsPaymentMethod('qrcode')
      );
    });
  });

  describe('an absent value is reported, never invented', () => {
    it('returns `unknown` for nothing at all', () => {
      expect(normalizeAnalyticsPaymentMethod(undefined)).toBe(
        ANALYTICS_PAYMENT_METHOD_UNKNOWN
      );
      expect(normalizeAnalyticsPaymentMethod(null)).toBe(
        ANALYTICS_PAYMENT_METHOD_UNKNOWN
      );
      expect(normalizeAnalyticsPaymentMethod('   ')).toBe(
        ANALYTICS_PAYMENT_METHOD_UNKNOWN
      );
    });

    it('never substitutes a real method for a missing one', () => {
      // The whole defect in one assertion: silence must not read as PromptPay.
      expect(normalizeAnalyticsPaymentMethod('')).not.toBe('qr_promptpay');
      expect(normalizeAnalyticsPaymentMethod('')).not.toBe('card');
    });
  });

  describe('methods we have not met yet', () => {
    it('passes a well-formed unfamiliar method through', () => {
      // `truemoney`, `shopeepay` and the mobile-banking sources are already in
      // the API's union. Bucketing them as `other` would hide a correctly
      // reported method from the exact question the parameter answers.
      expect(normalizeAnalyticsPaymentMethod('truemoney')).toBe('truemoney');
      expect(normalizeAnalyticsPaymentMethod('mobile_banking_kbank')).toBe(
        'mobile_banking_kbank'
      );
      expect(normalizeAnalyticsPaymentMethod('Bank Transfer')).toBe(
        'bank_transfer'
      );
    });

    it('refuses a value that would become an unbounded GA4 dimension', () => {
      // A parameter value becomes a dimension; an arbitrary server string
      // becomes an arbitrary number of rows.
      expect(normalizeAnalyticsPaymentMethod('card <script>')).toBe(
        ANALYTICS_PAYMENT_METHOD_OTHER
      );
      expect(normalizeAnalyticsPaymentMethod('x'.repeat(41))).toBe(
        ANALYTICS_PAYMENT_METHOD_OTHER
      );
      expect(normalizeAnalyticsPaymentMethod('บัตรเครดิต')).toBe(
        ANALYTICS_PAYMENT_METHOD_OTHER
      );
    });

    it('keeps `other` and `unknown` distinguishable', () => {
      // "we were told nothing" and "we were told something unusable" are
      // different problems and want different investigations.
      expect(ANALYTICS_PAYMENT_METHOD_OTHER).not.toBe(
        ANALYTICS_PAYMENT_METHOD_UNKNOWN
      );
    });
  });

  describe('nothing it emits can trip the PII guard', () => {
    it('refuses a digits-only value outright', () => {
      // No method is spelled in digits, but a server-side field mix-up could put
      // a phone number or a PAN here. `sanitizeAnalyticsParams` has a
      // `LONG_DIGIT_RUN` rule for it — and that rule only *throws* off
      // production; in production it silently drops the key and ships the event
      // without a method. Refusing the shape here keeps the failure legible.
      expect(normalizeAnalyticsPaymentMethod('0812345678')).toBe(
        ANALYTICS_PAYMENT_METHOD_OTHER
      );
      expect(normalizeAnalyticsPaymentMethod('4242424242424242')).toBe(
        ANALYTICS_PAYMENT_METHOD_OTHER
      );
    });

    it('produces no long digit run from any input', () => {
      for (const raw of [
        'card',
        'qrcode',
        '0812345678',
        '4242424242424242',
        '',
        '1234567890123',
      ]) {
        expect(normalizeAnalyticsPaymentMethod(raw)).not.toMatch(/\d{9,}/);
      }
    });
  });
});
