import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import * as L from 'leaflet';
import { FleetMapPanelComponent } from './fleet-map-panel.component';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';

function makeRow(overrides: Partial<FleetPositionRespDto> = {}): FleetPositionRespDto {
  return {
    vehicleId: 1,
    numberPlate: '40-1234',
    vehicleNumber: '1',
    lat: 13.36,
    lon: 100.98,
    speed: 40,
    course: 90,
    engineStatus: 1,
    recordedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    positionKnown: true,
    stale: false,
    deviceOnline: true,
    gpsImeiConfigured: true,
    ...overrides,
  };
}

describe('FleetMapPanelComponent', () => {
  let fixture: ComponentFixture<FleetMapPanelComponent>;
  let component: FleetMapPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [FleetMapPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FleetMapPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  // NOTE on every test below that sets `component.vehicles`/`maptilerKey`
  // directly (there is no host template driving [vehicles]/[maptilerKey]
  // bindings): Angular only invokes `ngOnChanges()` automatically when an
  // @Input is written through a compiled template binding. Assigning the
  // field directly on the instance does NOT trigger it — `fixture.detectChanges()`
  // still runs `ngAfterViewInit()` (a view-lifecycle hook, unconditional on
  // first CD), but never calls `ngOnChanges()` on its own. Every test that
  // needs `latestVehicles`/`markers` to reflect an input write therefore
  // calls `component.ngOnChanges()` explicitly, mirroring the pattern already
  // used elsewhere in this repo (e.g. vehicle-maintenance-panel.component.spec.ts).

  describe('empty-key regression (§4.4)', () => {
    it('never constructs L.map, and ngOnChanges/ngAfterViewInit do not throw, when maptilerKey is empty', () => {
      const mapSpy = spyOn(L, 'map').and.callThrough();
      component.maptilerKey = '';
      component.vehicles = [makeRow()];
      component.ngOnChanges();

      expect(() => fixture.detectChanges()).not.toThrow();

      expect(mapSpy).not.toHaveBeenCalled();
      expect(component.canShowMap).toBeFalse();
    });

    it('renders the MAP_UNAVAILABLE placeholder instead of the canvas', () => {
      component.maptilerKey = '';
      fixture.detectChanges();

      const canvas: HTMLElement | null = fixture.nativeElement.querySelector('.fleet-map-canvas');
      const unavailable: HTMLElement | null = fixture.nativeElement.querySelector('.fleet-map-unavailable');
      expect(canvas).toBeNull();
      expect(unavailable).not.toBeNull();
    });

    it('ngOnDestroy does not throw when no map was ever constructed', () => {
      component.maptilerKey = '';
      fixture.detectChanges();

      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('with a real MapTiler key', () => {
    it('buffered-render: an @Input set before ngAfterViewInit is not lost once the map exists (§4.7, deterministic — not a race)', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 1 }), makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0 })];

      // Simulate the input arriving BEFORE the view exists — this IS what
      // real Angular guarantees (ngOnChanges always precedes ngAfterViewInit),
      // reproduced here deterministically rather than raced.
      component.ngOnChanges();
      expect((component as unknown as { map: L.Map | null }).map)
        .withContext('sanity: the view/map must not exist yet at this point')
        .toBeNull();

      // fixture.detectChanges() now runs ngAfterViewInit, which must replay
      // the buffered latestVehicles once the map exists (§4.7).
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(2);
    });

    it('first sync with N marker-eligible vehicles creates N markers and calls fitBounds exactly once', () => {
      // Spy on the prototype BEFORE the map is constructed so it also
      // captures the very first (automatic) fitBounds call inside
      // ngAfterViewInit's initial syncMarkers().
      const fitBoundsSpy = spyOn(L.Map.prototype, 'fitBounds').and.callThrough();

      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 1 }), makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0 })];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(2);
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1);
    });

    it('a second sync with the same vehicle set does not create new markers and does not call fitBounds again', () => {
      const fitBoundsSpy = spyOn(L.Map.prototype, 'fitBounds').and.callThrough();

      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 1 })];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      const markerBefore = markers.get(1);
      expect(markerBefore).withContext('first sync must have created the marker').toBeTruthy();
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1);

      // Next poll tick, identical vehicle set (a fresh array/object, as a
      // real store emission would be).
      component.vehicles = [makeRow({ vehicleId: 1 })];
      component.ngOnChanges();

      expect(markers.size).toBe(1);
      expect(markers.get(1)).toBe(markerBefore as L.Marker); // same instance, mutated in place
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1); // still 1 — never re-run automatically
    });

    it('§3.2 edge case: gpsImeiConfigured:false + positionKnown:true never gets a marker, even with lat/lon present', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [
        makeRow({ vehicleId: 9, gpsImeiConfigured: false, positionKnown: true, deviceOnline: true, stale: false, lat: 13.5, lon: 101.1 }),
      ];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(0);
    });

    it('a vehicle that flips OUT of marker-eligibility (e.g. tracker unmapped) has its existing marker removed', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 5 })];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(1);

      component.vehicles = [
        makeRow({ vehicleId: 5, gpsImeiConfigured: false, positionKnown: true, deviceOnline: null, stale: true }),
      ];
      component.ngOnChanges();

      expect(markers.size).toBe(0);
    });

    it('ngOnDestroy calls map.remove() when a map was constructed', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow()];
      fixture.detectChanges();

      const map = (component as unknown as { map: L.Map }).map;
      const removeSpy = spyOn(map, 'remove').and.callThrough();

      component.ngOnDestroy();

      expect(removeSpy).toHaveBeenCalled();
    });

    it('the tile layer attribution names both MapTiler and OpenStreetMap, and attributionControl is never disabled', () => {
      component.maptilerKey = 'test-key';
      fixture.detectChanges();

      const map = (component as unknown as { map: L.Map }).map;
      expect(map.attributionControl).toBeTruthy();

      let attributionHtml = '';
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          attributionHtml = (layer.options.attribution as string) || '';
        }
      });
      expect(attributionHtml).toContain('MapTiler');
      expect(attributionHtml).toContain('OpenStreetMap');
    });
  });
});
