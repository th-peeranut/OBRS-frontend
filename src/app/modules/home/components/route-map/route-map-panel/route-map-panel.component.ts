import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { RouteMeta, RouteStop } from '../../../../../shared/interfaces/route-map.interface';

interface GoogleWindow {
  google?: {
    maps?: unknown;
  };
}

interface MarkerEntry {
  slug: string;
  options: google.maps.MarkerOptions;
}

@Component({
  selector: 'app-route-map-panel',
  templateUrl: './route-map-panel.component.html',
  styleUrl: './route-map-panel.component.scss',
})
export class RouteMapPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() pickupStops: RouteStop[] = [];
  @Input() dropoffStops: RouteStop[] = [];
  @Input() selectedPickupSlug: string | null = null;
  @Input() selectedDropoffSlug: string | null = null;
  @Input() mapsApiKey = '';
  @Input() routeMeta: RouteMeta | null = null;

  @ViewChild('mapContainer') mapContainer!: ElementRef;

  mapsLoaded = false;
  mapsError = false;

  // Precomputed stable fields — only reassigned when the underlying inputs change.
  // Keeping them as fields (not getters) prevents @angular/google-maps from seeing
  // a new object reference on every change-detection pass, which was the root cause
  // of the direction-toggle CD storm (GitHub issue #73).
  mapCenter: google.maps.LatLngLiteral = { lat: 13.7563, lng: 100.5018 };

  mapOptions: google.maps.MapOptions = {
    zoom: 10,
    center: { lat: 13.7563, lng: 100.5018 },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  };

  polylinePath: google.maps.LatLngLiteral[] = [];

  // Constant — never changes, so safe as a readonly field.
  readonly polylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#3BB0E7',
    strokeWeight: 4,
    strokeOpacity: 0.85,
  };

  // Precomputed marker arrays for *ngFor — avoids per-marker method calls in the template.
  pickupMarkers: MarkerEntry[] = [];
  dropoffMarkers: MarkerEntry[] = [];

  get showMap(): boolean {
    return this.mapsLoaded && !!this.mapsApiKey && this.hasCoordinates;
  }

  get hasCoordinates(): boolean {
    return (
      this.pickupStops.some((s) => s.latitude !== null && s.longitude !== null) ||
      this.dropoffStops.some((s) => s.latitude !== null && s.longitude !== null)
    );
  }

  trackBySlug(_index: number, item: MarkerEntry): string {
    return item.slug;
  }

  stopHasCoords(stop: RouteStop): boolean {
    return stop.latitude !== null && stop.longitude !== null;
  }

  ngOnInit(): void {
    if (!this.mapsApiKey) {
      return;
    }

    const win = window as unknown as GoogleWindow;
    if (win.google?.maps) {
      this.mapsLoaded = true;
      this.recomputeMarkers();
      return;
    }

    const existing = document.querySelector('script[data-maps-api]');
    if (existing) {
      existing.addEventListener('load', () => {
        this.mapsLoaded = true;
        this.recomputeMarkers();
      });
      return;
    }

    const script = document.createElement('script');
    script.setAttribute('data-maps-api', 'true');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${this.mapsApiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      this.mapsLoaded = true;
      this.recomputeMarkers();
    };
    script.onerror = () => {
      this.mapsError = true;
    };
    document.head.appendChild(script);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const stopsChanged = 'pickupStops' in changes || 'dropoffStops' in changes;
    const pickupSelectionChanged = 'selectedPickupSlug' in changes;
    const dropoffSelectionChanged = 'selectedDropoffSlug' in changes;

    if (stopsChanged) {
      // Stop changes affect map center, polyline path, AND all markers.
      this.recomputeMapData();
      this.recomputeMarkers();
    } else {
      // Selection-only changes: update only the affected marker array.
      // mapOptions/mapCenter must NOT be touched — unnecessary center re-apply would
      // re-trigger the same CD storm that this fix is designed to prevent.
      if (pickupSelectionChanged) {
        this.recomputePickupMarkers();
      }
      if (dropoffSelectionChanged) {
        this.recomputeDropoffMarkers();
      }
    }
  }

  ngOnDestroy(): void {}

  // ---------------------------------------------------------------------------
  // Private recompute methods
  // ---------------------------------------------------------------------------

  private recomputeMapData(): void {
    const stopsWithCoords = [
      ...this.pickupStops,
      ...this.dropoffStops,
    ].filter((s) => s.latitude !== null && s.longitude !== null);

    const center: google.maps.LatLngLiteral =
      stopsWithCoords.length === 0
        ? { lat: 13.7563, lng: 100.5018 } // Bangkok default
        : {
            lat:
              stopsWithCoords.reduce((sum, s) => sum + (s.latitude ?? 0), 0) /
              stopsWithCoords.length,
            lng:
              stopsWithCoords.reduce((sum, s) => sum + (s.longitude ?? 0), 0) /
              stopsWithCoords.length,
          };

    this.mapCenter = center;
    this.mapOptions = {
      zoom: 10,
      center,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    };

    const pickupCoords = this.pickupStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }));

    const dropoffCoords = this.dropoffStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }));

    this.polylinePath = [...pickupCoords, ...dropoffCoords];
  }

  private recomputeMarkers(): void {
    this.recomputePickupMarkers();
    this.recomputeDropoffMarkers();
  }

  private recomputePickupMarkers(): void {
    const win = window as unknown as GoogleWindow;
    if (!win.google?.maps) {
      // Google Maps JS not loaded yet; markers will be built once the script
      // fires its onload handler (which also calls recomputeMarkers).
      return;
    }
    this.pickupMarkers = this.pickupStops.map((stop) => ({
      slug: stop.slug,
      options: this.buildMarkerOptions(stop, this.selectedPickupSlug, '#3BB0E7'),
    }));
  }

  private recomputeDropoffMarkers(): void {
    const win = window as unknown as GoogleWindow;
    if (!win.google?.maps) {
      return;
    }
    this.dropoffMarkers = this.dropoffStops.map((stop) => ({
      slug: stop.slug,
      options: this.buildMarkerOptions(stop, this.selectedDropoffSlug, '#DC3545'),
    }));
  }

  private buildMarkerOptions(
    stop: RouteStop,
    selectedSlug: string | null,
    color: string
  ): google.maps.MarkerOptions {
    const isSelected = stop.slug === selectedSlug;
    return {
      position: {
        lat: stop.latitude as number,
        lng: stop.longitude as number,
      },
      icon: {
        url: this.buildSvgMarkerUrl(stop.order, color, isSelected),
        scaledSize: new google.maps.Size(
          isSelected ? 44 : 36,
          isSelected ? 44 : 36
        ),
        anchor: new google.maps.Point(
          isSelected ? 22 : 18,
          isSelected ? 44 : 36
        ),
      },
      title: stop.name,
      zIndex: isSelected ? 100 : stop.order,
    };
  }

  private buildSvgMarkerUrl(
    order: number,
    color: string,
    selected: boolean
  ): string {
    const size = selected ? 44 : 36;
    const ring = selected
      ? `<circle cx="18" cy="18" r="17" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 2" opacity="0.7"/>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36">
      ${ring}
      <circle cx="18" cy="18" r="${selected ? 14 : 12}" fill="${color}"/>
      <text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="${selected ? 13 : 11}" font-weight="bold" fill="#fff">${order}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }
}
