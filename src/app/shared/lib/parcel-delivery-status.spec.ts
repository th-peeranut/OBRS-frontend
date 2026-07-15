import { parcelDeliveryStatusChip, ParcelStatusToken } from './parcel-delivery-status';

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
    expect(parcelDeliveryStatusChip('created').token).toBe('is-neutral');
    expect(parcelDeliveryStatusChip(null).token).toBe('is-neutral');
    expect(parcelDeliveryStatusChip(undefined).token).toBe('is-neutral');
    expect(parcelDeliveryStatusChip('')).toEqual(parcelDeliveryStatusChip('some_future_status'));
  });
});
