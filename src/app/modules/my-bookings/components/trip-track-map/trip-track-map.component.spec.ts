import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import * as L from 'leaflet';
import { TripTrackMapComponent } from './trip-track-map.component';

describe('TripTrackMapComponent', () => {
  let fixture: ComponentFixture<TripTrackMapComponent>;
  let component: TripTrackMapComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [TripTrackMapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TripTrackMapComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  // NOTE (same pattern as FleetMapPanelComponent's own spec): Angular only
  // invokes ngOnChanges() automatically through a compiled template binding.
  // Every test writing @Inputs directly on the instance calls
  // component.ngOnChanges() explicitly.

  it('U24: an @Input set BEFORE ngAfterViewInit is not lost once the map exists (buffered, deterministic — not a race)', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    component.ngOnChanges();

    expect((component as unknown as { map: L.Map | null }).map)
      .withContext('sanity: the view/map must not exist yet at this point')
      .toBeNull();

    fixture.detectChanges(); // runs ngAfterViewInit, must replay the buffered input

    const marker = (component as unknown as { vehicleMarker: L.Marker | null }).vehicleMarker;
    expect(marker).withContext('the buffered coordinates must produce a marker').not.toBeNull();
    expect(marker?.getLatLng().lat).toBeCloseTo(13.36, 5);
    expect(marker?.getLatLng().lng).toBeCloseTo(100.98, 5);
  });

  it('U25: two successive coordinate changes move the SAME L.Marker instance via setLatLng, never a rebuilt marker', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    component.ngOnChanges();
    fixture.detectChanges();

    const markerBefore = (component as unknown as { vehicleMarker: L.Marker | null }).vehicleMarker;
    expect(markerBefore).not.toBeNull();

    component.lat = 13.5;
    component.lon = 101.1;
    component.ngOnChanges();

    const markerAfter = (component as unknown as { vehicleMarker: L.Marker | null }).vehicleMarker;
    expect(markerAfter).toBe(markerBefore as L.Marker); // identity — same instance, mutated in place
    expect(markerAfter?.getLatLng().lat).toBeCloseTo(13.5, 5);
    expect(markerAfter?.getLatLng().lng).toBeCloseTo(101.1, 5);
  });

  it('U26: ngOnDestroy calls map.remove() and nulls the internal reference', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    fixture.detectChanges();

    const map = (component as unknown as { map: L.Map }).map;
    const removeSpy = spyOn(map, 'remove').and.callThrough();

    component.ngOnDestroy();

    expect(removeSpy).toHaveBeenCalled();
    expect((component as unknown as { map: L.Map | null }).map).toBeNull();
  });

  describe('U27: marker count follows boarding-stop coordinate presence', () => {
    it('boardingStopLat/Lon null -> exactly ONE marker (the vehicle only)', () => {
      component.maptilerKey = 'test-key';
      component.lat = 13.36;
      component.lon = 100.98;
      component.boardingStopLat = null;
      component.boardingStopLon = null;
      component.ngOnChanges();
      fixture.detectChanges();

      const vehicle = fixture.nativeElement.querySelectorAll('.trip-track-marker');
      const boarding = fixture.nativeElement.querySelectorAll('.trip-track-boarding-marker');
      expect(vehicle.length).toBe(1);
      expect(boarding.length).toBe(0);
    });

    it('boardingStopLat/Lon both non-null -> exactly TWO markers total', () => {
      component.maptilerKey = 'test-key';
      component.lat = 13.36;
      component.lon = 100.98;
      component.boardingStopLat = 13.4;
      component.boardingStopLon = 101.0;
      component.ngOnChanges();
      fixture.detectChanges();

      const vehicle = fixture.nativeElement.querySelectorAll('.trip-track-marker');
      const boarding = fixture.nativeElement.querySelectorAll('.trip-track-boarding-marker');
      expect(vehicle.length).toBe(1);
      expect(boarding.length).toBe(1);
    });

    it('never renders a phantom marker at (0, 0) — omits the boarding marker instead', () => {
      component.maptilerKey = 'test-key';
      component.lat = 13.36;
      component.lon = 100.98;
      component.boardingStopLat = null;
      component.boardingStopLon = null;
      component.ngOnChanges();
      fixture.detectChanges();

      const boardingMarker = (component as unknown as { boardingMarker: L.Marker | null }).boardingMarker;
      expect(boardingMarker).toBeNull();
    });
  });

  it('U28: the rendered marker HTML contains NO --admin- custom-property reference (BR-24)', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    component.boardingStopLat = 13.4;
    component.boardingStopLon = 101.0;
    component.stale = false;
    component.ngOnChanges();
    fixture.detectChanges();

    const vehicleHtml = fixture.nativeElement.querySelector('.trip-track-marker')?.outerHTML ?? '';
    const boardingHtml = fixture.nativeElement.querySelector('.trip-track-boarding-marker')?.outerHTML ?? '';
    expect(vehicleHtml).not.toContain('--admin-');
    expect(boardingHtml).not.toContain('--admin-');

    // Also true on the STALE render — the copied-fleet-tokens bug specifically
    // shows up on the degraded marker, not just the default one.
    component.stale = true;
    component.ngOnChanges();
    fixture.detectChanges();
    const staleHtml = fixture.nativeElement.querySelector('.trip-track-marker')?.outerHTML ?? '';
    expect(staleHtml).not.toContain('--admin-');
  });

  it('U29: a STALE render is measurably different from a LIVE render at the SAME coordinates (className AND style)', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    component.stale = false;
    component.ngOnChanges();
    fixture.detectChanges();

    const liveDot = fixture.nativeElement.querySelector('.trip-track-marker-dot') as HTMLElement;
    const liveClassName = liveDot.className;
    const liveStyle = liveDot.getAttribute('style');

    component.stale = true;
    component.ngOnChanges();
    fixture.detectChanges();

    const staleDot = fixture.nativeElement.querySelector('.trip-track-marker-dot') as HTMLElement;
    expect(staleDot.className).not.toBe(liveClassName);
    expect(staleDot.getAttribute('style')).not.toBe(liveStyle);
  });

  it('U30: the STALE marker does NOT carry the live token, and DOES carry the stale one (both halves)', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    component.stale = true;
    component.ngOnChanges();
    fixture.detectChanges();

    const dot = fixture.nativeElement.querySelector('.trip-track-marker-dot') as HTMLElement;
    const style = dot.getAttribute('style') ?? '';

    // Negative half: must not merely be the live class/token with something
    // layered on top.
    expect(dot.classList.contains('is-stale')).toBeTrue();
    expect(style).not.toContain('--trip-track-marker-live-fill');
    // Positive half.
    expect(style).toContain('--trip-track-marker-stale-fill');

    const halo = fixture.nativeElement.querySelector('.trip-track-marker-halo') as HTMLElement;
    expect(halo.classList.contains('is-stale')).toBeTrue();
  });

  it('U31: flipping stale true -> false -> true across three ngOnChanges restyles the marker EVERY time, both directions', () => {
    component.maptilerKey = 'test-key';
    component.lat = 13.36;
    component.lon = 100.98;
    component.stale = true;
    component.ngOnChanges();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.trip-track-marker-dot') as HTMLElement).classList.contains('is-stale')).toBeTrue();

    component.stale = false;
    component.ngOnChanges();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.trip-track-marker-dot') as HTMLElement).classList.contains('is-stale')).toBeFalse();

    component.stale = true;
    component.ngOnChanges();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.trip-track-marker-dot') as HTMLElement).classList.contains('is-stale')).toBeTrue();
  });

  describe('empty-key regression (BR-23)', () => {
    it('never constructs L.map when maptilerKey is empty', () => {
      const mapSpy = spyOn(L, 'map').and.callThrough();
      component.maptilerKey = '';
      component.lat = 13.36;
      component.lon = 100.98;
      component.ngOnChanges();

      expect(() => fixture.detectChanges()).not.toThrow();
      expect(mapSpy).not.toHaveBeenCalled();
      expect(component.canShowMap).toBeFalse();
    });

    it('ngOnDestroy does not throw when no map was ever constructed', () => {
      component.maptilerKey = '';
      fixture.detectChanges();
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
