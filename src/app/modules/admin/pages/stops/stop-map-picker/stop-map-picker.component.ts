import {
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import {
  loadGoogleMapsApi,
  onGoogleMapsAuthFailure,
} from '../../../../../shared/lib/google-maps-loader';

/**
 * OBRS-1030: last-resort fallback center — no coordinates on the stop being edited AND no
 * `fallbackCenter` (a province centroid) supplied by the parent. Same Bangkok-area constant
 * `route-map-panel`/`route-map-home` already default to, so this map never opens at 0,0.
 */
const THAILAND_DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 13.7563, lng: 100.5018 };

/**
 * Pin fill color. A literal, not `$primary-blue` from `variables.scss`, for the same reason
 * `route-map-panel.component.ts`'s `MAP_PICKUP_COLOR` is one: the pin is an SVG data-URL built
 * in TypeScript, which cannot read an SCSS variable. Kept equal to `$primary-blue` (#0772a2).
 */
const PIN_COLOR = '#0772A2';

/**
 * OBRS-1030: presentational pin-drop picker for a stop's coordinates. Pure `@Input`/`@Output`,
 * same shape as `StopFormModalComponent` — no store, no HTTP, no `AdminApiService`. The two
 * number inputs on the form stay the source of truth; this component only offers a second way
 * to set them and mirrors whatever they already hold.
 */
@Component({
  selector: 'app-stop-map-picker',
  templateUrl: './stop-map-picker.component.html',
  styleUrl: './stop-map-picker.component.scss',
  standalone: false,
})
export class StopMapPickerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() apiKey = '';
  @Input() mapId = '';
  @Input() fallbackCenter: { lat: number; lng: number } | null = null;
  @Input() disabled = false;

  @Output() coordinatesPicked = new EventEmitter<{ latitude: number; longitude: number }>();

  @ViewChild(GoogleMap) private map?: GoogleMap;

  mapsLoaded = false;
  mapsError = false;

  // Real values are computed in ngOnInit, once every @Input (set after the constructor runs,
  // before ngOnInit) has settled — these are placeholders only, never what the user sees.
  markerPosition: google.maps.LatLngLiteral = THAILAND_DEFAULT_CENTER;
  mapOptions: google.maps.MapOptions = this.buildMapOptions(THAILAND_DEFAULT_CENTER);
  markerOptions: google.maps.MarkerOptions = this.buildMarkerOptions();

  /** Unsubscribes this instance from the Maps auth-failure signal; null until `ngOnInit`
   *  actually subscribes (never, if there is no `apiKey` to load). */
  private authFailureUnsubscribe: (() => void) | null = null;

  constructor(private readonly zone: NgZone) {}

  /** No key => never fetch the script; a blank key sent to Google fails as one anyway. */
  get showMap(): boolean {
    return this.mapsLoaded && !!this.apiKey && !this.mapsError;
  }

  ngOnInit(): void {
    const center = this.resolveCenter();
    this.markerPosition = center;
    this.mapOptions = this.buildMapOptions(center);
    this.markerOptions = this.buildMarkerOptions();

    if (!this.apiKey) {
      return;
    }
    // OBRS-1030: an expired/revoked/referrer-mismatched/billing-disabled key loads this
    // SCRIPT successfully (the .then() below still fires) and only fails later, when Maps
    // tries to actually construct a map -- Google reports that failure only through the
    // `gm_authFailure` global, never through this promise. Without this subscription
    // `mapsError` would never flip and `showMap` would stay true over Google's own error box.
    this.authFailureUnsubscribe = onGoogleMapsAuthFailure(() => {
      // Fired from Google's externally loaded script, not from inside an Angular-zone-patched
      // API (unlike the script's own onload/callback) -- explicit zone.run so the flip is
      // actually change-detected, same reasoning as onUseMyLocation()'s geolocation callbacks
      // in route-map-home.component.ts (OBRS-1214 moved it there from route-map-panel).
      this.zone.run(() => {
        this.mapsError = true;
      });
    });
    loadGoogleMapsApi(this.apiKey)
      .then(() => {
        this.mapsLoaded = true;
      })
      .catch(() => {
        this.mapsError = true;
      });
  }

  ngOnDestroy(): void {
    this.authFailureUnsubscribe?.();
  }

  /**
   * AC2's return leg: the parent's own `latitude`/`longitude` inputs changing (an owner typed
   * into the number boxes) moves the marker and re-centres the camera. Deliberately does NOT
   * emit `coordinatesPicked` — that would feed straight back into the inputs that triggered
   * this and loop forever. The FIRST change is skipped: ngOnInit already paints the initial
   * position from the same `resolveCenter()`, and re-running it here would fire before
   * `this.map` exists to pan.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const latChange = changes['latitude'];
    const lngChange = changes['longitude'];
    if (!latChange && !lngChange) {
      return;
    }
    if ((latChange?.firstChange ?? true) && (lngChange?.firstChange ?? true)) {
      return;
    }
    const center = this.resolveCenter();
    this.markerPosition = center;
    this.map?.googleMap?.panTo(center);
  }

  onMapClick(event: google.maps.MapMouseEvent | google.maps.IconMouseEvent): void {
    if (this.disabled || !event.latLng) {
      return;
    }
    this.emitPicked(event.latLng.lat(), event.latLng.lng());
  }

  onMarkerDragEnd(event: google.maps.MapMouseEvent): void {
    if (this.disabled || !event.latLng) {
      return;
    }
    this.emitPicked(event.latLng.lat(), event.latLng.lng());
  }

  private emitPicked(lat: number, lng: number): void {
    const latitude = round6(lat);
    const longitude = round6(lng);
    this.markerPosition = { lat: latitude, lng: longitude };
    this.coordinatesPicked.emit({ latitude, longitude });
  }

  private resolveCenter(): google.maps.LatLngLiteral {
    if (this.latitude !== null && this.longitude !== null) {
      return { lat: this.latitude, lng: this.longitude };
    }
    return this.fallbackCenter ?? THAILAND_DEFAULT_CENTER;
  }

  private buildMapOptions(center: google.maps.LatLngLiteral): google.maps.MapOptions {
    return {
      zoom: 14,
      center,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      cameraControl: false,
      zoomControl: true,
      ...(this.mapId ? { mapId: this.mapId } : {}),
    };
  }

  /**
   * OBRS-1030: `draggable` lives here (MarkerOptions), not on a template `[draggable]`
   * binding, so it is recomputed the same way `mapOptions` is — from `this.disabled` once
   * that @Input has actually settled (field initializers run before Angular sets inputs).
   */
  private buildMarkerOptions(): google.maps.MarkerOptions {
    return {
      draggable: !this.disabled,
      icon: this.buildPinIconUrl(),
    };
  }

  private buildPinIconUrl(): string {
    const size = 36;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="12" fill="${PIN_COLOR}" stroke="#ffffff" stroke-width="3"/>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }
}

/** Rounds to 6 decimal places (~11cm of precision), per the card's AC2. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
