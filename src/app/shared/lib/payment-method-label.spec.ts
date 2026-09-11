import enI18n from '../../../../public/i18n/en.json';
import thI18n from '../../../../public/i18n/th.json';
import zhI18n from '../../../../public/i18n/zh.json';
import { paymentMethodLabel } from './payment-method-label';

/**
 * OBRS-1800 — a gate on the PUBLISHED bundles, not on a stub.
 *
 * The bug this covers was never a logic bug: the lookup was simply absent and the
 * raw slug reached the screen. So a stub dictionary would prove nothing here — the
 * three real `public/i18n/*.json` files are the thing that has to carry all eight
 * slugs, and this fails the day one of them loses an entry.
 */

/** `EPaymentMethod` (OBRS-backend) — the closed set the API can send. */
const BACKEND_SLUGS = [
  'cash',
  'card',
  'bank_transfer',
  'qr_promptpay',
  'truemoney',
  'shopeepay',
  'rabbit_linepay',
  'other',
];

/** ngx-translate's `instant()`: dotted-path lookup, echoing the key when missing. */
function instantFrom(bundle: unknown): (key: string) => string {
  return (key: string) => {
    let node: unknown = bundle;
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null) {
        return key;
      }
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : key;
  };
}

describe('paymentMethodLabel', () => {
  const bundles: Array<[string, unknown]> = [
    ['th', thI18n],
    ['en', enI18n],
    ['zh', zhI18n],
  ];

  for (const [lang, bundle] of bundles) {
    describe(lang, () => {
      const translate = instantFrom(bundle);

      for (const slug of BACKEND_SLUGS) {
        it(`translates ${slug}`, () => {
          const label = paymentMethodLabel(slug, translate);
          expect(label).not.toBe(slug);
          expect(label).not.toContain('ADMIN.');
          expect(label.trim()).not.toBe('');
        });
      }

      it('falls back to the raw slug for a method the bundle does not know', () => {
        expect(paymentMethodLabel('alipay', translate)).toBe('alipay');
      });
    });
  }

  it('renders a Thai label that carries no punctuation of its own', () => {
    // The booking-detail timeline drops this into `ได้รับการชำระเงิน ({{method}})`, so a
    // label spelled `พร้อมเพย์ (QR)` would render there with nested brackets.
    expect(paymentMethodLabel('qr_promptpay', instantFrom(thI18n))).toBe('พร้อมเพย์ QR');
    expect(paymentMethodLabel('qr_promptpay', instantFrom(thI18n))).not.toContain('(');
  });

  it('is case- and whitespace-tolerant about the slug it is handed', () => {
    expect(paymentMethodLabel(' QR_PromptPay ', instantFrom(enI18n))).toBe('PromptPay QR');
  });

  it('renders nothing when the record carries no method', () => {
    expect(paymentMethodLabel(null, instantFrom(thI18n))).toBe('');
    expect(paymentMethodLabel(undefined, instantFrom(thI18n))).toBe('');
    expect(paymentMethodLabel('', instantFrom(thI18n))).toBe('');
  });
});
