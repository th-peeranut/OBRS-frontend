import { NgZone, SimpleChange, SimpleChanges } from '@angular/core';
import { RouteMapPanelComponent, UserLocatedEvent } from './route-map-panel.component';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

/** NgZone stub that runs callbacks synchronously (tests don't need real zones). */
const zoneStub = { run: <T>(fn: () => T): T => fn() } as unknown as NgZone;

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

/** Build a minimal SimpleChange for use with ngOnChanges. */
function sc<T>(currentValue: T, previousValue?: T): SimpleChange {
  const firstChange = previousValue === undefined;
  return { currentValue, previousValue, firstChange, isFirstChange: () => firstChange };
}

/** Helper: build a SimpleChanges bag for a single key. */
function changes<T>(key: string, current: T, previous?: T): SimpleChanges {
  return { [key]: sc(current, previous) };
}

// ---------------------------------------------------------------------------
// Minimal google.maps stub — only what buildMarkerOptions() needs.
// The real API is not available in Karma/ChromeHeadless, so tests that invoke
// the precompute path that calls new google.maps.Size/Point must set this up.
// ---------------------------------------------------------------------------
interface MockSize { w: number; h: number }
interface MockPoint { x: number; y: number }

const mockMapsLib = {
  Size: class implements MockSize {
    constructor(public w: number, public h: number) {}
  },
  Point: class implements MockPoint {
    constructor(public x: number, public y: number) {}
  },
};

function installGoogleMock(): void {
  (window as unknown as Record<string, unknown>)['google'] = { maps: mockMapsLib };
}

function removeGoogleMock(): void {
  delete (window as unknown as Record<string, unknown>)['google'];
}

// ---------------------------------------------------------------------------
describe('RouteMapPanelComponent', () => {
  let component: RouteMapPanelComponent;

  beforeEach(() => {
    component = new RouteMapPanelComponent(zoneStub);
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
    component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
    const center = component.mapCenter;
    expect(center.lat).toBeCloseTo(13.7563, 3);
    expect(center.lng).toBeCloseTo(100.5018, 3);
  });

  it('polylinePath returns empty array when no stops have coords', () => {
    component.pickupStops = [makeStop(1, false)];
    component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
    expect(component.polylinePath.length).toBe(0);
  });

  it('stopHasCoords returns true for a stop with coordinates', () => {
    const stop = makeStop(1, true);
    expect(component.stopHasCoords(stop)).toBeTrue();
  });

  // -------------------------------------------------------------------------
  // REGRESSION TESTS — these verify the CD-freeze fix (GitHub issue #73).
  //
  // The root cause was getters returning new object references on every
  // change-detection pass, causing @angular/google-maps to call setOptions()
  // every tick, which fired map events → CD → new references → infinite loop.
  //
  // Each test is annotated with whether it would FAIL on the old getter code.
  // -------------------------------------------------------------------------

  describe('reference stability (regression for CD storm / freeze fix)', () => {

    it('[FAILS on old getter] mapOptions returns the SAME reference on consecutive reads without input changes', () => {
      // Old getter code: every read returned `return { zoom:10, center: this.mapCenter, ... }` — always a new object.
      // New field code: `mapOptions` is a precomputed field; consecutive reads return the same reference.
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      const ref1 = component.mapOptions;
      const ref2 = component.mapOptions;

      expect(ref1).toBe(ref2);
    });

    it('[FAILS on old getter] polylinePath returns the SAME reference on consecutive reads without input changes', () => {
      // Old getter computed and returned a new array on every call.
      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      const ref1 = component.polylinePath;
      const ref2 = component.polylinePath;

      expect(ref1).toBe(ref2);
    });

    it('[FAILS on old getter] polylineOptions returns the SAME reference on consecutive reads', () => {
      // Old getter: `return { strokeColor: ..., strokeWeight: 4, ... }` — new object each call.
      // New code: readonly field, always same reference.
      const ref1 = component.polylineOptions;
      const ref2 = component.polylineOptions;

      expect(ref1).toBe(ref2);
    });

    it('ngOnChanges with new pickupStops produces a NEW mapOptions reference (recompute works)', () => {
      const initialStops = [makeStop(1, true)];
      component.pickupStops = initialStops;
      component.ngOnChanges(changes('pickupStops', initialStops, []));
      const ref1 = component.mapOptions;

      const newStops = [makeStop(5, true)];
      component.pickupStops = newStops;
      component.ngOnChanges(changes('pickupStops', newStops, initialStops));
      const ref2 = component.mapOptions;

      expect(ref2).not.toBe(ref1);
    });

    it('mapOptions.center is recomputed when pickupStops change', () => {
      component.pickupStops = [makeStop(1, true)]; // lat: 13.1
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
      const center1 = component.mapOptions.center as google.maps.LatLngLiteral;

      component.pickupStops = [makeStop(5, true)]; // lat: 13.5
      component.ngOnChanges(changes('pickupStops', component.pickupStops, [makeStop(1, true)]));
      const center2 = component.mapOptions.center as google.maps.LatLngLiteral;

      expect(center2.lat).not.toBeCloseTo(center1.lat, 3);
    });

    it('ngOnChanges with new polylinePath produces a NEW array reference (recompute works)', () => {
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
      const path1 = component.polylinePath;

      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, [makeStop(1, true)]));
      const path2 = component.polylinePath;

      expect(path2).not.toBe(path1);
      expect(path2.length).toBe(2);
    });

    it('selection-only change does NOT update mapOptions reference (no unnecessary center re-apply)', () => {
      // This was a key concern: toggling the direction selector must not cause
      // the map to re-apply options (which would re-center and start the loop).
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
      const ref1 = component.mapOptions;

      component.selectedPickupSlug = 'stop-1';
      component.ngOnChanges(changes('selectedPickupSlug', 'stop-1', null));
      const ref2 = component.mapOptions;

      expect(ref2).toBe(ref1); // Same reference — @angular/google-maps will not call setOptions
    });

  });

  // -------------------------------------------------------------------------
  // Marker-click selection — clicking a map marker must drive selection the
  // same way the left-hand stop list does (the bug: markers had no click wire,
  // so only the list could select a stop).
  // -------------------------------------------------------------------------

  describe('marker click drives selection', () => {

    it('clicking a pickup marker emits the matching pickup stop', () => {
      const stops = [makeStop(1, true), makeStop(2, true)];
      component.pickupStops = stops;
      let emitted: RouteStop | undefined;
      component.pickupStopSelected.subscribe((s) => (emitted = s));

      component.onPickupMarkerClick('stop-2');

      expect(emitted).toBe(stops[1]);
    });

    it('clicking a dropoff marker emits the matching dropoff stop', () => {
      const stops = [makeStop(1, true), makeStop(2, true)];
      component.dropoffStops = stops;
      let emitted: RouteStop | undefined;
      component.dropoffStopSelected.subscribe((s) => (emitted = s));

      component.onDropoffMarkerClick('stop-1');

      expect(emitted).toBe(stops[0]);
    });

    it('clicking a marker with an unknown slug emits nothing (no crash)', () => {
      component.pickupStops = [makeStop(1, true)];
      const spy = jasmine.createSpy('pickupStopSelected');
      component.pickupStopSelected.subscribe(spy);

      component.onPickupMarkerClick('does-not-exist');

      expect(spy).not.toHaveBeenCalled();
    });

  });

  // -------------------------------------------------------------------------
  // Marker regression tests — require google.maps stub
  // -------------------------------------------------------------------------

  describe('marker precompute (requires google.maps stub)', () => {

    beforeEach(() => {
      installGoogleMock();
    });

    afterEach(() => {
      removeGoogleMock();
    });

    it('[FAILS on old code] pickupMarkers is a precomputed field returning SAME reference on consecutive reads', () => {
      // Old code had no pickupMarkers field — markers were computed via getPickupMarkerOptions(stop)
      // called in the template on every CD pass. New code precomputes and stores a stable array.
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      const ref1 = component.pickupMarkers;
      const ref2 = component.pickupMarkers;

      expect(ref1).toBe(ref2);
    });

    it('pickupMarkers contains one entry per stop with correct slug', () => {
      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      expect(component.pickupMarkers.length).toBe(2);
      expect(component.pickupMarkers[0].slug).toBe('stop-1');
      expect(component.pickupMarkers[1].slug).toBe('stop-2');
    });

    it('selectedPickupSlug change produces a NEW pickupMarkers reference', () => {
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
      const ref1 = component.pickupMarkers;

      component.selectedPickupSlug = 'stop-1';
      component.ngOnChanges(changes('selectedPickupSlug', 'stop-1', null));
      const ref2 = component.pickupMarkers;

      expect(ref2).not.toBe(ref1);
    });

    it('selected marker uses larger icon size (44) than unselected (36)', () => {
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
      const normalSize = (component.pickupMarkers[0].options.icon as google.maps.Icon).scaledSize as unknown as MockSize;
      expect(normalSize.w).toBe(36);

      component.selectedPickupSlug = 'stop-1';
      component.ngOnChanges(changes('selectedPickupSlug', 'stop-1', null));
      const selectedSize = (component.pickupMarkers[0].options.icon as google.maps.Icon).scaledSize as unknown as MockSize;
      expect(selectedSize.w).toBe(44);
    });

    it('selected marker has higher zIndex (100) than unselected (order value)', () => {
      component.pickupStops = [makeStop(3, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));
      expect(component.pickupMarkers[0].options.zIndex).toBe(3); // order

      component.selectedPickupSlug = 'stop-3';
      component.ngOnChanges(changes('selectedPickupSlug', 'stop-3', null));
      expect(component.pickupMarkers[0].options.zIndex).toBe(100);
    });

    it('markers are NOT computed (no crash, empty array) when google.maps is unavailable', () => {
      removeGoogleMock(); // Temporarily remove for this test
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      expect(component.pickupMarkers.length).toBe(0);
      expect(component.dropoffMarkers.length).toBe(0);

      installGoogleMock(); // Restore so afterEach removeGoogleMock has something to remove
    });

    it('dropoffMarkers uses red (#DC3545) color in SVG url', () => {
      component.dropoffStops = [makeStop(1, true)];
      component.ngOnChanges(changes('dropoffStops', component.dropoffStops, []));

      const icon = component.dropoffMarkers[0].options.icon as google.maps.Icon;
      expect(icon.url).toContain('%23DC3545'); // URL-encoded #DC3545
    });

    it('pickupMarkers uses blue (#3BB0E7) color in SVG url', () => {
      component.pickupStops = [makeStop(1, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      const icon = component.pickupMarkers[0].options.icon as google.maps.Icon;
      expect(icon.url).toContain('%233BB0E7'); // URL-encoded #3BB0E7
    });

  });

  // -------------------------------------------------------------------------
  // Directions road-snapping tests
  //
  // (a) On stops change, polylinePath is initially the straight ordered path.
  // (b) When DirectionsService returns a route, polylinePath becomes the road path.
  // (c) When DirectionsService errors / returns non-OK status, polylinePath
  //     stays as the straight path (fallback).
  // -------------------------------------------------------------------------

  describe('Directions road-snapping', () => {
    /**
     * Minimal LatLng mock: exposes .lat() and .lng() methods as the real API
     * does, allowing the component to read overview_path entries correctly.
     */
    class MockLatLng {
      constructor(private _lat: number, private _lng: number) {}
      lat(): number { return this._lat; }
      lng(): number { return this._lng; }
    }

    /**
     * Build a mock DirectionsResult with a simple two-point overview_path.
     */
    function mockDirectionsResult(
      overviewPoints: Array<{ lat: number; lng: number }>
    ): google.maps.DirectionsResult {
      return {
        routes: [
          {
            overview_path: overviewPoints.map(
              (p) => new MockLatLng(p.lat, p.lng) as unknown as google.maps.LatLng
            ),
          } as unknown as google.maps.DirectionsRoute,
        ],
      } as unknown as google.maps.DirectionsResult;
    }

    /**
     * Install a google.maps mock that includes a DirectionsService whose
     * `route()` callback is controlled by `respondWith`.
     *
     * @param respondWith  Null ⇒ call callback with (null, errorStatus).
     *                     DirectionsResult ⇒ call callback with (result, 'OK').
     * @param errorStatus  Status string used when respondWith is null.
     */
    function installMockWithDirections(
      respondWith: google.maps.DirectionsResult | null,
      errorStatus = 'REQUEST_DENIED'
    ): void {
      const routeSpy = jasmine
        .createSpy('route')
        .and.callFake(
          (
            _req: google.maps.DirectionsRequest,
            cb: (
              r: google.maps.DirectionsResult | null,
              s: google.maps.DirectionsStatus
            ) => void
          ) => {
            if (respondWith) {
              cb(respondWith, 'OK' as google.maps.DirectionsStatus);
            } else {
              cb(null, errorStatus as google.maps.DirectionsStatus);
            }
          }
        );

      (window as unknown as Record<string, unknown>)['google'] = {
        maps: {
          ...mockMapsLib,
          DirectionsService: class {
            route = routeSpy;
          },
        },
      };
    }

    afterEach(() => {
      removeGoogleMock();
    });

    it('(a) polylinePath is immediately set to the straight ordered path on stops change', () => {
      // No Directions mock installed — falls back to straight path.
      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Synchronous check: straight path is assigned before any async resolves.
      expect(component.polylinePath.length).toBe(2);
      expect(component.polylinePath[0].lat).toBeCloseTo(13.1, 3);
      expect(component.polylinePath[1].lat).toBeCloseTo(13.2, 3);
    });

    it('(a) straight path preserves pickup-then-dropoff order sorted by stop.order', () => {
      component.pickupStops = [makeStop(2, true), makeStop(1, true)]; // unsorted
      component.dropoffStops = [makeStop(1, true)]; // dropoff order 1 → lat 13.1
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Pickup stops sorted by order: stop-1 (lat 13.1), stop-2 (lat 13.2)
      // Then dropoff stop-1 (lat 13.1)
      expect(component.polylinePath.length).toBe(3);
      expect(component.polylinePath[0].lat).toBeCloseTo(13.1, 3); // pickup order 1
      expect(component.polylinePath[1].lat).toBeCloseTo(13.2, 3); // pickup order 2
      expect(component.polylinePath[2].lat).toBeCloseTo(13.1, 3); // dropoff order 1
    });

    it('(b) polylinePath is upgraded to road-snapped path when DirectionsService returns OK', async () => {
      const roadResult = mockDirectionsResult([
        { lat: 14.0, lng: 101.0 },
        { lat: 14.5, lng: 101.5 },
      ]);
      installMockWithDirections(roadResult);

      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Straight path is set immediately.
      expect(component.polylinePath.length).toBe(2);
      expect(component.polylinePath[0].lat).toBeCloseTo(13.1, 3);

      // Wait for the Directions promise chain to settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      // Road-snapped path replaces the straight path.
      expect(component.polylinePath.length).toBe(2);
      expect(component.polylinePath[0].lat).toBeCloseTo(14.0, 3);
      expect(component.polylinePath[1].lat).toBeCloseTo(14.5, 3);
    });

    it('(c) polylinePath stays as straight path when DirectionsService returns REQUEST_DENIED', async () => {
      installMockWithDirections(null, 'REQUEST_DENIED');

      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Capture straight path before async settles.
      const straightLat0 = component.polylinePath[0].lat;
      const straightLen = component.polylinePath.length;

      // Wait for the Directions promise chain to settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      // polylinePath must remain the straight path.
      expect(component.polylinePath.length).toBe(straightLen);
      expect(component.polylinePath[0].lat).toBeCloseTo(straightLat0, 5);
    });

    it('(c) polylinePath stays as straight path when DirectionsService returns ZERO_RESULTS', async () => {
      installMockWithDirections(null, 'ZERO_RESULTS');

      component.pickupStops = [makeStop(1, true), makeStop(3, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      const straightLat0 = component.polylinePath[0].lat;

      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(component.polylinePath[0].lat).toBeCloseTo(straightLat0, 5);
    });

    it('(c) polylinePath stays as straight path when google.maps is unavailable (no API key env)', () => {
      // No mock installed — window.google is absent.
      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Straight path immediately and no crash.
      expect(component.polylinePath.length).toBe(2);
    });

    it('stale-response guard: direction toggle discards slow response for previous direction', async () => {
      // First direction: two pickup stops.
      const roadResult1 = mockDirectionsResult([
        { lat: 10.0, lng: 100.0 },
        { lat: 10.5, lng: 100.5 },
      ]);
      installMockWithDirections(roadResult1);

      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Immediately change direction (new stops) before first response settles.
      const roadResult2 = mockDirectionsResult([
        { lat: 20.0, lng: 100.0 },
        { lat: 20.5, lng: 100.5 },
      ]);
      // Update mock to return the second road result.
      installMockWithDirections(roadResult2);

      component.pickupStops = [makeStop(3, true), makeStop(4, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, []));

      // Both promises settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      // The second direction's road path must win.
      expect(component.polylinePath[0].lat).toBeCloseTo(20.0, 3);
    });

  });

  // -------------------------------------------------------------------------
  // "Use my location" → nearest pickup (requires google.maps stub for the
  // user marker; navigator.geolocation is spied on per test)
  // -------------------------------------------------------------------------
  describe('Use my location (nearest pickup)', () => {
    beforeEach(() => {
      installGoogleMock();
    });

    afterEach(() => {
      removeGoogleMock();
    });

    it('emits the nearest pickup slug and per-stop distances, and drops a user marker', () => {
      // user sits exactly on stop-1 (lat 13.1, lng 100.1); stop-2 is further away
      component.pickupStops = [makeStop(1, true), makeStop(2, true)];
      const userPos = {
        coords: { latitude: 13.1, longitude: 100.1 },
      } as GeolocationPosition;
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
        (success: PositionCallback) => success(userPos)
      );

      let emitted: UserLocatedEvent | undefined;
      component.userLocated.subscribe((e) => (emitted = e));

      component.useMyLocation();

      expect(emitted).toBeDefined();
      expect(emitted!.nearestPickupSlug).toBe('stop-1');
      expect(emitted!.distancesKm['stop-1']).toBeCloseTo(0, 1);
      expect(emitted!.distancesKm['stop-2']).toBeGreaterThan(
        emitted!.distancesKm['stop-1']
      );
      expect(component.userMarkerOptions).not.toBeNull();
      expect(component.locating).toBeFalse();
      expect(component.locationError).toBeNull();
    });

    it('skips stops without coordinates when finding the nearest', () => {
      component.pickupStops = [makeStop(1, false), makeStop(2, true)];
      const userPos = {
        coords: { latitude: 13.2, longitude: 100.2 },
      } as GeolocationPosition;
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
        (success: PositionCallback) => success(userPos)
      );

      let emitted: UserLocatedEvent | undefined;
      component.userLocated.subscribe((e) => (emitted = e));

      component.useMyLocation();

      expect(emitted!.nearestPickupSlug).toBe('stop-2');
      expect(emitted!.distancesKm['stop-1']).toBeUndefined();
    });

    it('sets locationError to "denied" when permission is refused', () => {
      const err = {
        code: 1,
        PERMISSION_DENIED: 1,
      } as GeolocationPositionError;
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
        (_s: PositionCallback, error?: PositionErrorCallback | null) =>
          error?.(err)
      );

      component.useMyLocation();

      expect(component.locationError).toBe('denied');
      expect(component.locating).toBeFalse();
    });

    it('re-emits distances against the new pickup set on a stops change after locating', () => {
      const userPos = {
        coords: { latitude: 13.1, longitude: 100.1 },
      } as GeolocationPosition;
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
        (success: PositionCallback) => success(userPos)
      );
      component.pickupStops = [makeStop(1, true)];
      component.useMyLocation();

      const emissions: UserLocatedEvent[] = [];
      component.userLocated.subscribe((e) => emissions.push(e));

      // Direction toggle → different pickup set
      component.pickupStops = [makeStop(5, true)];
      component.ngOnChanges(changes('pickupStops', component.pickupStops, [makeStop(1, true)]));

      expect(emissions.length).toBe(1);
      expect(emissions[0].nearestPickupSlug).toBe('stop-5');
    });
  });

});
