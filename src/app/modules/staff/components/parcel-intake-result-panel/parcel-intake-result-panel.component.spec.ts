import { ParcelIntakeResultPanelComponent } from './parcel-intake-result-panel.component';

describe('ParcelIntakeResultPanelComponent', () => {
  it('should be created', () => {
    const component = new ParcelIntakeResultPanelComponent();
    expect(component).toBeTruthy();
  });

  it('defaults result to null', () => {
    const component = new ParcelIntakeResultPanelComponent();
    expect(component.result).toBeNull();
  });

  it('accepts an assigned result', () => {
    const component = new ParcelIntakeResultPanelComponent();
    component.result = {
      parcelId: 1,
      trackingNumber: 'PCL-1',
      bookingId: 10,
      bookingNumber: 'BK-1',
      amount: 100,
      deliveryStatus: 'accepted',
      collectionCode: 'ABC123',
      waybillUrl: '/staff/parcels/1/waybill',
    };
    expect(component.result.trackingNumber).toBe('PCL-1');
  });

  // OBRS-341 — the SAME component now also renders the carry-on-on-seat
  // response shape (design-system §10: extend, don't fork).
  describe('isCarryOnResult() — the consigned/carry-on discriminant', () => {
    it('returns false for a consigned result (no parcelType field at all)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      const consigned = {
        parcelId: 1,
        trackingNumber: 'PCL-1',
        bookingId: 10,
        bookingNumber: 'BK-1',
        amount: 100,
        deliveryStatus: 'accepted',
        collectionCode: 'ABC123',
        waybillUrl: '/staff/parcels/1/waybill',
      };
      expect(component['isCarryOnResult'](consigned)).toBeFalse();
    });

    it('returns true for a carry-on-on-seat result (parcelType === carry_on_seat)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      const carryOn = {
        parcelId: 5,
        trackingNumber: 'P-AB12CD34EF',
        bookingId: 91,
        bookingNumber: 'B-000091',
        parcelType: 'carry_on_seat' as const,
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A1'],
        amount: 150,
        bookingNetAmount: 150,
      };
      expect(component['isCarryOnResult'](carryOn)).toBeTrue();
    });

    it('returns true for a free-aisle carry-on result (freeAisle: true, seats null)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      const freeAisle = {
        parcelId: 6,
        trackingNumber: 'P-FREE1',
        bookingId: 92,
        bookingNumber: 'B-000092',
        parcelType: 'carry_on_seat' as const,
        freeAisle: true,
        seatCount: null,
        seatNumbers: null,
        amount: 0,
        bookingNetAmount: 0,
      };
      expect(component['isCarryOnResult'](freeAisle)).toBeTrue();
    });
  });
});
