import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRouteDto,
  AdminRouteStopDto,
  AdminSegmentDto,
  AdminSegmentReqDto,
  AdminTranslationDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

interface StopPoint {
  name: string;
  distance: string;
  duration: string;
  label?: string;
}

interface SegmentRow {
  id: number;
  origin: string;
  destination: string;
  fare: number;
  duration: string;
  fromStopSlug: string;
  toStopSlug: string;
  vehicleTypeSlug: string;
  vehicleTypeName: string;
}

interface VehicleTypeOption {
  slug: string;
  name: string;
}

@Component({
  selector: 'app-routes-page',
  templateUrl: './routes-page.component.html',
  styleUrl: './routes-page.component.scss',
})
export class RoutesPageComponent implements OnInit {
  protected routeName = 'Route';
  protected selectedRouteSlug = '';

  protected stops: StopPoint[] = [];
  protected allSegments: SegmentRow[] = [];
  protected vehicleTypeOptions: VehicleTypeOption[] = [];
  protected selectedVehicleTypeSlug = '';
  protected searchTerm = '';

  protected readonly pageSize = 5;
  protected currentPage = 1;

  protected isLoading = false;
  protected errorMessage = '';

  protected isEditModalOpen = false;
  protected isSavingEdit = false;
  protected selectedSegment: SegmentRow | null = null;
  protected readonly editSegmentForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.editSegmentForm = this.formBuilder.group({
      fare: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d+(\.\d{1,2})?$/),
          Validators.min(0.01),
        ],
      ],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadRouteDetails();
  }

  protected get segments(): SegmentRow[] {
    if (!this.selectedVehicleTypeSlug) {
      return this.allSegments;
    }

    return this.allSegments.filter(
      (segment) => segment.vehicleTypeSlug === this.selectedVehicleTypeSlug
    );
  }

  protected get filteredSegments(): SegmentRow[] {
    const keyword = this.searchTerm.trim().toLowerCase();
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

  protected isFieldInvalid(fieldName: string): boolean {
    const control = this.editSegmentForm.get(fieldName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected onSearchChange(): void {
    this.currentPage = 1;
  }

  protected onVehicleTypeChange(slug: string): void {
    this.selectedVehicleTypeSlug = slug;
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

  protected openEditModal(segment: SegmentRow): void {
    this.selectedSegment = segment;
    this.editSegmentForm.reset({
      fare: segment.fare.toFixed(2),
    });
    this.isEditModalOpen = true;
  }

  protected closeEditModal(): void {
    if (this.isSavingEdit) {
      return;
    }

    this.isEditModalOpen = false;
    this.selectedSegment = null;
    this.editSegmentForm.reset();
  }

  protected async submitSegmentEdit(): Promise<void> {
    if (!this.selectedSegment || !this.selectedRouteSlug) {
      return;
    }

    if (this.editSegmentForm.invalid) {
      this.editSegmentForm.markAllAsTouched();
      return;
    }

    const newFare = Number(this.editSegmentForm.value['fare'] ?? 0);
    const payload = this.toSegmentUpdatePayload(this.selectedSegment, newFare);
    this.isSavingEdit = true;
    let isUpdated = false;

    try {
      await firstValueFrom(this.adminApiService.updateSegments(payload));
      this.applyPayloadChanges(payload);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      isUpdated = true;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
    } finally {
      this.isSavingEdit = false;
      if (isUpdated) {
        this.closeEditModal();
      }
    }
  }

  protected formatFare(fare: number): string {
    return fare.toFixed(2);
  }

  private async loadRouteDetails(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const routeResponse = await firstValueFrom(this.adminApiService.getRoutes());
      const routes = routeResponse?.data ?? [];
      if (routes.length === 0) {
        this.errorMessage = 'No routes found from backend.';
        return;
      }

      const selectedRoute = routes[0];
      this.selectedRouteSlug = selectedRoute.slug;
      this.routeName =
        this.getTranslationLabel(selectedRoute.translations, 'en') ?? selectedRoute.slug;

      await this.loadRouteStructureBySlug(selectedRoute);
    } catch {
      this.errorMessage = 'Unable to load route data from backend.';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadRouteStructureBySlug(route: AdminRouteDto): Promise<void> {
    const [routeStopsResult, segmentsResult] = await Promise.allSettled([
      firstValueFrom(this.adminApiService.getRouteStops(route.slug)),
      firstValueFrom(this.adminApiService.getSegments(route.slug)),
    ]);

    if (routeStopsResult.status === 'fulfilled') {
      this.stops = this.toStopPoints(routeStopsResult.value.data);
    }

    if (segmentsResult.status === 'fulfilled') {
      this.allSegments = this.toSegments(segmentsResult.value.data);
      this.vehicleTypeOptions = this.toVehicleTypeOptions(this.allSegments);

      if (
        this.vehicleTypeOptions.length > 0 &&
        !this.vehicleTypeOptions.some(
          (option) => option.slug === this.selectedVehicleTypeSlug
        )
      ) {
        this.selectedVehicleTypeSlug = this.vehicleTypeOptions[0].slug;
      }

      this.currentPage = 1;
    }
  }

  private toStopPoints(routeStops: AdminRouteStopDto | undefined): StopPoint[] {
    const stops = routeStops?.stops ?? [];
    if (stops.length === 0) {
      return [];
    }

    const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);

    return sortedStops.map((stop, index) => ({
      name:
        this.getTranslationLabel(stop.stop?.translations, 'en') ??
        stop.stop?.slug ??
        '-',
      distance: `${stop.distanceKmFromOrigin ?? 0} km`,
      duration: `${stop.offsetMinutesFromOrigin ?? 0} mins`,
      label:
        index === 0 ? 'Origin' : index === sortedStops.length - 1 ? 'Terminal' : undefined,
    }));
  }

  private toSegments(segmentResponse: AdminSegmentDto | undefined): SegmentRow[] {
    const stopPairs = segmentResponse?.stopPairs ?? [];
    if (stopPairs.length === 0) {
      return [];
    }

    return stopPairs.map((pair, index) => {
      const parsedFare = Number(pair.fare ?? 0);

      return {
        id: pair.segmentId ?? index + 1,
        origin: pair.fromStop?.name ?? pair.fromStop?.slug ?? '-',
        destination: pair.toStop?.name ?? pair.toStop?.slug ?? '-',
        fare: Number.isFinite(parsedFare) ? parsedFare : 0,
        duration: '-',
        fromStopSlug: pair.fromStop?.slug ?? '',
        toStopSlug: pair.toStop?.slug ?? '',
        vehicleTypeSlug: pair.vehicleType?.slug ?? '',
        vehicleTypeName: pair.vehicleType?.name ?? pair.vehicleType?.slug ?? '-',
      };
    });
  }

  private toVehicleTypeOptions(segments: SegmentRow[]): VehicleTypeOption[] {
    const options = new Map<string, string>();

    for (const segment of segments) {
      if (!segment.vehicleTypeSlug) {
        continue;
      }

      if (!options.has(segment.vehicleTypeSlug)) {
        options.set(segment.vehicleTypeSlug, segment.vehicleTypeName);
      }
    }

    return [...options.entries()].map(([slug, name]) => ({ slug, name }));
  }

  private toSegmentUpdatePayload(
    selectedSegment: SegmentRow,
    editedFare: number
  ): AdminSegmentReqDto {
    const segmentsOfVehicleType = this.allSegments.filter(
      (segment) => segment.vehicleTypeSlug === selectedSegment.vehicleTypeSlug
    );

    return {
      route: this.selectedRouteSlug,
      vehicleType: selectedSegment.vehicleTypeSlug,
      stopPairs: segmentsOfVehicleType.map((segment) => ({
        fromStop: segment.fromStopSlug,
        toStop: segment.toStopSlug,
        fare: this.normalizeFareForSave(
          segment.id === selectedSegment.id ? editedFare : segment.fare
        ),
      })),
    };
  }

  private applyPayloadChanges(payload: AdminSegmentReqDto): void {
    const fareByPair = new Map<string, number>(
      payload.stopPairs.map((pair) => [`${pair.fromStop}-${pair.toStop}`, pair.fare])
    );

    this.allSegments = this.allSegments.map((segment) => {
      if (segment.vehicleTypeSlug !== payload.vehicleType) {
        return segment;
      }

      const key = `${segment.fromStopSlug}-${segment.toStopSlug}`;
      const updatedFare = fareByPair.get(key);

      if (updatedFare === undefined) {
        return segment;
      }

      return {
        ...segment,
        fare: updatedFare,
      };
    });
  }

  private normalizeFareForSave(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0.01;
    }

    return Number(value.toFixed(2));
  }

  private getTranslationLabel(
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label) {
        return translation.label;
      }
    }

    return translations.find((item) => item.label)?.label ?? null;
  }
}
