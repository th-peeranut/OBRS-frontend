import { of, Subject, throwError } from 'rxjs';
import { RouteMapHomeComponent } from './route-map-home.component';
import {
  RouteListItem,
  RoutePickupDropoffResponse,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';
import { RouteMapService } from '../../../../../services/route-map/route-map.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';
import { BreakpointObserver } from '@angular/cdk/layout';

const mockPickupDropoffResponse: RoutePickupDropoffResponse = {
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

const mockActiveRoutes: RouteListItem[] = [
  {
    id: 1,
    slug: 'chonburi_bangkok',
    status: { code: 'active' },
    translations: {
      en: { label: 'Chonburi → Bangkok' },
      th: { label: 'ชลบุรี → กรุงเทพ' },
    },
  },
  {
    id: 2,
    slug: 'bangkok_chonburi',
    status: { code: 'active' },
    translations: {
      en: { label: 'Bangkok → Chonburi' },
      th: { label: 'กรุงเทพ → ชลบุรี' },
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStub = any;

function createRouteMapServiceStub(overrides?: {
  getActiveRoutes?: () => unknown;
  getPickupDropoff?: (slug: string) => unknown;
}): AnyStub {
  return {
    getActiveRoutes: jasmine
      .createSpy('getActiveRoutes')
      .and.callFake(overrides?.getActiveRoutes ?? (() => of(mockActiveRoutes))),
    getPickupDropoff: jasmine
      .createSpy('getPickupDropoff')
      .and.callFake(
        overrides?.getPickupDropoff ?? (() => of(mockPickupDropoffResponse))
      ),
    getFirstActiveRouteSlug: jasmine
      .createSpy('getFirstActiveRouteSlug')
      .and.returnValue(of('chonburi_bangkok')),
  };
}

function createAlertServiceStub(): AnyStub {
  return {
    warning: jasmine.createSpy('warning'),
    error: jasmine.createSpy('error'),
    toast: jasmine.createSpy('toast'),
  };
}

function createTranslateServiceStub(): AnyStub {
  return {
    currentLang: 'th',
    instant: (key: string) => key,
    onLangChange: new Subject<{ lang: string; translations: object }>(),
  };
}

function createBreakpointObserverStub(): AnyStub {
  return {
    observe: () => of({ matches: true }),
  };
}

function makeComponent(
  serviceStub: AnyStub,
  alertStub: AnyStub,
  translateStub: AnyStub,
  breakpointStub: AnyStub
): RouteMapHomeComponent {
  return new RouteMapHomeComponent(
    serviceStub as RouteMapService,
    alertStub as AlertService,
    translateStub as TranslateService,
    breakpointStub as BreakpointObserver
  );
}

describe('RouteMapHomeComponent', () => {
  let component: RouteMapHomeComponent;
  let alertServiceStub: AnyStub;
  let routeMapServiceStub: AnyStub;
  let translateServiceStub: AnyStub;

  beforeEach(() => {
    alertServiceStub = createAlertServiceStub();
    translateServiceStub = createTranslateServiceStub();
    routeMapServiceStub = createRouteMapServiceStub();
    component = makeComponent(
      routeMapServiceStub,
      alertServiceStub,
      translateServiceStub,
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

  it('calls getActiveRoutes on init (not getFirstActiveRouteSlug)', () => {
    component.ngOnInit();
    expect(routeMapServiceStub.getActiveRoutes).toHaveBeenCalled();
  });

  // ── Direction selector: default ──────────────────────────────────────────
  it('defaults selectedRouteSlug to chonburi_bangkok (environment.homeRouteSlug)', () => {
    component.ngOnInit();
    expect(component.selectedRouteSlug).toBe('chonburi_bangkok');
  });

  it('builds two direction options from active routes', () => {
    component.ngOnInit();
    expect(component.directionOptions.length).toBe(2);
    expect(component.directionOptions[0].value).toBe('chonburi_bangkok');
    expect(component.directionOptions[1].value).toBe('bangkok_chonburi');
  });

  it('uses env homeRouteSlug as default when it exists regardless of list order', () => {
    const reorderedRoutes: RouteListItem[] = [
      {
        id: 2,
        slug: 'bangkok_chonburi',
        status: { code: 'active' },
        translations: { en: { label: 'Bangkok → Chonburi' }, th: { label: 'กรุงเทพ → ชลบุรี' } },
      },
      {
        id: 1,
        slug: 'chonburi_bangkok',
        status: { code: 'active' },
        translations: { en: { label: 'Chonburi → Bangkok' }, th: { label: 'ชลบุรี → กรุงเทพ' } },
      },
    ];
    const comp = makeComponent(
      createRouteMapServiceStub({ getActiveRoutes: () => of(reorderedRoutes) }),
      alertServiceStub,
      translateServiceStub,
      createBreakpointObserverStub()
    );
    comp.ngOnInit();
    expect(comp.selectedRouteSlug).toBe('chonburi_bangkok');
  });

  // ── Direction selector: switching ────────────────────────────────────────
  it('switching to bangkok_chonburi triggers getPickupDropoff with new slug', () => {
    component.ngOnInit();
    routeMapServiceStub.getPickupDropoff.calls.reset();

    component.selectedRouteSlug = 'bangkok_chonburi';
    component.onDirectionChange('bangkok_chonburi');

    expect(routeMapServiceStub.getPickupDropoff).toHaveBeenCalledWith('bangkok_chonburi');
  });

  it('switching direction resets all four selection fields', () => {
    component.ngOnInit();
    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = 'dropoff-1';
    component.selectedPickupStop = { slug: 'pickup-1' } as RouteStop;
    component.selectedDropoffStop = { slug: 'dropoff-1' } as RouteStop;

    component.selectedRouteSlug = 'bangkok_chonburi';
    component.onDirectionChange('bangkok_chonburi');

    expect(component.selectedPickupSlug).toBeNull();
    expect(component.selectedDropoffSlug).toBeNull();
    expect(component.selectedPickupStop).toBeNull();
    expect(component.selectedDropoffStop).toBeNull();
  });

  it('onDirectionChange with empty value is a no-op', () => {
    component.ngOnInit();
    routeMapServiceStub.getPickupDropoff.calls.reset();
    component.onDirectionChange('');
    expect(routeMapServiceStub.getPickupDropoff).not.toHaveBeenCalled();
  });

  // ── Label fallback ───────────────────────────────────────────────────────
  it('uses en label fallback when current locale (zh) label is missing', () => {
    const routesWithoutZh: RouteListItem[] = [
      {
        id: 1,
        slug: 'chonburi_bangkok',
        status: { code: 'active' },
        translations: {
          en: { label: 'Chonburi → Bangkok' },
          th: { label: 'ชลบุรี → กรุงเทพ' },
          // zh intentionally absent
        },
      },
    ];
    const translateStub = { ...createTranslateServiceStub(), currentLang: 'zh' };
    const comp = makeComponent(
      createRouteMapServiceStub({ getActiveRoutes: () => of(routesWithoutZh) }),
      alertServiceStub,
      translateStub,
      createBreakpointObserverStub()
    );
    comp.ngOnInit();
    expect(comp.directionOptions[0].label).toBe('Chonburi → Bangkok');
  });

  it('falls back to slug when both locale and en label are missing', () => {
    const routesNoLabel: RouteListItem[] = [
      {
        id: 1,
        slug: 'chonburi_bangkok',
        status: { code: 'active' },
        translations: {},
      },
    ];
    const comp = makeComponent(
      createRouteMapServiceStub({ getActiveRoutes: () => of(routesNoLabel) }),
      alertServiceStub,
      translateServiceStub,
      createBreakpointObserverStub()
    );
    comp.ngOnInit();
    expect(comp.directionOptions[0].label).toBe('chonburi_bangkok');
  });

  // ── Retry logic ──────────────────────────────────────────────────────────
  it('onRetry calls loadDirections when error context is directions', () => {
    const loadDirectionsSpy = spyOn(component, 'loadDirections');
    // Force the private errorRetryTarget
    (component as AnyStub).errorRetryTarget = 'directions';
    component.onRetry();
    expect(loadDirectionsSpy).toHaveBeenCalled();
  });

  it('onRetry calls loadPickupDropoff when error context is pickupDropoff', () => {
    const loadPickupDropoffSpy = spyOn(component, 'loadPickupDropoff');
    (component as AnyStub).errorRetryTarget = 'pickupDropoff';
    component.selectedRouteSlug = 'chonburi_bangkok';
    component.onRetry();
    expect(loadPickupDropoffSpy).toHaveBeenCalledWith('chonburi_bangkok');
  });

  // ── Existing tests (preserved) ───────────────────────────────────────────
  it('shows warning when confirming without selection', () => {
    component.ngOnInit();
    component.selectedPickupSlug = null;
    component.selectedDropoffSlug = null;
    component.onConfirmPickup();
    expect(alertServiceStub.toast).toHaveBeenCalledWith('HOME.ROUTE_MAP.VALIDATION_SELECT_BOTH', 'warning');
  });

  // ── Differentiated validation messages ──────────────────────────────────
  it('warns with VALIDATION_SELECT_DROPOFF and does not emit when only pickup is selected', () => {
    component.ngOnInit();
    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = null;

    const emitSpy = jasmine.createSpy('pickupDropoffConfirmed');
    component.pickupDropoffConfirmed.subscribe(emitSpy);

    component.onConfirmPickup();

    expect(alertServiceStub.toast).toHaveBeenCalledWith('HOME.ROUTE_MAP.VALIDATION_SELECT_DROPOFF', 'warning');
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('warns with VALIDATION_SELECT_PICKUP and does not emit when only drop-off is selected', () => {
    component.ngOnInit();
    component.selectedPickupSlug = null;
    component.selectedDropoffSlug = 'dropoff-1';

    const emitSpy = jasmine.createSpy('pickupDropoffConfirmed');
    component.pickupDropoffConfirmed.subscribe(emitSpy);

    component.onConfirmDropoff();

    expect(alertServiceStub.toast).toHaveBeenCalledWith('HOME.ROUTE_MAP.VALIDATION_SELECT_PICKUP', 'warning');
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('switches activeTabIndex to the drop-off tab index when only pickup is selected (desktop)', () => {
    // breakpointObserverStub returns matches: true → isDesktop = true → dropoff tab index = 1
    component.ngOnInit();
    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = null;

    component.onConfirmPickup();

    expect(component.activeTabIndex).toBe(1);
  });

  it('switches activeTabIndex to the drop-off tab index when only pickup is selected (mobile)', () => {
    // mobile breakpoint stub: matches: false → isDesktop = false → dropoff tab index = 2
    const mobileComponent = makeComponent(
      routeMapServiceStub,
      alertServiceStub,
      translateServiceStub,
      { observe: () => of({ matches: false }) }
    );
    mobileComponent.ngOnInit();
    mobileComponent.selectedPickupSlug = 'pickup-1';
    mobileComponent.selectedDropoffSlug = null;

    mobileComponent.onConfirmPickup();

    expect(mobileComponent.activeTabIndex).toBe(2);
  });

  it('emits pickupDropoffConfirmed when both slugs are selected', () => {
    component.ngOnInit();
    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = 'dropoff-1';

    const emitSpy = jasmine.createSpy('pickupDropoffConfirmed');
    component.pickupDropoffConfirmed.subscribe(emitSpy);

    component.onConfirmDropoff();

    expect(emitSpy).toHaveBeenCalledWith({
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

  // ── Parallelisation ──────────────────────────────────────────────────────
  it('fires getPickupDropoff in parallel and does NOT re-fetch when homeRouteSlug matches the default route', () => {
    component.ngOnInit();
    // The pre-fetch (fired concurrently with getActiveRoutes) counts as the
    // one and only getPickupDropoff call; no second call should happen after
    // directions resolve because the slug matches.
    expect(routeMapServiceStub.getPickupDropoff).toHaveBeenCalledOnceWith('chonburi_bangkok');
    expect(component.loadState).toBe('loaded');
  });

  it('re-fetches pickup-dropoff for the resolved default slug when active routes do not include homeRouteSlug', () => {
    // Routes list does NOT contain 'chonburi_bangkok', so setDefaultRoute()
    // will fall back to the first active route ('bangkok_chonburi').
    const routesWithoutHome: RouteListItem[] = [
      {
        id: 2,
        slug: 'bangkok_chonburi',
        status: { code: 'active' },
        translations: { en: { label: 'Bangkok → Chonburi' }, th: { label: 'กรุงเทพ → ชลบุรี' } },
      },
    ];
    const serviceStub = createRouteMapServiceStub({
      getActiveRoutes: () => of(routesWithoutHome),
    });
    const comp = makeComponent(serviceStub, alertServiceStub, translateServiceStub, createBreakpointObserverStub());
    comp.ngOnInit();
    // First call: parallel pre-fetch for homeRouteSlug ('chonburi_bangkok').
    // Second call: fallback fetch for the actual default ('bangkok_chonburi').
    expect(serviceStub.getPickupDropoff).toHaveBeenCalledWith('chonburi_bangkok');
    expect(serviceStub.getPickupDropoff).toHaveBeenCalledWith('bangkok_chonburi');
    expect(serviceStub.getPickupDropoff).toHaveBeenCalledTimes(2);
  });

  it('sets loadState to error with directions target when getActiveRoutes fails on init', () => {
    const serviceStub = createRouteMapServiceStub({
      getActiveRoutes: () => throwError(() => new Error('Network error')),
    });
    const comp = makeComponent(serviceStub, alertServiceStub, translateServiceStub, createBreakpointObserverStub());
    comp.ngOnInit();
    expect(comp.loadState).toBe('error');
    expect((comp as AnyStub).errorRetryTarget).toBe('directions');
  });

  it('sets loadState to error with pickupDropoff target when pre-fetch fails and slug matches homeRouteSlug', () => {
    const serviceStub = createRouteMapServiceStub({
      getPickupDropoff: () => throwError(() => new Error('Network error')),
    });
    const comp = makeComponent(serviceStub, alertServiceStub, translateServiceStub, createBreakpointObserverStub());
    comp.ngOnInit();
    expect(comp.loadState).toBe('error');
    expect((comp as AnyStub).errorRetryTarget).toBe('pickupDropoff');
  });
});
