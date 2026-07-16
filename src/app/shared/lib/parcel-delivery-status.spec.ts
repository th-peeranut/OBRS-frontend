import {
  parcelCustomerStatusLabelKey,
  parcelDeliveryStatusChip,
  ParcelStatusToken,
} from './parcel-delivery-status';

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
  // UX-OBRS-415 §8: a customer-facing surface (success screen, /my-parcels,
  // /track-parcel) must render PARCEL_TRACKING.STATUS.CREATED for 'created',
  // never chipFor()'s driver copy — the exact OBRS-427 STAFF.* mistake this
  // card is told not to repeat.
  it('forks "created" to the customer namespace', () => {
    expect(parcelCustomerStatusLabelKey('created')).toBe('PARCEL_TRACKING.STATUS.CREATED');
  });

  it('falls through to the shared chip i18n key for every other status', () => {
    expect(parcelCustomerStatusLabelKey('collected')).toBe(
      parcelDeliveryStatusChip('collected').i18nKey
    );
    expect(parcelCustomerStatusLabelKey('accepted')).toBe(
      parcelDeliveryStatusChip('accepted').i18nKey
    );
  });

  it('is case-insensitive for "created"', () => {
    expect(parcelCustomerStatusLabelKey('CREATED')).toBe('PARCEL_TRACKING.STATUS.CREATED');
  });
});
