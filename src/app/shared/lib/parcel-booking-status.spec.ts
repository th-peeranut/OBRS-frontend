import { isParcelBookingBlocking, parcelPaymentFlag } from './parcel-booking-status';

describe('parcelPaymentFlag', () => {
  it('returns no flag for a paid booking — the everyday row carries no badge', () => {
    expect(parcelPaymentFlag('confirmed')).toBeNull();
    expect(isParcelBookingBlocking('confirmed')).toBeFalse();
  });

  it('flags and blocks every non-confirmed slug the backend can send', () => {
    const cases: Array<[string, string]> = [
      ['pending', 'STAFF.PARCEL_DELIVERY.PAYMENT.PENDING'],
      ['expired', 'STAFF.PARCEL_DELIVERY.PAYMENT.EXPIRED'],
      ['cancelled', 'STAFF.PARCEL_DELIVERY.PAYMENT.CANCELLED'],
      ['refunded', 'STAFF.PARCEL_DELIVERY.PAYMENT.REFUNDED'],
    ];
    for (const [slug, i18nKey] of cases) {
      expect(parcelPaymentFlag(slug)?.i18nKey).withContext(slug).toBe(i18nKey);
      expect(isParcelBookingBlocking(slug)).withContext(slug).toBeTrue();
    }
  });

  it('tolerates casing/whitespace the way the delivery-status chip does', () => {
    expect(parcelPaymentFlag('  CONFIRMED ')).toBeNull();
    expect(parcelPaymentFlag(' Pending')?.i18nKey).toBe('STAFF.PARCEL_DELIVERY.PAYMENT.PENDING');
  });

  it('says nothing and blocks nothing when the field is absent — an older backend must not brick the page', () => {
    for (const absent of [undefined, null, '', '   ']) {
      expect(parcelPaymentFlag(absent)).withContext(String(absent)).toBeNull();
      expect(isParcelBookingBlocking(absent)).withContext(String(absent)).toBeFalse();
    }
  });

  it('blocks a slug it does not recognize — the backend knows it is not confirmed and will 409 it', () => {
    expect(parcelPaymentFlag('some_future_slug')?.i18nKey).toBe('STAFF.PARCEL_DELIVERY.PAYMENT.UNKNOWN');
    expect(isParcelBookingBlocking('some_future_slug')).toBeTrue();
  });
});
