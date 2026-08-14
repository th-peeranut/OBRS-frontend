import { ParcelWaybillPaperComponent } from './parcel-waybill-paper.component';

describe('ParcelWaybillPaperComponent', () => {
  it('should be created', () => {
    expect(new ParcelWaybillPaperComponent()).toBeTruthy();
  });

  it('defaults waybill to null and both QR inputs to empty', () => {
    const component = new ParcelWaybillPaperComponent();
    expect(component.waybill).toBeNull();
    expect(component.qrDataUrl).toBe('');
    expect(component.trackQrDataUrl).toBe('');
  });

  it('resolves a stop label via parcelStopLabel for string and object shapes', () => {
    const component = new ParcelWaybillPaperComponent();
    expect(component['parcelStopLabel']('Bangkok')).toBe('Bangkok');
    expect(component['parcelStopLabel']({ name: 'Chiang Mai' })).toBe('Chiang Mai');
  });
});
