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

function makeStop(
  distanceKmFromOrigin: number | null,
  offsetMinutesFromOrigin: number | null = null
): RouteStop {
  return {
    order: 1,
    slug: 'stop',
    name: 'Stop',
    address: 'Addr',
    approxTime: '05:00',
    distanceKmFromOrigin,
    offsetMinutesFromOrigin,
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
    expect(component.isDurationSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
    expect(component.displayDurationMin).toBe(90);
    expect(component.displayDurationMax).toBe(150);
  });

  it('computes the raw |Δdistance|, not scaled against the route total', () => {
    component.routeMeta = mockMeta; // total 120 km — unrelated to the stop deltas below
    component.selectedPickupStop = makeStop(10);
    component.selectedDropoffStop = makeStop(55);
    expect(component.isSegment).toBe(true);
    expect(component.displayDistanceKm).toBe(45);
  });

  it('computes the raw |Δoffset| and renders it via SUMMARY_DURATION_SEGMENT', () => {
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(null, 15);
    component.selectedDropoffStop = makeStop(null, 60);
    expect(component.isDurationSegment).toBe(true);
    expect(component.displayDurationMinutes).toBe(45);
  });

  it('falls back distance and duration independently on their own missing source field', () => {
    // Distance resolvable (both distanceKmFromOrigin present), offset missing on one side.
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(10, 15);
    component.selectedDropoffStop = makeStop(55, null);

    expect(component.displayDistanceKm).toBe(45);
    expect(component.isDurationSegment).toBe(false);
    expect(component.displayDurationMin).toBe(90);
    expect(component.displayDurationMax).toBe(150);
    // isSegment stays true because distance did resolve to a segment value.
    expect(component.isSegment).toBe(true);
  });

  it('falls back to route figures when only one stop is selected', () => {
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(20, 20);
    expect(component.isSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
    expect(component.displayDurationMin).toBe(90);
  });

  it('falls back when a selected stop has no distance', () => {
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(null);
    component.selectedDropoffStop = makeStop(80);
    expect(component.isSegment).toBe(false);
    expect(component.displayDistanceKm).toBe(120);
  });

  // OBRS-1341: whole-route and first-stop→last-stop describe the same journey, so they must
  // print the same number. Every fixture above uses a whole-number total, which is why the raw
  // fallback went unnoticed; the measured route totals are not whole numbers.
  it('rounds the whole-route total the same way a segment is rounded', () => {
    component.routeMeta = { ...mockMeta, totalDistanceKm: 133.13 };
    expect(component.displayDistanceKm).toBe(133);

    component.selectedPickupStop = makeStop(0);
    component.selectedDropoffStop = makeStop(133.13);
    expect(component.displayDistanceKm).toBe(133);
  });
});
