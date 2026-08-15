import { of, Subject, throwError } from 'rxjs';
import { RouteMapHomeComponent } from './route-map-home.component';
import {
  RouteListItem,
  RoutePickupDropoffResponse,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';
import { RouteMapService } from '../../../../../services/route-map/route-map.service';
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
  translateStub: AnyStub,
  breakpointStub: AnyStub
): RouteMapHomeComponent {
  return new RouteMapHomeComponent(
    serviceStub as RouteMapService,
    translateStub as TranslateService,
    breakpointStub as BreakpointObserver
  );
}

describe('RouteMapHomeComponent', () => {
  let component: RouteMapHomeComponent;
  let routeMapServiceStub: AnyStub;
  let translateServiceStub: AnyStub;

  beforeEach(() => {
    translateServiceStub = createTranslateServiceStub();
    routeMapServiceStub = createRouteMapServiceStub();
    component = makeComponent(
      routeMapServiceStub,
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
      createRouteMapServiceStub({ getActiveRoutes: () => of(routesWithoutZh) }),      translateStub,
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

  // ── OBRS-1358: one confirm action; the tab advances on SELECTION ─────────
  //
  // Replaces the OBRS-73 guidance tests. Those asserted that pressing a per-side
  // "Confirm pickup" with only a pickup chosen toasted a warning and swapped the tab.
  // That is the behaviour usability report #6 reported as confusing: the button said it
  // confirmed one side and the handler behind it always demanded both.

  it('canConfirm stays false until BOTH sides are chosen', () => {
    component.ngOnInit();
    expect(component.canConfirm).toBeFalse();

    component.selectedPickupSlug = 'pickup-1';
    expect(component.canConfirm).toBeFalse();

    component.selectedDropoffSlug = 'dropoff-1';
    expect(component.canConfirm).toBeTrue();
  });

  it('onConfirm emits nothing while a side is missing (and warns nobody)', () => {
    component.ngOnInit();
    const emitSpy = jasmine.createSpy('pickupDropoffConfirmed');
    component.pickupDropoffConfirmed.subscribe(emitSpy);

    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = null;
    component.onConfirm();

    component.selectedPickupSlug = null;
    component.selectedDropoffSlug = 'dropoff-1';
    component.onConfirm();

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('picking a pickup in the LIST carries the user to the drop-off tab (desktop index 1)', () => {
    component.ngOnInit();
    component.onPickupPickedFromList(stopAt(0, 'pickup-1'));
    expect(component.activeTabIndex).toBe(1);
  });

  it('picking a pickup in the LIST carries the user to the drop-off tab (mobile index 2)', () => {
    const mobileComponent = makeComponent(
      routeMapServiceStub,
      translateServiceStub,
      { observe: () => of({ matches: false }) }
    );
    mobileComponent.ngOnInit();
    mobileComponent.onPickupPickedFromList(stopAt(0, 'pickup-1'));
    expect(mobileComponent.activeTabIndex).toBe(2);
  });

  it('picking the drop-off first carries the user back to the pickup tab', () => {
    component.ngOnInit();
    component.activeTabIndex = 1;
    component.onDropoffPickedFromList(stopAt(1, 'dropoff-1'));
    expect(component.activeTabIndex).toBe(0);
  });

  it('does NOT move the tab once the pair is already complete', () => {
    component.ngOnInit();
    component.onDropoffStopSelected(stopAt(1, 'dropoff-1'));
    component.activeTabIndex = 0;

    component.onPickupPickedFromList(stopAt(0, 'pickup-1'));

    expect(component.selectedDropoffSlug).toBe('dropoff-1');
    expect(component.activeTabIndex).toBe(0);
  });

  it('does NOT move the tab onto an empty drop-off list', () => {
    component.ngOnInit();
    component.activeTabIndex = 0;

    // order 1 equals the only drop-off's order, so refreshDropoffOptions empties the list -
    // the real case of a pickup that is the last stop the van serves.
    component.onPickupPickedFromList(stopAt(1, 'pickup-1'));

    expect(component.dropoffStops.length).toBe(0);
    expect(component.activeTabIndex).toBe(0);
  });

  it('a pickup chosen on the MAP does not move the tab', () => {
    component.ngOnInit();
    component.activeTabIndex = 1;
    component.onPickupStopSelected(stopAt(0, 'pickup-1'));
    expect(component.activeTabIndex).toBe(1);
  });

  it('emits pickupDropoffConfirmed when both slugs are selected', () => {
    component.ngOnInit();
    component.selectedPickupSlug = 'pickup-1';
    component.selectedDropoffSlug = 'dropoff-1';

    const emitSpy = jasmine.createSpy('pickupDropoffConfirmed');
    component.pickupDropoffConfirmed.subscribe(emitSpy);

    component.onConfirm();

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
    const comp = makeComponent(serviceStub, translateServiceStub, createBreakpointObserverStub());
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
    const comp = makeComponent(serviceStub, translateServiceStub, createBreakpointObserverStub());
    comp.ngOnInit();
    expect(comp.loadState).toBe('error');
    expect((comp as AnyStub).errorRetryTarget).toBe('directions');
  });

  it('sets loadState to error with pickupDropoff target when pre-fetch fails and slug matches homeRouteSlug', () => {
    const serviceStub = createRouteMapServiceStub({
      getPickupDropoff: () => throwError(() => new Error('Network error')),
    });
    const comp = makeComponent(serviceStub, translateServiceStub, createBreakpointObserverStub());
    comp.ngOnInit();
    expect(comp.loadState).toBe('error');
    expect((comp as AnyStub).errorRetryTarget).toBe('pickupDropoff');
  });

  // ── OBRS-1052: a stop can now be a pickup AND a dropoff on the same route ──
  //
  // boarding_type gained a third value, BOTH, so GET /routes/{slug}/pickup-dropoff returns
  // จุดพักรถลาดกระบัง 1 ขาออก in `pickup` and in `dropoff`. The two arrays are no longer disjoint,
  // and the component used to bind `dropoff` straight through — which offers the user the stop
  // they are boarding at, and every stop the van passes before it. No such pair exists in
  // `segments`, and the backend answers a missing pair with a 404 rather than a fare, so the
  // failure surfaces at booking time rather than at selection.
  describe('drop-off list narrowing (OBRS-1052)', () => {
    const bothRouteResponse: RoutePickupDropoffResponse = {
      status: 'success',
      message: 'ok',
      data: {
        route: {
          slug: 'bangkok_chonburi',
          titleLocalized: { en: 'Bangkok-Ban Bueng-Nong Chak', th: 'กรุงเทพฯ-บ้านบึง-หนองชาก', zh: '' },
          totalDistanceKm: 127.6,
          durationMinMinutes: 90,
          durationMaxMinutes: 150,
          originProvinceLabel: 'Bangkok',
          destinationProvinceLabel: 'Chonburi',
        },
        // Mirrors the real route: four Bangkok pickups, ลาดกระบัง at order 5 in BOTH arrays,
        // Chonburi dropoffs after it.
        pickup: [
          stopAt(1, 'mo_chit_2_bus_terminal'),
          stopAt(5, 'lat_krabang_rest_stop_1'),
        ],
        dropoff: [
          stopAt(5, 'lat_krabang_rest_stop_1'),
          stopAt(6, 'ban_bueng_wisitchai_market'),
        ],
      },
    };

    function componentOnBothRoute(): RouteMapHomeComponent {
      const serviceStub = createRouteMapServiceStub({
        getPickupDropoff: () => of(bothRouteResponse),
      });
      const comp = makeComponent(
        serviceStub,
        translateServiceStub,
        createBreakpointObserverStub()
      );
      comp.ngOnInit();
      return comp;
    }

    it('offers every drop-off while no pickup is chosen', () => {
      const comp = componentOnBothRoute();

      expect(comp.dropoffStops.map((s) => s.slug)).toEqual([
        'lat_krabang_rest_stop_1',
        'ban_bueng_wisitchai_market',
      ]);
    });

    it('removes the BOTH stop from the drop-offs once it is the chosen pickup', () => {
      const comp = componentOnBothRoute();

      comp.onPickupStopSelected(stopAt(5, 'lat_krabang_rest_stop_1'));

      expect(comp.dropoffStops.map((s) => s.slug)).toEqual([
        'ban_bueng_wisitchai_market',
      ]);
    });

    it('keeps the BOTH stop as a drop-off for a pickup upstream of it', () => {
      const comp = componentOnBothRoute();

      comp.onPickupStopSelected(stopAt(1, 'mo_chit_2_bus_terminal'));

      expect(comp.dropoffStops.map((s) => s.slug)).toContain(
        'lat_krabang_rest_stop_1'
      );
    });

    // The narrowing has to reach a selection that was already made, not just the list. Without
    // this, choosing ลาดกระบัง as the drop-off and THEN moving the pickup onto it leaves the
    // 404-producing pair selected while the list on screen no longer shows it.
    it('clears an already-selected drop-off that the new pickup invalidates', () => {
      const comp = componentOnBothRoute();
      comp.onDropoffStopSelected(stopAt(5, 'lat_krabang_rest_stop_1'));
      expect(comp.selectedDropoffSlug).toBe('lat_krabang_rest_stop_1');

      comp.onPickupStopSelected(stopAt(5, 'lat_krabang_rest_stop_1'));

      expect(comp.selectedDropoffSlug).toBeNull();
      expect(comp.selectedDropoffStop).toBeNull();
    });

    // "Use my location" auto-selects the nearest pickup, which moves the pickup without any tap
    // on the pickup list. It has to narrow the drop-offs by the same rule or the whole guard is
    // bypassed by the one path most users take on a phone.
    it('narrows the drop-offs when the nearest pickup is auto-selected by geolocation', () => {
      const comp = componentOnBothRoute();

      comp.onUserLocated({
        distancesKm: { lat_krabang_rest_stop_1: 0.4 },
        nearestPickupSlug: 'lat_krabang_rest_stop_1',
      });

      expect(comp.dropoffStops.map((s) => s.slug)).toEqual([
        'ban_bueng_wisitchai_market',
      ]);
    });

    // The empty state must keep meaning "this route has no stops", not "the stop you picked is the
    // last one" -- it reads the unfiltered list for exactly that reason.
    it('does not fall into the empty state when the filter leaves no drop-offs', () => {
      const comp = componentOnBothRoute();

      comp.onPickupStopSelected(stopAt(9, 'nong_chak'));

      expect(comp.dropoffStops).toEqual([]);
      expect(comp.loadState).toBe('loaded');
    });
  });
});

function stopAt(order: number, slug: string): RouteStop {
  return {
    order,
    slug,
    name: slug,
    address: 'Addr',
    approxTime: '08:00',
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}
