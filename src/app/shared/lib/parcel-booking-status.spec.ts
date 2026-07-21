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

  // OBRS-601 (the same hole OBRS-427 closed one file over). A slug-based suite
  // never generates these inputs, which is why `?? UNRECOGNIZED_FLAG` looked
  // safe for so long: `PARCEL_PAYMENT_FLAG_MAP['constructor']` is the `Object`
  // FUNCTION — non-nullish, so `??` never fired and the caller got a function
  // whose `.token`/`.i18nKey` are both `undefined`, i.e. a chip with no colour
  // and no text. `normalize()` lower-cases first, so only `constructor` and
  // `__proto__` are genuinely reachable; the camelCase members are pinned here
  // against a future refactor that drops the lower-casing.
  const PROTOTYPE_PROBES = [
    'constructor',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ];

  PROTOTYPE_PROBES.forEach((probe) => {
    it(`returns UNRECOGNIZED_FLAG — a real flag object — for prototype member "${probe}"`, () => {
      const flag = parcelPaymentFlag(probe);
      expect(flag).withContext(probe).not.toBeNull();
      expect(flag?.i18nKey).withContext(probe).toBe('STAFF.PARCEL_DELIVERY.PAYMENT.UNKNOWN');
      expect(flag?.token).withContext(probe).toBe('is-danger');
      // The pre-fix regression was a FUNCTION leaking through, so assert the
      // shape rather than only the value — `typeof fn === 'object'` is false.
      expect(typeof flag).withContext(probe).toBe('object');
      expect(isParcelBookingBlocking(probe)).withContext(probe).toBeTrue();
    });
  });
});
