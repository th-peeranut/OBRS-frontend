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
  AdminTranslationReqDto,
  CreateRoutePayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

interface RouteRow {
  id: number;
  slug: string;
  label: string;
  description: string;
  status: string;
  statusCode: string;
  updatedAt: string;
}

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

interface Option {
  code: string;
  label: string;
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
  protected routes: RouteRow[] = [];
  protected filteredRoutes: RouteRow[] = [];
  protected selectedRoute: RouteRow | null = null;
  protected selectedRouteSlug = '';

  protected stops: StopPoint[] = [];
  protected allSegments: SegmentRow[] = [];
  protected vehicleTypeOptions: VehicleTypeOption[] = [];
  protected statusOptions: Option[] = [];
  protected selectedVehicleTypeSlug = '';
  protected selectedStatusFilter = '';
  protected searchKeyword = '';
  protected segmentSearchTerm = '';

  protected readonly pageSize = 5;
  protected currentPage = 1;

  protected isLoading = false;
  protected isDetailLoading = false;
  protected errorMessage = '';

  protected isRouteFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected routeForEdit: RouteRow | null = null;
  protected routeForDelete: RouteRow | null = null;

  protected isSegmentEditModalOpen = false;
  protected isSavingSegmentEdit = false;
  protected selectedSegment: SegmentRow | null = null;

  protected readonly routeForm: FormGroup;
  protected readonly editSegmentForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.routeForm = this.formBuilder.group({
      slug: [
        '',
        [
          Validators.required,
          Validators.maxLength(50),
          Validators.pattern(/^[a-z0-9_-]+$/),
        ],
      ],
      status: ['', [Validators.required]],
      enLabel: ['', [Validators.required, Validators.maxLength(100)]],
      thLabel: ['', [Validators.maxLength(100)]],
      enDescription: ['', [Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(255)]],
    });

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
    await this.loadRoutesAndOptions();
  }

  protected get totalRoutes(): number {
    return this.routes.length;
  }

  protected get activeRoutes(): number {
    return this.routes.filter((route) => route.statusCode === 'active').length;
  }

  protected get stopCount(): number {
    return this.stops.length;
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

  protected statusClass(status: string): string {
    const normalizedStatus = status.trim().toUpperCase();

    if (normalizedStatus === 'ACTIVE') {
      return 'is-success';
    }

    if (normalizedStatus === 'SUSPENDED' || normalizedStatus.includes('PENDING')) {
      return 'is-warning';
    }

    return 'is-danger';
  }

  protected onSearchKeywordChange(value: string): void {
    this.searchKeyword = String(value ?? '');
    this.applyRouteFilters();
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyRouteFilters();
  }

  protected onSegmentSearchChange(): void {
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

  protected async selectRoute(route: RouteRow): Promise<void> {
    if (this.selectedRouteSlug === route.slug && this.selectedRoute) {
      return;
    }

    this.selectedRoute = route;
    this.selectedRouteSlug = route.slug;
    await this.loadRouteStructureBySlug(route.slug);
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.routeForEdit = null;
    this.routeForm.get('slug')?.enable();
    this.routeForm.reset({
      slug: '',
      status: this.statusOptions[0]?.code ?? 'active',
      enLabel: '',
      thLabel: '',
      enDescription: '',
      thDescription: '',
    });
    this.isRouteFormModalOpen = true;
  }

  protected async openEditModal(route: RouteRow): Promise<void> {
    let routeDetail: AdminRouteDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getRouteBySlug(route.slug));
      routeDetail = response?.data ?? null;
    } catch {
      routeDetail = this.toRouteDtoFallback(route);
    }

    this.isEditMode = true;
    this.routeForEdit = route;
    this.routeForm.get('slug')?.enable();
    this.routeForm.reset({
      slug: routeDetail.slug,
      status: String(routeDetail.status ?? route.statusCode).trim().toLowerCase(),
      enLabel: this.getTranslationLabel(routeDetail.translations, 'en') ?? route.label,
      thLabel: this.getTranslationLabel(routeDetail.translations, 'th') ?? '',
      enDescription: this.getTranslationDescription(routeDetail.translations, 'en') ?? '',
      thDescription: this.getTranslationDescription(routeDetail.translations, 'th') ?? '',
    });
    this.isRouteFormModalOpen = true;
  }

  protected closeRouteFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isRouteFormModalOpen = false;
    this.routeForEdit = null;
    this.routeForm.reset();
  }

  protected openDeleteModal(route: RouteRow): void {
    this.routeForDelete = route;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.routeForDelete = null;
  }

  protected isRouteFieldInvalid(fieldName: string): boolean {
    const field = this.routeForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected isSegmentFieldInvalid(fieldName: string): boolean {
    const field = this.editSegmentForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected async submitRoute(): Promise<void> {
    if (this.routeForm.invalid) {
      this.routeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const previousSlug = this.routeForEdit?.slug ?? '';

    try {
      const payload = this.toRoutePayload();

      if (this.isEditMode && previousSlug) {
        await firstValueFrom(this.adminApiService.updateRouteBySlug(previousSlug, payload));
        this.closeRouteFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
        this.selectedRouteSlug = payload.slug;
      } else {
        await firstValueFrom(this.adminApiService.createRoute(payload));
        this.closeRouteFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
        this.selectedRouteSlug = payload.slug;
      }

      await this.loadRoutesAndOptions();
    } catch {
      this.closeRouteFormModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
    } finally {
      this.isSubmitting = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.routeForDelete) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteRouteBySlug(this.routeForDelete.slug));
      const deletedSlug = this.routeForDelete.slug;
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));

      if (this.selectedRouteSlug === deletedSlug) {
        this.selectedRouteSlug = '';
        this.selectedRoute = null;
        this.stops = [];
        this.allSegments = [];
      }

      await this.loadRoutesAndOptions();
    } catch {
      this.closeDeleteModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  protected openSegmentEditModal(segment: SegmentRow): void {
    this.selectedSegment = segment;
    this.editSegmentForm.reset({
      fare: segment.fare.toFixed(2),
    });
    this.isSegmentEditModalOpen = true;
  }

  protected closeSegmentEditModal(): void {
    if (this.isSavingSegmentEdit) {
      return;
    }

    this.isSegmentEditModalOpen = false;
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
    this.isSavingSegmentEdit = true;
    let isUpdated = false;

    try {
      await firstValueFrom(this.adminApiService.updateSegments(payload));
      this.applyPayloadChanges(payload);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      isUpdated = true;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
    } finally {
      this.isSavingSegmentEdit = false;
      if (isUpdated) {
        this.closeSegmentEditModal();
      }
    }
  }

  protected formatFare(fare: number): string {
    return fare.toFixed(2);
  }

  private async loadRoutesAndOptions(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [routesResponse, lookupsResponse] = await Promise.all([
        firstValueFrom(this.adminApiService.getRoutes()),
        firstValueFrom(this.adminApiService.getLookups()),
      ]);

      const routeDtos = routesResponse?.data ?? [];
      const lookups = lookupsResponse?.data ?? [];

      this.statusOptions = lookups
        .filter((lookup) => lookup.category === 'route_status')
        .map((lookup) => ({
          code: lookup.slug,
          label: this.getTranslationLabel(lookup.translations, 'en') ?? lookup.slug,
        }));

      this.routes = routeDtos.map((route) => this.toRouteRow(route));
      this.syncStatusFilterWithAvailableOptions();
      this.applyRouteFilters();

      const nextRoute =
        this.routes.find((route) => route.slug === this.selectedRouteSlug) ??
        this.filteredRoutes[0] ??
        this.routes[0] ??
        null;

      if (nextRoute) {
        await this.selectRouteForLoad(nextRoute);
      } else {
        this.selectedRoute = null;
        this.selectedRouteSlug = '';
        this.stops = [];
        this.allSegments = [];
        this.vehicleTypeOptions = [];
      }
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_ROUTES_FAILED');
      this.routes = [];
      this.filteredRoutes = [];
      this.selectedRoute = null;
      this.selectedRouteSlug = '';
    } finally {
      this.isLoading = false;
    }
  }

  private async selectRouteForLoad(route: RouteRow): Promise<void> {
    this.selectedRoute = route;
    this.selectedRouteSlug = route.slug;
    await this.loadRouteStructureBySlug(route.slug);
  }

  private async loadRouteStructureBySlug(routeSlug: string): Promise<void> {
    this.isDetailLoading = true;
    this.stops = [];
    this.allSegments = [];
    this.vehicleTypeOptions = [];

    try {
      const [routeStopsResult, segmentsResult] = await Promise.allSettled([
        firstValueFrom(this.adminApiService.getRouteStops(routeSlug)),
        firstValueFrom(this.adminApiService.getSegments(routeSlug)),
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
      }

      if (this.vehicleTypeOptions.length === 0) {
        this.selectedVehicleTypeSlug = '';
      }

      this.currentPage = 1;
    } finally {
      this.isDetailLoading = false;
    }
  }

  private toRoutePayload(): CreateRoutePayload {
    const raw = this.routeForm.getRawValue();
    const translations: AdminTranslationReqDto[] = [
      {
        locale: 'en',
        label: String(raw.enLabel ?? '').trim(),
        description: String(raw.enDescription ?? '').trim() || undefined,
      },
    ];

    const thLabel = String(raw.thLabel ?? '').trim();
    if (thLabel) {
      translations.push({
        locale: 'th',
        label: thLabel,
        description: String(raw.thDescription ?? '').trim() || undefined,
      });
    }

    return {
      slug: String(raw.slug ?? '').trim().toLowerCase(),
      status: String(raw.status ?? '').trim().toLowerCase(),
      translations,
    };
  }

  private toRouteRow(route: AdminRouteDto): RouteRow {
    const statusCode = String(route.status ?? 'unknown').trim().toLowerCase();
    const statusLabel = statusCode.replace(/_/g, ' ').toUpperCase();

    return {
      id: route.id,
      slug: route.slug,
      label: this.getTranslationLabel(route.translations, 'en') ?? route.slug,
      description: this.getTranslationDescription(route.translations, 'en') ?? '-',
      status: statusLabel,
      statusCode,
      updatedAt: this.formatDateTime(route.updatedAt ?? route.createdAt),
    };
  }

  private toRouteDtoFallback(route: RouteRow): AdminRouteDto {
    return {
      id: route.id,
      slug: route.slug,
      status: route.statusCode,
      translations: [
        {
          locale: 'en',
          label: route.label,
          description: route.description === '-' ? undefined : route.description,
        },
      ],
    };
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
        index === 0
          ? this.translate.instant('ADMIN.ROUTES.ORIGIN')
          : index === sortedStops.length - 1
            ? this.translate.instant('ADMIN.ROUTES.TERMINAL')
            : undefined,
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

  private applyRouteFilters(): void {
    const statusFilter = this.selectedStatusFilter;
    const keyword = this.searchKeyword.trim().toLowerCase();

    this.filteredRoutes = this.routes.filter((route) => {
      const matchStatus =
        statusFilter.length === 0 ||
        route.statusCode.trim().toLowerCase() === statusFilter;
      if (!matchStatus) {
        return false;
      }

      if (keyword.length === 0) {
        return true;
      }

      return [route.slug, route.label, route.description, route.status]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (
      this.selectedStatusFilter &&
      !this.statusOptions.some(
        (option) => option.code.trim().toLowerCase() === this.selectedStatusFilter
      )
    ) {
      this.selectedStatusFilter = '';
    }
  }

  private normalizeFareForSave(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0.01;
    }

    return Number(value.toFixed(2));
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
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

  private getTranslationDescription(
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

      if (translation?.description) {
        return translation.description;
      }
    }

    return translations.find((item) => item.description)?.description ?? null;
  }
}
