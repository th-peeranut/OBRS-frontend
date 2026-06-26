import { RouteStopListComponent } from './route-stop-list.component';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

function makeStop(order: number, slug: string): RouteStop {
  return {
    order,
    slug,
    name: `Stop ${order}`,
    address: `Address ${order}`,
    approxTime: '08:00',
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

describe('RouteStopListComponent', () => {
  let component: RouteStopListComponent;

  beforeEach(() => {
    component = new RouteStopListComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits stopSelected when a stop is clicked', () => {
    const stop = makeStop(1, 'stop-1');
    let emitted: unknown = null;
    component.stopSelected.subscribe((s) => (emitted = s));
    component.onStopClick(stop);
    expect(emitted as RouteStop).toEqual(stop);
  });

  it('emits viewMapClicked when onViewMap is called', () => {
    let called = false;
    component.viewMapClicked.subscribe(() => (called = true));
    component.onViewMap();
    expect(called).toBeTrue();
  });

  it('emits confirmClicked when onConfirm is called', () => {
    let called = false;
    component.confirmClicked.subscribe(() => (called = true));
    component.onConfirm();
    expect(called).toBeTrue();
  });

  it('trackBySlug returns stop slug', () => {
    const stop = makeStop(1, 'abc');
    expect(component.trackBySlug(0, stop)).toBe('abc');
  });
});
