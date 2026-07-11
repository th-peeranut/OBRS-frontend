import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  SegmentRow,
  StopPoint,
  VehicleTypeOption,
  formatFare as formatFareValue,
  normalizeVehicleTypeKey,
  toVehicleTypeOptions,
} from '../routes.mappers';

// Route detail panel (stops timeline + segments table + vehicle-type filter +
// segment search + pagination), extracted from RoutesPageComponent (OBRS-213).
// Owns all segment view-state so it persists across route switches exactly
// like it did as page-level fields (see the always-mounted host note in the
// parent template — this component's content is gated by `hasRoute`, not a
// host-level *ngIf, so the instance itself is never destroyed/recreated).
@Component({
  selector: 'app-route-detail-panel',
  templateUrl: './route-detail-panel.component.html',
  styleUrl: './route-detail-panel.component.scss',
})
export class RouteDetailPanelComponent implements OnChanges {
  @Input() hasRoute = false;
  @Input() stops: StopPoint[] = [];
  @Input() allSegments: SegmentRow[] = [];
  @Input() isDetailLoading = false;
  @Output() editSegment = new EventEmitter<SegmentRow>();

  protected vehicleTypeOptions: VehicleTypeOption[] = [];
  protected selectedVehicleTypeSlug = '';
  protected segmentSearchTerm = '';

  protected readonly pageSize = 5;
  protected currentPage = 1;

  // Mirrors the per-load reset block from the original page's
  // `loadRouteStructureBySlug` (~lines 451-471): re-derive the vehicle-type
  // options and re-default the selection when the segment set changes, reset
  // pagination to page 1, but never touch `segmentSearchTerm` — the original
  // never reset the search term on load, so it must persist.
  //
  // Parity note: the parent clears `allSegments` to a new `[]` synchronously
  // *before* the fetch (to drive the loading state), then reassigns it once
  // the fetch settles — two distinct reference changes, so this fires twice
  // per load. The original ran this whole block exactly once, after the
  // fetch settled, using whatever `selectedVehicleTypeSlug` was already
  // selected beforehand (so a slug shared between the previous and next
  // route stays selected). Gating the default/reset half on `isDetailLoading`
  // being false reproduces that: the transient clear-to-[] pass (loading has
  // just been set true) only refreshes `vehicleTypeOptions` for display and
  // leaves `selectedVehicleTypeSlug` alone, exactly like the original's
  // synchronous top-of-function clear did.
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['allSegments']) {
      return;
    }

    this.vehicleTypeOptions = toVehicleTypeOptions(this.allSegments);

    if (this.isDetailLoading) {
      return;
    }

    if (
      this.vehicleTypeOptions.length > 0 &&
      !this.vehicleTypeOptions.some(
        (option) =>
          normalizeVehicleTypeKey(option.slug) ===
          normalizeVehicleTypeKey(this.selectedVehicleTypeSlug)
      )
    ) {
      this.selectedVehicleTypeSlug = this.vehicleTypeOptions[0].slug;
    }

    if (this.vehicleTypeOptions.length === 0) {
      this.selectedVehicleTypeSlug = '';
    }

    this.currentPage = 1;
  }

  protected get segments(): SegmentRow[] {
    const selectedVehicleTypeSlug = normalizeVehicleTypeKey(this.selectedVehicleTypeSlug);

    if (!selectedVehicleTypeSlug) {
      return this.allSegments;
    }

    return this.allSegments.filter(
      (segment) => normalizeVehicleTypeKey(segment.vehicleTypeSlug) === selectedVehicleTypeSlug
    );
  }

  protected get filteredSegments(): SegmentRow[] {
    const keyword = this.segmentSearchTerm.trim().toLowerCase();
    if (!keyword) {
      return this.segments;
    }

    return this.segments.filter(
      (segment) =>
        segment.origin.toLowerCase().includes(keyword) ||
        segment.destination.toLowerCase().includes(keyword)
    );
  }

  protected get totalSegments(): number {
    return this.filteredSegments.length;
  }

  protected get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalSegments / this.pageSize));
  }

  protected get pagedSegments(): SegmentRow[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredSegments.slice(startIndex, startIndex + this.pageSize);
  }

  protected get canPreviousPage(): boolean {
    return this.currentPage > 1;
  }

  protected get canNextPage(): boolean {
    return this.currentPage < this.totalPages;
  }

  protected get showingFrom(): number {
    if (this.totalSegments === 0) {
      return 0;
    }

    return (this.currentPage - 1) * this.pageSize + 1;
  }

  protected get showingTo(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalSegments);
  }

  protected trackByStopSlug(_index: number, stop: StopPoint): string {
    return stop.slug;
  }

  protected trackBySegmentId(_index: number, segment: SegmentRow): number {
    return segment.id;
  }

  protected onVehicleTypeChange(value: string): void {
    const normalizedValue = normalizeVehicleTypeKey(value);
    const matchedOption = this.vehicleTypeOptions.find(
      (option) =>
        normalizeVehicleTypeKey(option.slug) === normalizedValue ||
        normalizeVehicleTypeKey(option.name) === normalizedValue
    );

    this.selectedVehicleTypeSlug = matchedOption?.slug ?? String(value ?? '').trim();
    this.currentPage = 1;
  }

  protected onSegmentSearchChange(): void {
    this.currentPage = 1;
  }

  protected goToPreviousPage(): void {
    if (!this.canPreviousPage) {
      return;
    }

    this.currentPage -= 1;
  }

  protected goToNextPage(): void {
    if (!this.canNextPage) {
      return;
    }

    this.currentPage += 1;
  }

  protected formatFare(fare: number): string {
    return formatFareValue(fare);
  }
}
