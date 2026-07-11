import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { RoutesStore } from './routes.store';
import { RouteFormModalComponent } from './route-form-modal/route-form-modal.component';
import { SegmentEditModalComponent } from './segment-edit-modal/segment-edit-modal.component';
import {
  Option,
  RouteRow,
  SegmentRow,
  StopPoint,
  toRouteRow,
  toRouteStatusOptions,
  toSegments,
  toStopPoints,
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
  protected statusOptions: Option[] = [];
  protected selectedStatusFilter = '';
  protected searchKeyword = '';

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected isDetailLoading = false;
  protected errorMessage = '';

  protected isDeleteModalOpen = false;
  protected isDeleting = false;
  protected routeForDelete: RouteRow | null = null;

  // Bound reloader passed to the segment edit modal so it can refresh the
  // parent's route structure after a successful save (arrow closes over
  // `this`, so `loadRouteStructureBySlug` may stay private).
  protected readonly reloadStructureBound = () =>
    this.loadRouteStructureBySlug(this.selectedRouteSlug);

  @ViewChild('routeDetailSection', { read: ElementRef })
  private routeDetailSection?: ElementRef<HTMLElement>;
  @ViewChild(RouteFormModalComponent) private routeFormModal!: RouteFormModalComponent;
  @ViewChild(SegmentEditModalComponent) private segmentEditModal!: SegmentEditModalComponent;
  private readonly subscriptions = new Subscription();

  private rawRouteDtos: AdminRouteDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: RoutesStore
  ) {
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

  protected onSearchKeywordChange(value: string): void {
    this.searchKeyword = String(value ?? '');
    this.applyRouteFilters();
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyRouteFilters();
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
    this.routeFormModal.openCreate();
  }

  protected openEditModal(route: RouteRow): void {
    void this.routeFormModal.openEdit(route);
  }

  // Bound to the child modal's `(saved)` output — this is exactly the old
  // post-submit tail from `submitRoute`: set the slug first, then refresh.
  protected async onRouteSaved(event: { slug: string }): Promise<void> {
    this.selectedRouteSlug = event.slug;
    await this.store.refresh();
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
    this.segmentEditModal.open(segment);
  }

  protected onSegmentSaved(): void {
    // No page-local state to update — the child already reloaded the route
    // structure it's bound to via `reloadStructureBound` before closing.
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
      }
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

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

}
