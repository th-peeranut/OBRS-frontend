import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminRouteStopDto,
  AdminSegmentDto,
  AdminSegmentReqDto,
  AdminStopDto,
  AdminStatusDto,
  AdminTranslationCollection,
  AdminTranslationReqDto,
  CreateRoutePayload,
  getAdminLookupCode,
  getAdminLookupLabel,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';
import { RoutesStore } from './routes.store';

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
  slug: string;
  name: string;
  distance: string;
  duration: string;
  stopOrder: number;
  offsetMinutesFromOrigin: number;
  label?: string;
}

interface SegmentRow {
  id: number;
  origin: string;
  destination: string;
  fare: number;
  duration: string;
  estimatedDurationMinutes: number | null;
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
export class RoutesPageComponent implements OnInit, OnDestroy {
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

  protected isRefreshing = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
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
  private readonly subscriptions = new Subscription();

  private rawRouteDtos: AdminRouteDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: RoutesStore
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
      fromStopSlug: ['', [Validators.required]],
      toStopSlug: ['', [Validators.required]],
      fare: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d+(\.\d{1,2})?$/),
          Validators.min(0.01),
        ],
      ],
      estimatedDurationMinutes: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d+$/),
          Validators.min(1),
        ],
      ],
    });

    // Language change relabels in memory; only the selected route's structure
    // (server-localized stop names) needs a refresh — not the whole route list.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        void this.relocalizeForLanguageChange();
      })
    );
  }

  ngOnInit(): void {
    // Render the cached route list instantly on re-entry, then revalidate.
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.applyRouteListFromCache(data.routes, data.lookups);
        }
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_ROUTES_FAILED');
          this.routes = [];
          this.filteredRoutes = [];
          this.selectedRoute = null;
          this.selectedRouteSlug = '';
        } else {
          this.errorMessage = '';
        }
      })
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  // Derive the localized list from cached DTOs, then keep/select a route. The
  // selected route's structure is only (re)loaded when the selection actually
  // changes, so the cache-replay + background-revalidate emissions don't
  // reload the detail twice on re-entry.
  private applyRouteListFromCache(
    routes: AdminRouteDto[],
    lookups: AdminLookupDto[]
  ): void {
    this.rawRouteDtos = routes;
    this.rawLookups = lookups;
    this.applyRouteListLocalization();

    const nextRoute =
      this.routes.find((route) => route.slug === this.selectedRouteSlug) ??
      this.filteredRoutes[0] ??
      this.routes[0] ??
      null;

    if (!nextRoute) {
      this.selectedRoute = null;
      this.selectedRouteSlug = '';
      this.stops = [];
      this.allSegments = [];
      this.vehicleTypeOptions = [];
      return;
    }

    if (this.selectedRouteSlug !== nextRoute.slug || !this.selectedRoute) {
      void this.selectRouteForLoad(nextRoute);
    } else {
      this.selectedRoute = nextRoute;
    }
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
    const selectedVehicleTypeSlug = this.normalizeVehicleTypeKey(
      this.selectedVehicleTypeSlug
    );

    if (!selectedVehicleTypeSlug) {
      return this.allSegments;
    }

    return this.allSegments.filter(
      (segment) =>
        this.normalizeVehicleTypeKey(segment.vehicleTypeSlug) === selectedVehicleTypeSlug
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

    if (
      normalizedStatus === 'SUSPENDED' ||
      normalizedStatus === 'TEMPORARILY_CLOSED' ||
      normalizedStatus.includes('PENDING')
    ) {
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

  protected onVehicleTypeChange(value: string): void {
    const normalizedValue = this.normalizeVehicleTypeKey(value);
    const matchedOption = this.vehicleTypeOptions.find(
      (option) =>
        this.normalizeVehicleTypeKey(option.slug) === normalizedValue ||
        this.normalizeVehicleTypeKey(option.name) === normalizedValue
    );

    this.selectedVehicleTypeSlug = matchedOption?.slug ?? String(value ?? '').trim();
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
      const response = await firstValueFrom(this.adminApiService.getRouteById(route.id));
      routeDetail = response.data ?? this.toRouteDtoFallback(route);
    } catch {
      routeDetail = this.toRouteDtoFallback(route);
    }

    this.isEditMode = true;
    this.routeForEdit = route;
    this.routeForm.get('slug')?.enable();
    this.routeForm.reset({
      slug: routeDetail.slug,
      status: this.parseStatus(routeDetail.status ?? route.statusCode).code,
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

  protected hasSegmentFieldError(fieldName: string, errorName: string): boolean {
    const field = this.editSegmentForm.get(fieldName);
    return !!field?.hasError(errorName) && (field.dirty || field.touched);
  }

  protected async submitRoute(): Promise<void> {
    if (this.routeForm.invalid) {
      this.routeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const routeIdForEdit = this.routeForEdit?.id ?? null;

    try {
      const payload = this.toRoutePayload();

      if (this.isEditMode && routeIdForEdit !== null) {
        await firstValueFrom(this.adminApiService.updateRouteById(routeIdForEdit, payload));
        this.closeRouteFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
        this.selectedRouteSlug = payload.slug;
      } else {
        await firstValueFrom(this.adminApiService.createRoute(payload));
        this.closeRouteFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
        this.selectedRouteSlug = payload.slug;
      }

      await this.store.refresh();
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
      await firstValueFrom(this.adminApiService.deleteRouteById(this.routeForDelete.id));
      const deletedSlug = this.routeForDelete.slug;
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));

      if (this.selectedRouteSlug === deletedSlug) {
        this.selectedRouteSlug = '';
        this.selectedRoute = null;
        this.stops = [];
        this.allSegments = [];
      }

      await this.store.refresh();
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
      fromStopSlug: segment.fromStopSlug,
      toStopSlug: segment.toStopSlug,
      fare: segment.fare.toFixed(2),
      estimatedDurationMinutes: segment.estimatedDurationMinutes ?? '',
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

    const raw = this.editSegmentForm.getRawValue();
    const editedFromStopSlug = String(raw['fromStopSlug'] ?? '').trim();
    const editedToStopSlug = String(raw['toStopSlug'] ?? '').trim();
    const newFare = Number(raw['fare'] ?? 0);
    const estimatedDurationMinutes = Number(raw['estimatedDurationMinutes'] ?? 0);

    if (!this.validateSegmentStops(editedFromStopSlug, editedToStopSlug)) {
      return;
    }

    const payload = this.toSegmentUpdatePayload(
      this.selectedSegment,
      editedFromStopSlug,
      editedToStopSlug,
      newFare,
      estimatedDurationMinutes
    );
    this.isSavingSegmentEdit = true;
    let isUpdated = false;

    try {
      await firstValueFrom(this.adminApiService.updateSegments(payload));
      await this.loadRouteStructureBySlug(this.selectedRouteSlug);
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

  // Re-derive the locale-dependent route list + status options from cached DTOs.
  private applyRouteListLocalization(): void {
    const currentLocale = this.getCurrentLocale();
    this.routes = this.rawRouteDtos.map((route) => this.toRouteRow(route));
    this.statusOptions = this.toRouteStatusOptions(
      this.rawLookups,
      this.rawRouteDtos,
      currentLocale
    );
    this.syncStatusFilterWithAvailableOptions();
    this.applyRouteFilters();
  }

  // On language change: relabel the list instantly from memory, then refresh only
  // the selected route's structure (stops/segments carry server-localized names) —
  // far lighter than re-fetching the full route + lookup lists.
  private async relocalizeForLanguageChange(): Promise<void> {
    this.applyRouteListLocalization();

    const selectedSlug =
      this.routes.find((route) => route.slug === this.selectedRouteSlug)?.slug ?? '';

    if (selectedSlug) {
      await this.loadRouteStructureBySlug(selectedSlug);
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
            (option) =>
              this.normalizeVehicleTypeKey(option.slug) ===
              this.normalizeVehicleTypeKey(this.selectedVehicleTypeSlug)
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

  private toRouteStatusOptions(
    lookups: AdminLookupDto[],
    routes: AdminRouteDto[],
    currentLocale: string
  ): Option[] {
    const options = new Map<string, string>();
    const knownRouteStatuses = [
      'active',
      'suspended',
      'temporarily_closed',
      'decommissioned',
    ];

    for (const status of knownRouteStatuses) {
      options.set(status, this.formatStatusLabel(status));
    }

    for (const lookup of lookups) {
      if (lookup.category !== 'route_status') {
        continue;
      }

      const code = String(lookup.slug ?? '').trim().toLowerCase();
      if (!code) {
        continue;
      }

      options.set(
        code,
        this.getTranslationLabel(lookup.translations, currentLocale) ??
          this.getTranslationLabel(lookup.translations, 'en') ??
          this.formatStatusLabel(code)
      );
    }

    for (const route of routes) {
      const status = this.parseStatus(route.status);
      if (status.code && status.code !== 'unknown' && !options.has(status.code)) {
        options.set(status.code, status.name);
      }
    }

    return [...options.entries()].map(([code, label]) => ({ code, label }));
  }

  private toRouteRow(route: AdminRouteDto): RouteRow {
    const status = this.parseStatus(route.status);
    const currentLocale = this.getCurrentLocale();

    return {
      id: route.id,
      slug: route.slug,
      label:
        getAdminLookupLabel(route, currentLocale) ??
        this.getTranslationLabel(route.translations, currentLocale) ??
        this.getTranslationLabel(route.translations, 'en') ??
        route.slug,
      description:
        this.getTranslationDescription(route.translations, currentLocale) ??
        this.getTranslationDescription(route.translations, 'en') ??
        '-',
      status: status.name,
      statusCode: status.code,
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

    const currentLocale = this.getCurrentLocale();

    const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);

    return sortedStops.map((stop, index) => ({
      slug: getAdminLookupCode(stop.stop),
      name: this.toStopName(stop.stop, currentLocale),
      distance: `${stop.distanceKmFromOrigin ?? 0} km`,
      duration: `${stop.offsetMinutesFromOrigin ?? 0} mins`,
      stopOrder: stop.stopOrder,
      offsetMinutesFromOrigin: Number(stop.offsetMinutesFromOrigin ?? 0),
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
        duration: this.formatDuration(pair.estimatedDurationMinutes),
        estimatedDurationMinutes: this.normalizeDurationMinutes(
          pair.estimatedDurationMinutes
        ),
        fromStopSlug: pair.fromStop?.slug ?? '',
        toStopSlug: pair.toStop?.slug ?? '',
        vehicleTypeSlug: String(pair.vehicleType?.slug ?? '').trim(),
        vehicleTypeName: pair.vehicleType?.name ?? pair.vehicleType?.slug ?? '-',
      };
    });
  }

  private toStopName(stop: AdminStopDto | undefined, locale: string): string {
    const name =
      getAdminLookupLabel(stop, locale) ??
      this.getTranslationLabel(stop?.translations, locale) ??
      this.getTranslationLabel(stop?.translations, 'en') ??
      getAdminLookupCode(stop);

    return name || '-';
  }

  private toVehicleTypeOptions(segments: SegmentRow[]): VehicleTypeOption[] {
    const options = new Map<string, VehicleTypeOption>();

    for (const segment of segments) {
      const normalizedSlug = this.normalizeVehicleTypeKey(segment.vehicleTypeSlug);
      if (!normalizedSlug) {
        continue;
      }

      if (!options.has(normalizedSlug)) {
        options.set(normalizedSlug, {
          slug: segment.vehicleTypeSlug,
          name: segment.vehicleTypeName,
        });
      }
    }

    return [...options.values()];
  }

  private toSegmentUpdatePayload(
    selectedSegment: SegmentRow,
    editedFromStopSlug: string,
    editedToStopSlug: string,
    editedFare: number,
    estimatedDurationMinutes: number
  ): AdminSegmentReqDto {
    const segmentsOfVehicleType = this.allSegments.filter(
      (segment) =>
        this.normalizeVehicleTypeKey(segment.vehicleTypeSlug) ===
        this.normalizeVehicleTypeKey(selectedSegment.vehicleTypeSlug)
    );

    return {
      route: this.selectedRouteSlug,
      vehicleType: selectedSegment.vehicleTypeSlug,
      stopPairs: segmentsOfVehicleType.map((segment) => {
        const isEditedSegment = segment.id === selectedSegment.id;

        return {
          fromStop: isEditedSegment ? editedFromStopSlug : segment.fromStopSlug,
          toStop: isEditedSegment ? editedToStopSlug : segment.toStopSlug,
          fare: this.normalizeFareForSave(
            isEditedSegment ? editedFare : segment.fare
          ),
          estimatedDurationMinutes: isEditedSegment
            ? this.normalizeDurationForSave(estimatedDurationMinutes)
            : undefined,
        };
      }),
    };
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

  private normalizeDurationForSave(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }

    return Math.round(value);
  }

  private normalizeDurationMinutes(value: number | null | undefined): number | null {
    if (!Number.isFinite(value) || value === null || value === undefined) {
      return null;
    }

    return Math.max(0, Math.round(value));
  }

  private validateSegmentStops(fromStopSlug: string, toStopSlug: string): boolean {
    const fromStop = this.getStopPointBySlug(fromStopSlug);
    const toStop = this.getStopPointBySlug(toStopSlug);
    const toStopControl = this.editSegmentForm.get('toStopSlug');

    if (!fromStop || !toStop) {
      toStopControl?.setErrors({ required: true });
      toStopControl?.markAsTouched();
      return false;
    }

    if (fromStop.slug === toStop.slug) {
      toStopControl?.setErrors({ sameStop: true });
      toStopControl?.markAsTouched();
      return false;
    }

    if (toStop.stopOrder <= fromStop.stopOrder) {
      toStopControl?.setErrors({ stopOrder: true });
      toStopControl?.markAsTouched();
      return false;
    }

    return true;
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

  private formatDuration(minutes: number | null | undefined): string {
    if (!Number.isFinite(minutes) || minutes === null || minutes === undefined) {
      return '-';
    }

    const normalizedMinutes = Math.max(0, Math.round(minutes));
    const hours = Math.floor(normalizedMinutes / 60);
    const remainingMinutes = normalizedMinutes % 60;
    const currentLocale = this.getCurrentLocale();

    if (currentLocale === 'th') {
      if (hours > 0 && remainingMinutes > 0) {
        return `${hours} ชม. ${remainingMinutes} นาที`;
      }

      if (hours > 0) {
        return `${hours} ชม.`;
      }

      return `${remainingMinutes} นาที`;
    }

    if (hours > 0 && remainingMinutes > 0) {
      return `${hours} hr ${remainingMinutes} min`;
    }

    if (hours > 0) {
      return `${hours} hr`;
    }

    return `${remainingMinutes} min`;
  }

  private formatStatusLabel(status: string): string {
    return status.replace(/_/g, ' ').toUpperCase();
  }

  private normalizeVehicleTypeKey(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private getStopPointBySlug(slug: string): StopPoint | undefined {
    const normalizedSlug = String(slug ?? '').trim();
    return this.stops.find((stop) => stop.slug === normalizedSlug);
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private getTranslationLabel(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationLabel(translations, locale);
  }

  private getTranslationDescription(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationDescription(translations, locale);
  }

  private parseStatus(value: string | AdminStatusDto | null | undefined): {
    code: string;
    name: string;
  } {
    return parseAdminStatus(value, this.getCurrentLocale());
  }
}
