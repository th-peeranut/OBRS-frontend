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

  get showMap(): boolean {
    return this.mapsLoaded && !!this.mapsApiKey && this.hasCoordinates;
  }

  get hasCoordinates(): boolean {
    return (
      this.pickupStops.some((s) => s.latitude !== null && s.longitude !== null) ||
      this.dropoffStops.some((s) => s.latitude !== null && s.longitude !== null)
    );
  }

  get mapCenter(): google.maps.LatLngLiteral {
    const stopsWithCoords = [
      ...this.pickupStops,
      ...this.dropoffStops,
    ].filter((s) => s.latitude !== null && s.longitude !== null);

    if (stopsWithCoords.length === 0) {
      return { lat: 13.7563, lng: 100.5018 }; // Bangkok default
    }

    const lat =
      stopsWithCoords.reduce((sum, s) => sum + (s.latitude ?? 0), 0) /
      stopsWithCoords.length;
    const lng =
      stopsWithCoords.reduce((sum, s) => sum + (s.longitude ?? 0), 0) /
      stopsWithCoords.length;
    return { lat, lng };
  }

  get mapOptions(): google.maps.MapOptions {
    return {
      zoom: 10,
      center: this.mapCenter,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    };
  }

  get polylinePath(): google.maps.LatLngLiteral[] {
    const pickupCoords = this.pickupStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }));

    const dropoffCoords = this.dropoffStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }));

    return [...pickupCoords, ...dropoffCoords];
  }

  get polylineOptions(): google.maps.PolylineOptions {
    return {
      strokeColor: '#3BB0E7',
      strokeWeight: 4,
      strokeOpacity: 0.85,
    };
  }

  getPickupMarkerOptions(stop: RouteStop): google.maps.MarkerOptions {
    const isSelected = stop.slug === this.selectedPickupSlug;
    return {
      position: {
        lat: stop.latitude as number,
        lng: stop.longitude as number,
      },
      icon: {
        url: this.buildSvgMarkerUrl(stop.order, '#3BB0E7', isSelected),
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

  getDropoffMarkerOptions(stop: RouteStop): google.maps.MarkerOptions {
    const isSelected = stop.slug === this.selectedDropoffSlug;
    return {
      position: {
        lat: stop.latitude as number,
        lng: stop.longitude as number,
      },
      icon: {
        url: this.buildSvgMarkerUrl(stop.order, '#DC3545', isSelected),
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
      return;
    }

    const existing = document.querySelector('script[data-maps-api]');
    if (existing) {
      existing.addEventListener('load', () => {
        this.mapsLoaded = true;
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
    };
    script.onerror = () => {
      this.mapsError = true;
    };
    document.head.appendChild(script);
  }

  ngOnChanges(_changes: SimpleChanges): void {}

  ngOnDestroy(): void {}
}
