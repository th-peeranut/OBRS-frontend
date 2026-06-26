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

  it('staticMapUrl returns null when mapsApiKey is blank', () => {
    component.stop = makeStop();
    component.mapsApiKey = '';
    expect(component.staticMapUrl).toBeNull();
  });

  it('staticMapUrl returns null when stop has no coordinates', () => {
    component.stop = { ...makeStop(), latitude: null, longitude: null };
    component.mapsApiKey = 'test-key';
    expect(component.staticMapUrl).toBeNull();
  });

  it('staticMapUrl returns a URL when key and coords are provided', () => {
    component.stop = makeStop();
    component.mapsApiKey = 'test-key';
    const url = component.staticMapUrl;
    expect(url).toContain('maps.googleapis.com');
    expect(url).toContain('test-key');
  });

  it('openPhoto does nothing when primaryPhotoUrl is null', () => {
    component.stop = { ...makeStop(), primaryPhotoUrl: null };
    const openSpy = spyOn(window, 'open');
    component.openPhoto();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('openMaps does nothing when googleMapsUrl is null', () => {
    component.stop = { ...makeStop(), googleMapsUrl: null };
    const openSpy = spyOn(window, 'open');
    component.openMaps();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
