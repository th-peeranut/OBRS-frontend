import { RouteMapPanelComponent } from './route-map-panel.component';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

function makeStop(order: number, withCoords = false): RouteStop {
  return {
    order,
    slug: `stop-${order}`,
    name: `Stop ${order}`,
    address: 'Addr',
    approxTime: '08:00',
    latitude: withCoords ? 13.0 + order * 0.1 : null,
    longitude: withCoords ? 100.0 + order * 0.1 : null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

describe('RouteMapPanelComponent', () => {
  let component: RouteMapPanelComponent;

  beforeEach(() => {
    component = new RouteMapPanelComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('showMap is false when mapsApiKey is blank', () => {
    component.mapsApiKey = '';
    component.mapsLoaded = true;
    component.pickupStops = [makeStop(1, true)];
    expect(component.showMap).toBeFalse();
  });

  it('showMap is false when no coordinates are present', () => {
    component.mapsApiKey = 'some-key';
    component.mapsLoaded = true;
    component.pickupStops = [makeStop(1, false)];
    component.dropoffStops = [makeStop(2, false)];
    expect(component.showMap).toBeFalse();
  });

  it('hasCoordinates returns true when a stop has lat/lng', () => {
    component.pickupStops = [makeStop(1, true)];
    expect(component.hasCoordinates).toBeTrue();
  });

  it('hasCoordinates returns false when no stop has lat/lng', () => {
    component.pickupStops = [makeStop(1, false)];
    component.dropoffStops = [makeStop(2, false)];
    expect(component.hasCoordinates).toBeFalse();
  });

  it('mapCenter returns Bangkok default when no stops have coords', () => {
    component.pickupStops = [makeStop(1, false)];
    const center = component.mapCenter;
    expect(center.lat).toBeCloseTo(13.7563, 3);
    expect(center.lng).toBeCloseTo(100.5018, 3);
  });

  it('polylinePath returns empty array when no stops have coords', () => {
    component.pickupStops = [makeStop(1, false)];
    expect(component.polylinePath.length).toBe(0);
  });

  it('stopHasCoords returns true for a stop with coordinates', () => {
    const stop = makeStop(1, true);
    expect(component.stopHasCoords(stop)).toBeTrue();
  });
});
