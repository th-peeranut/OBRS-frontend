import { HomeComponent } from './home.component';
import { createStoreStub, createTranslateStub } from '../../testing/test-stubs';
import { StationApi } from '../../shared/interfaces/station.interface';

function createAlertStub(): any {
  return { warning: () => {}, error: () => {}, toast: () => {} };
}

describe('HomeComponent', () => {
  let component: HomeComponent;

  beforeEach(() => {
    component = new HomeComponent(
      createStoreStub(),
      createAlertStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('onPickupDropoffConfirmed shows error when station not found', () => {
    const alertSpy = jasmine.createSpy('error');
    (component as any).alertService = { error: alertSpy, warning: () => {}, toast: () => {} };
    (component as any).allStations = [];
    component.onPickupDropoffConfirmed({ pickupSlug: 'x', dropoffSlug: 'y' });
    expect(alertSpy).toHaveBeenCalled();
  });

  it('onPickupDropoffConfirmed prefills stations and scrolls to booking bar (no auto-search)', () => {
    const pickupStation: StationApi = {
      id: 1,
      slug: 'pickup-slug',
      status: 'active',
      stopType: 'PICKUP',
      createdAt: '',
      updatedAt: '',
    };
    const dropoffStation: StationApi = {
      id: 2,
      slug: 'dropoff-slug',
      status: 'active',
      stopType: 'DROPOFF',
      createdAt: '',
      updatedAt: '',
    };

    (component as any).allStations = [pickupStation, dropoffStation];

    const startStationSpy = jasmine.createSpy('onStartStationChange');
    const endStationSpy = jasmine.createSpy('onEndStationChange');
    (component as any).homeBookingRef = {
      onStartStationChange: startStationSpy,
      onEndStationChange: endStationSpy,
    };

    const scrollSpy = jasmine.createSpy('scrollIntoView');
    (component as any).homeBookingEl = { nativeElement: { scrollIntoView: scrollSpy } };

    jasmine.clock().install();

    component.onPickupDropoffConfirmed({ pickupSlug: 'pickup-slug', dropoffSlug: 'dropoff-slug' });

    expect(startStationSpy).toHaveBeenCalledWith(pickupStation);
    expect(endStationSpy).toHaveBeenCalledWith(dropoffStation);

    jasmine.clock().tick(0);

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    jasmine.clock().uninstall();
  });
});
