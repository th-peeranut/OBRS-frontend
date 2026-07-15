import { RouteStopDetailCardComponent } from './route-stop-detail-card.component';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

function makeStop(): RouteStop {
  return {
    order: 1,
    slug: 'stop-1',
    name: 'Test Stop',
    address: '123 Main St',
    approxTime: '09:00',
    latitude: 13.7563,
    longitude: 100.5018,
    primaryPhotoUrl: 'https://example.com/photo.jpg',
    googleMapsUrl: 'https://maps.google.com/?q=1,1',
  };
}

describe('RouteStopDetailCardComponent', () => {
  let component: RouteStopDetailCardComponent;

  beforeEach(() => {
    component = new RouteStopDetailCardComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('openMaps does nothing when googleMapsUrl is null', () => {
    component.stop = { ...makeStop(), googleMapsUrl: null };
    const openSpy = spyOn(window, 'open');
    component.openMaps();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('hasPickupCoords is true when both latitude and longitude are present', () => {
    component.stop = makeStop();
    expect(component.hasPickupCoords).toBeTrue();
  });

  it('hasPickupCoords is false when latitude is null', () => {
    component.stop = { ...makeStop(), latitude: null };
    expect(component.hasPickupCoords).toBeFalse();
  });

  it('hasPickupCoords is false when longitude is null', () => {
    component.stop = { ...makeStop(), longitude: null };
    expect(component.hasPickupCoords).toBeFalse();
  });

  it('hasPickupCoords is false when there is no stop', () => {
    component.stop = null;
    expect(component.hasPickupCoords).toBeFalse();
  });

  it('navigateToPickup opens the Google Maps directions deep-link for the stop coords', () => {
    component.stop = makeStop();
    const openSpy = spyOn(window, 'open');

    component.navigateToPickup();

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018&travelmode=driving',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('navigateToPickup does nothing when coords are missing', () => {
    component.stop = { ...makeStop(), latitude: null };
    const openSpy = spyOn(window, 'open');

    component.navigateToPickup();

    expect(openSpy).not.toHaveBeenCalled();
  });
});
