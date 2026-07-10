import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { RoutesStore } from './routes.store';
import {
  Option,
  RouteRow,
  SegmentRow,
  StopPoint,
  VehicleTypeOption,
  formatFare as formatFareValue,
  normalizeVehicleTypeKey,
  parseStatus,
  statusClass as statusClassValue,
  toRouteDtoFallback,
  toRoutePayload,
  toRouteRow,
  toRouteStatusOptions,
  toSegmentUpdatePayload,
  toSegments,
  toStopPoints,
  toVehicleTypeOptions,
} from './routes.mappers';

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
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected isDetailLoading = false;
  protected errorMessage = '';

  protected isRouteFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected routeForEdit: RouteRow | null = null;
  protected routeForDelete: RouteRow | null = null;

  protected isSegmentEditModalOpen = false;
  protected isSavingSegmentEdit = false;
  protected selectedSegment: SegmentRow | null = null;

  protected readonly routeForm: FormGroup;
  protected readonly editSegmentForm: FormGroup;
  @ViewChild('routeDetailSection') private routeDetailSection?: ElementRef<HTMLElement>;
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
      thLabel: ['', [Validators.required, Validators.maxLength(100)]],
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
        this.refreshFailed = failed && this.store.hasValue;
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

  protected trackByRouteId(_index: number, item: RouteRow): number {
    return item.id;
  }

  protected trackByStopSlug(_index: number, stop: StopPoint): string {
    return stop.slug;
  }

  protected trackBySegmentId(_index: number, segment: SegmentRow): number {
    return segment.id;
  }

  protected statusClass(status: string): string {
    return statusClassValue(status);
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
    const normalizedValue = normalizeVehicleTypeKey(value);
    const matchedOption = this.vehicleTypeOptions.find(
      (option) =>
        normalizeVehicleTypeKey(option.slug) === normalizedValue ||
        normalizeVehicleTypeKey(option.name) === normalizedValue
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
    // The detail panel renders below the route table and a route is already
    // auto-selected on load, so without scrolling the View action looks like it
    // "does nothing". Always bring the panel into view; only (re)load the
    // structure when the selection actually changes.
    const alreadyLoaded = this.selectedRouteSlug === route.slug && !!this.selectedRoute;

    this.selectedRoute = route;
    this.selectedRouteSlug = route.slug;
    this.scrollDetailIntoView();

    if (!alreadyLoaded) {
      await this.loadRouteStructureBySlug(route.slug);
    }
  }

  private scrollDetailIntoView(): void {
    // Defer to the next tick so the *ngIf detail panel is in the DOM before we
    // scroll to it (it may have been hidden when no route was selected).
    setTimeout(() => {
      this.routeDetailSection?.nativeElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
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
    // Open the modal immediately with the row data we already hold, so it
    // appears without waiting on the (possibly slow) detail fetch. The server
    // detail (Thai translations, full description) is patched in once it
    // arrives — see the fetch below.
    this.isEditMode = true;
    this.routeForEdit = route;
    this.isEditDetailLoading = true;
    this.routeForm.get('slug')?.enable();
    this.applyRouteFormValues(toRouteDtoFallback(route), route);
    this.isRouteFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getRouteById(route.id));
      const routeDetail = response.data;
      // Ignore a stale response if the user has closed the modal or moved on
      // to editing a different route in the meantime.
      if (routeDetail && this.isRouteFormModalOpen && this.routeForEdit?.id === route.id) {
        this.applyRouteFormValues(routeDetail, route, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      // Only clear the loading hint if this fetch is still the current one —
      // a stale response (modal closed, or switched to another route) must not
      // turn off the hint for a different in-flight detail fetch.
      if (this.isRouteFormModalOpen && this.routeForEdit?.id === route.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the route form from a DTO. When `onlyPristine` is set (the late
  // detail patch), only controls the user hasn't started editing are filled,
  // so the arriving server data never clobbers in-progress input.
  private applyRouteFormValues(
    routeDetail: AdminRouteDto,
    route: RouteRow,
    onlyPristine = false
  ): void {
    const values = {
      slug: routeDetail.slug,
      status: parseStatus(routeDetail.status ?? route.statusCode, this.getCurrentLocale()).code,
      enLabel: getAdminTranslationLabel(routeDetail.translations, 'en') ?? route.label,
      thLabel: getAdminTranslationLabel(routeDetail.translations, 'th') ?? '',
      enDescription: getAdminTranslationDescription(routeDetail.translations, 'en') ?? '',
      thDescription: getAdminTranslationDescription(routeDetail.translations, 'th') ?? '',
    };

    if (!onlyPristine) {
      this.routeForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.routeForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  protected closeRouteFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isRouteFormModalOpen = false;
    this.isEditDetailLoading = false;
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
      const payload = toRoutePayload(this.routeForm.getRawValue());

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
    } catch (error) {
      this.closeRouteFormModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
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
      // Capture before closeDeleteModal clears routeForDelete.
      const deletedId = this.routeForDelete.id;
      const deletedSlug = this.routeForDelete.slug;
      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      this.store.mutate((d) => ({ ...d, routes: d.routes.filter((r) => r.id !== deletedId) }));
      this.closeDeleteModal(true);

      if (this.selectedRouteSlug === deletedSlug) {
        this.selectedRouteSlug = '';
        this.selectedRoute = null;
        this.stops = [];
        this.allSegments = [];
      }

      // Overlap the table revalidate with the success dialog.
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await refresh;
    } catch (error) {
      this.closeDeleteModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
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

    const payload = toSegmentUpdatePayload(
      this.selectedSegment,
      editedFromStopSlug,
      editedToStopSlug,
      newFare,
      estimatedDurationMinutes,
      this.allSegments,
      this.selectedRouteSlug
    );
    this.isSavingSegmentEdit = true;
    let isUpdated = false;

    try {
      await firstValueFrom(this.adminApiService.updateSegments(payload));
      await this.loadRouteStructureBySlug(this.selectedRouteSlug);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      isUpdated = true;
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSavingSegmentEdit = false;
      if (isUpdated) {
        this.closeSegmentEditModal();
      }
    }
  }

  protected formatFare(fare: number): string {
    return formatFareValue(fare);
  }

  // Re-derive the locale-dependent route list + status options from cached DTOs.
  private applyRouteListLocalization(): void {
    const currentLocale = this.getCurrentLocale();
    this.routes = this.rawRouteDtos.map((route) =>
      toRouteRow(route, currentLocale, this.translate.currentLang)
    );
    this.statusOptions = toRouteStatusOptions(this.rawLookups, this.rawRouteDtos, currentLocale);
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

      const currentLocale = this.getCurrentLocale();

      if (routeStopsResult.status === 'fulfilled') {
        this.stops = toStopPoints(routeStopsResult.value.data, currentLocale, {
          origin: this.translate.instant('ADMIN.ROUTES.ORIGIN'),
          terminal: this.translate.instant('ADMIN.ROUTES.TERMINAL'),
        });
      }

      if (segmentsResult.status === 'fulfilled') {
        this.allSegments = toSegments(segmentsResult.value.data, currentLocale);
        this.vehicleTypeOptions = toVehicleTypeOptions(this.allSegments);

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
      }

      if (this.vehicleTypeOptions.length === 0) {
        this.selectedVehicleTypeSlug = '';
      }

      this.currentPage = 1;
    } finally {
      this.isDetailLoading = false;
    }
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

}
