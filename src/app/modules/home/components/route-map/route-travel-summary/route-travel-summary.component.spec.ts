import { RouteTravelSummaryComponent } from './route-travel-summary.component';
import { RouteMeta } from '../../../../../shared/interfaces/route-map.interface';

const mockMeta: RouteMeta = {
  slug: 'test-route',
  titleLocalized: { en: 'Test Route', th: 'เส้นทางทดสอบ', zh: '测试路线' },
  totalDistanceKm: 120,
  durationMinMinutes: 90,
  durationMaxMinutes: 150,
  originProvinceLabel: 'Chonburi',
  destinationProvinceLabel: 'Bangkok',
};

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
});
