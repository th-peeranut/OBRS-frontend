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

  it('hides both figures when no stops are selected', () => {
    component.routeMeta = mockMeta;
    expect(component.isSegment).toBe(false);
    expect(component.isDistanceSegment).toBe(false);
    expect(component.isDurationSegment).toBe(false);
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

  it('hides distance and duration independently on their own missing source field', () => {
    // Distance resolvable (both distanceKmFromOrigin present), offset missing on one side.
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(10, 15);
    component.selectedDropoffStop = makeStop(55, null);

    expect(component.isDistanceSegment).toBe(true);
    expect(component.displayDistanceKm).toBe(45);
    expect(component.isDurationSegment).toBe(false);
    // isSegment stays true because distance did resolve to a segment value.
    expect(component.isSegment).toBe(true);
  });

  it('hides both rows when only one stop is selected', () => {
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(20, 20);
    expect(component.isSegment).toBe(false);
    expect(component.isDistanceSegment).toBe(false);
    expect(component.isDurationSegment).toBe(false);
  });

  it('hides the distance row when a selected stop has no distance', () => {
    component.routeMeta = mockMeta;
    component.selectedPickupStop = makeStop(null);
    component.selectedDropoffStop = makeStop(80);
    expect(component.isDistanceSegment).toBe(false);
    expect(component.isSegment).toBe(false);
  });

  // OBRS-1718: hiding the row replaced the whole-route fallback, which is what OBRS-1341 had to
  // keep rounded in step with the segment. The total must never reach the panel again.
  it('never falls back to the whole-route total', () => {
    component.routeMeta = { ...mockMeta, totalDistanceKm: 133.13 };
    expect(component.isDistanceSegment).toBe(false);
    expect(component.displayDistanceKm).not.toBe(133);

    component.selectedPickupStop = makeStop(0);
    component.selectedDropoffStop = makeStop(133.13);
    expect(component.isDistanceSegment).toBe(true);
    expect(component.displayDistanceKm).toBe(133);
  });

  // OBRS-1496: the two top rows must name the chosen stop once it is chosen, and each
  // row decides on its own input — exactly like the distance/duration rows below.
  describe('selected stop names in the two top rows', () => {
    const pickup = { ...makeStop(10, 15), name: 'หนองชาก' };
    const dropoff = { ...makeStop(55, 60), name: 'แอร์พอร์ทลิงค์ลาดกระบัง' };

    it('names neither row when nothing is selected', () => {
      component.routeMeta = mockMeta;
      expect(component.selectedPickupStopName).toBeNull();
      expect(component.selectedDropoffStopName).toBeNull();
    });

    it('names only the pickup row when only the pickup is selected', () => {
      component.routeMeta = mockMeta;
      component.selectedPickupStop = pickup;
      expect(component.selectedPickupStopName).toBe('หนองชาก');
      expect(component.selectedDropoffStopName).toBeNull();
    });

    it('names only the drop-off row when only the drop-off is selected', () => {
      component.routeMeta = mockMeta;
      component.selectedDropoffStop = dropoff;
      expect(component.selectedPickupStopName).toBeNull();
      expect(component.selectedDropoffStopName).toBe('แอร์พอร์ทลิงค์ลาดกระบัง');
    });

    it('names both rows when both are selected', () => {
      component.routeMeta = mockMeta;
      component.selectedPickupStop = pickup;
      component.selectedDropoffStop = dropoff;
      expect(component.selectedPickupStopName).toBe('หนองชาก');
      expect(component.selectedDropoffStopName).toBe('แอร์พอร์ทลิงค์ลาดกระบัง');
    });
  });
});
