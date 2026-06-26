import { of, Subject } from 'rxjs';
import { RouteMapHomeComponent } from './route-map-home.component';
import {
  RoutePickupDropoffResponse,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';

function createRouteMapServiceStub(): any {
  const mockResponse: RoutePickupDropoffResponse = {
    status: 'success',
    message: 'ok',
    data: {
      route: {
        slug: 'chonburi_bangkok',
        titleLocalized: { en: 'Chonburi-Bangkok', th: 'ชลบุรี-กรุงเทพ', zh: '春武里-曼谷' },
        totalDistanceKm: 120,
        durationMinMinutes: 90,
        durationMaxMinutes: 150,
        originProvinceLabel: 'Chonburi',
        destinationProvinceLabel: 'Bangkok',
      },
      pickup: [
        {
          order: 1,
          slug: 'pickup-1',
          name: 'Pickup 1',
          address: 'Addr 1',
          approxTime: '08:00',
          latitude: null,
          longitude: null,
          primaryPhotoUrl: null,
          googleMapsUrl: null,
        },
      ],
      dropoff: [
        {
          order: 1,
          slug: 'dropoff-1',
          name: 'Dropoff 1',
          address: 'Addr 1',
          approxTime: '10:00',
          latitude: null,
          longitude: null,
          primaryPhotoUrl: null,
          googleMapsUrl: null,
        },
      ],
    },
  };

  return {
    getPickupDropoff: () => of(mockResponse),
    getFirstActiveRouteSlug: () => of('chonburi_bangkok'),
  };
}

function createAlertServiceStub(): any {
  return {
    warning: jasmine.createSpy('warning'),
    error: jasmine.createSpy('error'),
  };
}

function createTranslateServiceStub(): any {
  return {
    currentLang: 'th',
    instant: (key: string) => key,
  };
}

function createBreakpointObserverStub(): any {
  return {
    observe: () => of({ matches: true }),
  };
}

describe('RouteMapHomeComponent', () => {
  let component: RouteMapHomeComponent;
  let alertServiceStub: any;

  beforeEach(() => {
    alertServiceStub = createAlertServiceStub();
    component = new RouteMapHomeComponent(
      createRouteMapServiceStub(),
      alertServiceStub,
      createTranslateServiceStub(),
      createBreakpointObserverStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loadState becomes loaded after ngOnInit with valid response', () => {
    component.ngOnInit();
    expect(component.loadState).toBe('loaded');
    expect(component.pickupStops.length).toBe(1);
    expect(component.dropoffStops.length).toBe(1);
  });

  it('shows warning when confirming without selection', () => {
    component.ngOnInit();
    component.selectedPickupSlug = null;
    component.selectedDropoffSlug = null;
    component.onConfirmPickup();
    expect(alertServiceStub.warning).toHaveBeenCalled();
  });

  it('emits pickupDropoffConfirmed when both slugs are selected', () => {
    component.ngOnInit();
    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = 'dropoff-1';

    let emitted: any = null;
    component.pickupDropoffConfirmed.subscribe((e) => (emitted = e));

    component.onConfirmDropoff();

    expect(emitted).toEqual({
      pickupSlug: 'pickup-1',
      dropoffSlug: 'dropoff-1',
    });
  });

  it('onPickupStopSelected sets selectedPickupSlug', () => {
    const stop: RouteStop = {
      order: 1,
      slug: 'p1',
      name: 'P1',
      address: '',
      approxTime: '',
      latitude: null,
      longitude: null,
      primaryPhotoUrl: null,
      googleMapsUrl: null,
    };
    component.onPickupStopSelected(stop);
    expect(component.selectedPickupSlug).toBe('p1');
    expect(component.selectedPickupStop).toEqual(stop);
  });

  it('onDropoffStopSelected sets selectedDropoffSlug', () => {
    const stop: RouteStop = {
      order: 1,
      slug: 'd1',
      name: 'D1',
      address: '',
      approxTime: '',
      latitude: null,
      longitude: null,
      primaryPhotoUrl: null,
      googleMapsUrl: null,
    };
    component.onDropoffStopSelected(stop);
    expect(component.selectedDropoffSlug).toBe('d1');
  });

  it('getRouteTitle returns the localized title', () => {
    component.ngOnInit();
    const title = component.getRouteTitle();
    expect(title).toBe('ชลบุรี-กรุงเทพ');
  });

  it('ngOnDestroy completes the destroy$ stream', () => {
    const spy = spyOn(component['destroy$'], 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
