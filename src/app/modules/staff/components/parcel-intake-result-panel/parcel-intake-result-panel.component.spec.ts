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
});
