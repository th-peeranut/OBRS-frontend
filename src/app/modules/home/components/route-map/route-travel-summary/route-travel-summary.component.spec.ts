import { RouteTravelSummaryComponent } from './route-travel-summary.component';
import {
  RouteMeta,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';

const mockMeta: RouteMeta = {
  slug: 'test-route',
  titleLocalized: { en: 'Test Route', th: 'เส้นทางทดสอบ', zh: '测试路线' },
  totalDistanceKm: 120,
  durationMinMinutes: 90,
  durationMaxMinutes: 150,
  originProvinceLabel: 'Chonburi',
  destinationProvinceLabel: 'Bangkok',
};

function makeStop(distanceKmFromOrigin: number | null): RouteStop {
  return {
    order: 1,
    slug: 'stop',
    name: 'Stop',
    address: 'Addr',
    approxTime: '05:00',
    distanceKmFromOrigin,
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

describe('RouteTravelSummaryComponent', () => {
  let component: RouteTravelSummaryComponent;

  beforeEach(() => {
    component = new RouteTravelSummaryComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('accepts routeMeta input', () => {
    component.routeMeta = mockMeta;
    expect(component.routeMeta?.slug).toBe('test-route');
  });

  it('defaults pickupCount and dropoffCount to 0', () => {
    expect(component.pickupCount).toBe(0);
    expect(component.dropoffCount).toBe(0);
  });

  it('shows whole-route figures when no stops are selected', () => {
    component.routeMeta = mockMeta;
    expect(component.isSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
    expect(component.displayDurationMin).toBe(90);
    expect(component.displayDurationMax).toBe(150);
  });

  it('projects the segment onto the route total using the span (not raw stop km)', () => {
    component.routeMeta = mockMeta; // total 120 km, 90-150 min
    // Stop distances are on a different scale (span 160) than totalDistanceKm.
    component.routeSpanKm = 160;
    component.selectedPickupStop = makeStop(0);
    component.selectedDropoffStop = makeStop(80); // 80/160 = ratio 0.5
    expect(component.isSegment).toBe(true);
    expect(component.displayDistanceKm).toBe(60); // round(0.5 * 120), NOT 80
    expect(component.displayDurationMin).toBe(45); // round(90 * 0.5)
    expect(component.displayDurationMax).toBe(75); // round(150 * 0.5)
  });

  it('a full pickup→dropoff selection equals the whole-route figures', () => {
    component.routeMeta = mockMeta;
    component.routeSpanKm = 160;
    component.selectedPickupStop = makeStop(0);
    component.selectedDropoffStop = makeStop(160); // full span => ratio 1
    expect(component.displayDistanceKm).toBe(120);
    expect(component.displayDurationMin).toBe(90);
    expect(component.displayDurationMax).toBe(150);
  });

  it('falls back to route figures when only one stop is selected', () => {
    component.routeMeta = mockMeta;
    component.routeSpanKm = 160;
    component.selectedPickupStop = makeStop(20);
    expect(component.isSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
    expect(component.displayDurationMin).toBe(90);
  });

  it('falls back when a selected stop has no distance', () => {
    component.routeMeta = mockMeta;
    component.routeSpanKm = 160;
    component.selectedPickupStop = makeStop(null);
    component.selectedDropoffStop = makeStop(80);
    expect(component.isSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
  });

  it('falls back to whole-route figures when the span is unknown', () => {
    component.routeMeta = mockMeta;
    component.routeSpanKm = null;
    component.selectedPickupStop = makeStop(0);
    component.selectedDropoffStop = makeStop(80);
    expect(component.isSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
  });

  it('caps the segment ratio at 1 so it never exceeds the whole-route band', () => {
    component.routeMeta = mockMeta;
    component.routeSpanKm = 160;
    component.selectedPickupStop = makeStop(0);
    component.selectedDropoffStop = makeStop(500); // beyond span, clamps to 1
    expect(component.displayDurationMax).toBe(150);
    expect(component.displayDistanceKm).toBe(120);
  });
});
