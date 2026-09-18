import { NgZone, NO_ERRORS_SCHEMA, SimpleChange, SimpleChanges } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { StopMapPickerComponent } from './stop-map-picker.component';
import { resetGoogleMapsLoadForTests } from '../../../../../shared/lib/google-maps-loader';

/** NgZone stub that runs callbacks synchronously, same shape as
 *  route-map-panel.component.spec.ts's own zoneStub. */
const zoneStub = { run: <T>(fn: () => T): T => fn() } as unknown as NgZone;

/** Build a minimal SimpleChange, same helper shape as route-map-panel.component.spec.ts. */
function sc<T>(currentValue: T, previousValue?: T): SimpleChange {
  const firstChange = previousValue === undefined;
  return { currentValue, previousValue, firstChange, isFirstChange: () => firstChange };
}

function changes(entries: Record<string, SimpleChange>): SimpleChanges {
  return entries;
}

/** Installs `window.google.maps` so `loadGoogleMapsApi` resolves WITHOUT injecting a
 *  `<script>` — same shape as route-map-panel.component.spec.ts's own mock. */
function installGoogleMock(): void {
  (window as unknown as Record<string, unknown>)['google'] = { maps: {} };
}

function removeGoogleMock(): void {
  delete (window as unknown as Record<string, unknown>)['google'];
}

function fakeLatLng(lat: number, lng: number): google.maps.LatLng {
  return { lat: () => lat, lng: () => lng } as unknown as google.maps.LatLng;
}

function mapMouseEvent(lat: number, lng: number): google.maps.MapMouseEvent {
  return { latLng: fakeLatLng(lat, lng) } as unknown as google.maps.MapMouseEvent;
}

describe('StopMapPickerComponent (OBRS-1030)', () => {
  beforeEach(() => {
    // The Maps loader is a MODULE-LEVEL singleton shared with route-map-panel, so a promise
    // any earlier test resolved would otherwise leak into these tests as a false "already
    // loaded" — resetGoogleMapsLoadForTests exists for exactly this.
    resetGoogleMapsLoadForTests();
    removeGoogleMock();
    document.querySelectorAll('script[data-maps-api]').forEach((el) => el.remove());
  });

  afterEach(() => {
    removeGoogleMock();
    document.querySelectorAll('script[data-maps-api]').forEach((el) => el.remove());
  });

  it('should create', () => {
    const component = new StopMapPickerComponent(zoneStub);
    expect(component).toBeTruthy();
  });

  describe('AC5: no/blank API key degrades instead of going blank', () => {
    it('never injects the Maps script and never shows the map when apiKey is blank', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.apiKey = '';
      component.ngOnInit();

      expect(document.head.querySelector('script[data-maps-api]')).toBeNull();
      expect(component.showMap).toBeFalse();
    });
  });

  describe('AC3: no coordinates => a useful center, never 0,0', () => {
    it('opens on the supplied fallbackCenter (a province centroid) when lat/lng are null', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.latitude = null;
      component.longitude = null;
      component.fallbackCenter = { lat: 12.34, lng: 56.78 };
      component.apiKey = '';
      component.ngOnInit();

      expect(component.markerPosition).toEqual({ lat: 12.34, lng: 56.78 });
    });

    it('falls back to the fixed Thailand-centre constant when fallbackCenter is also null', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.latitude = null;
      component.longitude = null;
      component.fallbackCenter = null;
      component.apiKey = '';
      component.ngOnInit();

      expect(component.markerPosition).toEqual({ lat: 13.7563, lng: 100.5018 });
      expect(component.markerPosition).not.toEqual({ lat: 0, lng: 0 });
    });
  });

  describe('AC2: pin drop / drag / click, both directions', () => {
    it('emits coordinatesPicked (rounded to 6dp) when the marker is dragged', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.latitude = 13.5;
      component.longitude = 101.5;
      component.ngOnInit();

      let picked: { latitude: number; longitude: number } | undefined;
      component.coordinatesPicked.subscribe((v) => (picked = v));

      component.onMarkerDragEnd(mapMouseEvent(13.1234567, 101.9876543));

      expect(picked?.latitude).toBe(13.123457);
      expect(picked?.longitude).toBe(101.987654);
      expect(component.markerPosition).toEqual({ lat: 13.123457, lng: 101.987654 });
    });

    it('emits coordinatesPicked when the map itself is clicked', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.latitude = 13.5;
      component.longitude = 101.5;
      component.ngOnInit();

      let picked: { latitude: number; longitude: number } | undefined;
      component.coordinatesPicked.subscribe((v) => (picked = v));

      component.onMapClick(mapMouseEvent(14, 102));

      expect(picked?.latitude).toBe(14);
      expect(picked?.longitude).toBe(102);
    });

    it('does not emit from either a click or a drag while disabled', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.disabled = true;
      component.ngOnInit();

      let pickedCount = 0;
      component.coordinatesPicked.subscribe(() => pickedCount++);

      component.onMapClick(mapMouseEvent(14, 102));
      component.onMarkerDragEnd(mapMouseEvent(14, 102));

      expect(pickedCount).toBe(0);
    });

    it('moves the marker when the parent-owned latitude/longitude inputs change, without emitting back (no loop)', () => {
      const component = new StopMapPickerComponent(zoneStub);
      component.latitude = 13.5;
      component.longitude = 101.5;
      // First change: mirrors Angular calling ngOnChanges before ngOnInit on initial bind.
      component.ngOnChanges(changes({ latitude: sc(13.5), longitude: sc(101.5) }));
      component.ngOnInit();

      let pickedCount = 0;
      component.coordinatesPicked.subscribe(() => pickedCount++);

      // The owner typed new numbers directly into the lat/lng boxes.
      component.latitude = 15;
      component.longitude = 103;
      component.ngOnChanges(changes({ latitude: sc(15, 13.5), longitude: sc(103, 101.5) }));

      expect(component.markerPosition).toEqual({ lat: 15, lng: 103 });
      expect(pickedCount).toBe(0);
    });
  });

  describe('successful load', () => {
    it('shows the map once the script resolves with an API key set', async () => {
      installGoogleMock();
      const component = new StopMapPickerComponent(zoneStub);
      component.apiKey = 'test-key';
      component.ngOnInit();

      await Promise.resolve();
      await Promise.resolve();

      expect(component.showMap).toBeTrue();
    });
  });
});

// ---------------------------------------------------------------------------
// AC5, the case found by an actual run against a real (referrer-mismatched) key:
// the Maps JS SCRIPT loads fine, and only fails later when Maps tries to construct a
// map -- reported solely through the `gm_authFailure` global, never through the loader's
// own promise. A TestBed fixture is used here (not direct instantiation, unlike the specs
// above) specifically to assert the rendered DOM, not just component state -- the bug this
// covers is Google's OWN grey error box staying on screen instead of our degrade message.
// ---------------------------------------------------------------------------
describe('StopMapPickerComponent - auth failure after a successful script load (OBRS-1030, AC5)', () => {
  let fixture: ComponentFixture<StopMapPickerComponent>;
  let component: StopMapPickerComponent;

  beforeEach(async () => {
    resetGoogleMapsLoadForTests();
    installGoogleMock();

    await TestBed.configureTestingModule({
      declarations: [StopMapPickerComponent],
      imports: [TranslateModule.forRoot()],
      // google-map / map-marker come from GoogleMapsModule, not imported here -
      // the schema lets them render as opaque unknown elements, same as
      // stop-form-modal.component.spec.ts does for THIS component's own unknown child.
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ADMIN: { STOPS: { MAP_UNAVAILABLE: 'Map unavailable - use the fields above' } },
    });
    translate.use('en');

    fixture = TestBed.createComponent(StopMapPickerComponent);
    component = fixture.componentInstance;
    component.apiKey = 'test-key';
    fixture.detectChanges(); // runs ngOnInit, starts loadGoogleMapsApi
    await fixture.whenStable(); // the (already-resolved, since installGoogleMock) promise settles
    fixture.detectChanges();
  });

  afterEach(() => {
    removeGoogleMock();
    document.querySelectorAll('script[data-maps-api]').forEach((el) => el.remove());
  });

  it('degrades to the unavailable message instead of leaving Google\'s own error box on screen', () => {
    expect(component.showMap).toBeTrue(); // sanity: the map WAS showing before the failure

    (window as unknown as { gm_authFailure: () => void }).gm_authFailure();
    fixture.detectChanges();

    expect(component.showMap).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Map unavailable - use the fields above');
  });
});
