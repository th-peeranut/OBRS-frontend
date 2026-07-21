import {
  parcelCustomerStatusLabelKey,
  parcelDeliveryStatusChip,
  ParcelStatusToken,
} from './parcel-delivery-status';
import enI18n from '../../../../public/i18n/en.json';
import thI18n from '../../../../public/i18n/th.json';
import zhI18n from '../../../../public/i18n/zh.json';

// Every renderable `parcel_delivery_status` slug (design-system.md §2.4/§11,
// OBRS-415's `created`). Kept as a plain literal list here rather than
// imported from the source module so this spec independently pins the full
// set the implementation must cover — it must not silently shrink if a slug
// is ever removed from the map without updating this test.
const ALL_SLUGS = [
  'created',
  'accepted',
  'in_transit',
  'arrived_notified',
  'collected',
  'left_at_stop',
  'unclaimed_returned',
  'rejected',
] as const;

describe('parcelDeliveryStatusChip', () => {
  // design-system.md §2.4/§11 lock: every renderable parcel_delivery_status
  // slug maps onto an EXISTING .admin-status.is-* token, and no two distinct
  // renderable statuses collide onto the same token (each must read
  // distinctly against the full status legend).
  const expected: Record<string, ParcelStatusToken> = {
    accepted: 'is-accepted',
    in_transit: 'is-warning',
    arrived_notified: 'is-info',
    collected: 'is-success',
    left_at_stop: 'is-delayed',
    unclaimed_returned: 'is-neutral',
    rejected: 'is-danger',
  };

  Object.entries(expected).forEach(([status, token]) => {
    it(`maps "${status}" to the existing "${token}" token`, () => {
      expect(parcelDeliveryStatusChip(status).token).toBe(token);
    });
  });

  // OBRS-427 control group: the STAFF surface (parcel-delivery-list-page)
  // consumes this function directly and MUST keep seeing the STAFF/driver
  // copy, byte-identical to before this card. Proves the customer-namespace
  // fork below is additive, not a rewrite of the staff-facing contract.
  ALL_SLUGS.forEach((slug) => {
    it(`keeps the STAFF.PARCEL_DELIVERY.STATUS.* i18nKey for "${slug}" (staff surface untouched)`, () => {
      expect(parcelDeliveryStatusChip(slug).i18nKey).toBe(
        `STAFF.PARCEL_DELIVERY.STATUS.${slug.toUpperCase()}`
      );
    });
  });

  it('maps every renderable status to a DISTINCT token (no collisions)', () => {
    const tokens = Object.keys(expected).map((s) => parcelDeliveryStatusChip(s).token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('is case-insensitive', () => {
    expect(parcelDeliveryStatusChip('ACCEPTED').token).toBe('is-accepted');
  });

  it('falls back to the neutral chip for an unknown/empty status', () => {
    expect(parcelDeliveryStatusChip(null).token).toBe('is-neutral');
    expect(parcelDeliveryStatusChip(undefined).token).toBe('is-neutral');
    expect(parcelDeliveryStatusChip('')).toEqual(parcelDeliveryStatusChip('some_future_status'));
    // A genuinely unrecognized status still uses the fallback UNKNOWN key —
    // distinct from 'created' below, which is a real, known mapping.
    expect(parcelDeliveryStatusChip('some_future_status').i18nKey).toBe(
      'STAFF.PARCEL_DELIVERY.STATUS.UNKNOWN'
    );
  });

  // OBRS-415: `created` (the online-intake starting state) is now a REAL,
  // known mapping — not the UNKNOWN fallback it used to be (design-system.md
  // §12 new-pattern note / parcel.interface.ts's ParcelDeliveryStatus union).
  // It happens to reuse the `is-neutral` token (same as `unclaimed_returned`,
  // a deliberate reuse per the mapping's own doc comment), so it's asserted
  // separately from the no-collision set above rather than folded into it.
  it('maps "created" to the "is-neutral" token with its OWN i18n key (not UNKNOWN)', () => {
    const chip = parcelDeliveryStatusChip('created');
    expect(chip.token).toBe('is-neutral');
    expect(chip.i18nKey).toBe('STAFF.PARCEL_DELIVERY.STATUS.CREATED');
    expect(chip.i18nKey).not.toBe('STAFF.PARCEL_DELIVERY.STATUS.UNKNOWN');
  });
});

describe('parcelCustomerStatusLabelKey', () => {
  // UX-OBRS-415 §8 / OBRS-427: EVERY customer-facing surface (success screen,
  // /my-parcels, /track-parcel) must render its OWN PARCEL_TRACKING.STATUS.*
  // key for EVERY slug — never fall through to the STAFF/driver namespace.
  // This is the regression test that FAILS on the pre-OBRS-427 implementation
  // (which forked only 'created' and fell through to `chipFor().i18nKey` —
  // i.e. a STAFF.* key — for every other slug).
  ALL_SLUGS.forEach((slug) => {
    it(`resolves "${slug}" to its own PARCEL_TRACKING.STATUS.* key, never STAFF.*`, () => {
      const key = parcelCustomerStatusLabelKey(slug);
      expect(key).toBe(`PARCEL_TRACKING.STATUS.${slug.toUpperCase()}`);
      expect(key.startsWith('STAFF.')).toBeFalse();
    });
  });

  it('resolves an unrecognized/empty status to PARCEL_TRACKING.STATUS.UNKNOWN, never STAFF.*', () => {
    expect(parcelCustomerStatusLabelKey(null)).toBe('PARCEL_TRACKING.STATUS.UNKNOWN');
    expect(parcelCustomerStatusLabelKey(undefined)).toBe('PARCEL_TRACKING.STATUS.UNKNOWN');
    expect(parcelCustomerStatusLabelKey('')).toBe('PARCEL_TRACKING.STATUS.UNKNOWN');
    const key = parcelCustomerStatusLabelKey('some_future_status');
    expect(key).toBe('PARCEL_TRACKING.STATUS.UNKNOWN');
    expect(key.startsWith('STAFF.')).toBeFalse();
  });

  // OBRS-427 scrutinize: `PARCEL_STATUS_CHIP_MAP` is a plain object literal, so
  // a naive `slug in MAP` membership test also matches `Object.prototype`
  // members and emits keys like `PARCEL_TRACKING.STATUS.CONSTRUCTOR` that exist
  // in NO locale bundle — ngx-translate then renders the raw key to a customer,
  // the exact symptom this card closes. Only the all-lowercase prototype members
  // survive the `.toLowerCase()` normalize (`toString`/`valueOf`/`hasOwnProperty`
  // become `tostring`/... and miss anyway), so `constructor`/`__proto__` are the
  // genuinely reachable pair; the camelCase ones are pinned against a future
  // refactor that drops the lower-casing.
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
    it(`treats prototype member "${probe}" as unknown, not a status slug`, () => {
      expect(parcelCustomerStatusLabelKey(probe)).toBe('PARCEL_TRACKING.STATUS.UNKNOWN');
    });

    it(`returns the neutral fallback chip for prototype member "${probe}"`, () => {
      const chip = parcelDeliveryStatusChip(probe);
      expect(chip.token).toBe('is-neutral');
      expect(chip.i18nKey).toBe('STAFF.PARCEL_DELIVERY.STATUS.UNKNOWN');
    });
  });

  it('is case-insensitive', () => {
    expect(parcelCustomerStatusLabelKey('CREATED')).toBe('PARCEL_TRACKING.STATUS.CREATED');
    expect(parcelCustomerStatusLabelKey('ACCEPTED')).toBe('PARCEL_TRACKING.STATUS.ACCEPTED');
  });
});

describe('parcelCustomerStatusLabelKey bundle completeness', () => {
  // OBRS-427: every key this function can return must actually resolve (as a
  // non-empty string) in all three real locale bundles — not just exist as a
  // string literal in the .ts file. Reads the real public/i18n/*.json files
  // directly (same import pattern as parcel-verify-list-page.component.spec.ts),
  // so a bundle that's missing a key or has it as the wrong type fails here
  // instead of rendering the raw key on a customer's screen with no build error.
  const bundles: ReadonlyArray<readonly [string, unknown]> = [
    ['en', enI18n],
    ['th', thI18n],
    ['zh', zhI18n],
  ];

  function resolve(bundle: unknown, dottedKey: string): unknown {
    return dottedKey
      .split('.')
      .reduce<unknown>(
        (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
        bundle
      );
  }

  const allKeys = [...ALL_SLUGS, 'some_future_status', '', null, undefined].map((s) =>
    parcelCustomerStatusLabelKey(s as string | null | undefined)
  );
  // Sanity check on the test itself: this must cover every real slug's key
  // plus the UNKNOWN fallback (9 distinct keys), or the completeness check
  // below would vacuously pass having verified almost nothing.
  const distinctKeys = [...new Set(allKeys)];

  it('produced the expected number of distinct customer i18n keys to check', () => {
    expect(distinctKeys.length).toBe(ALL_SLUGS.length + 1); // 8 slugs + UNKNOWN
  });

  distinctKeys.forEach((key) => {
    bundles.forEach(([lang, bundle]) => {
      it(`"${key}" resolves to a non-empty string in ${lang}.json`, () => {
        const value = resolve(bundle, key);
        expect(typeof value).toBe('string');
        expect((value as string)?.length).toBeGreaterThan(0);
      });
    });
  });
});
