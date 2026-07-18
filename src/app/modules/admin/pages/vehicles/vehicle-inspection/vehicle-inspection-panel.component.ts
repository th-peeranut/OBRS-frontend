import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  VehicleInspectionListItemDto,
} from '../../../../../services/admin/admin-api.service';
import { VehicleInspectionHistoryStore } from './vehicle-inspection-history.store';
import {
  InspectionDetailRow,
  InspectionHistoryRow,
  filterInspectionRowsByWindow,
  toInspectionDetailRows,
  toInspectionHistoryRow,
} from './vehicle-inspection.mappers';

/**
 * OBRS-312: the vehicles-page "Inspections" tab panel — read-only (no
 * Add/Edit/Delete; inspections are immutable and only drivers create them).
 * Self-sufficient — owns its own `VehicleInspectionHistoryStore` instance
 * (component-scoped, mirroring `AppVehicleMaintenancePanelComponent`) and
 * calls `AdminApiService` directly.
 *
 * **Single-owner re-bind contract**: only `ngOnChanges` calls
 * `store.setVehicleId()` + `refresh()`. The host must NOT call
 * `store.setVehicleId()` itself.
 */
@Component({
  selector: 'app-vehicle-inspection-panel',
  templateUrl: './vehicle-inspection-panel.component.html',
  styleUrl: './vehicle-inspection-panel.component.scss',
  providers: [VehicleInspectionHistoryStore],
})
export class AppVehicleInspectionPanelComponent implements OnChanges, OnInit, OnDestroy {
  @Input() vehicleId!: number;
  @Input() vehicleLabel = '';

  protected rows: InspectionHistoryRow[] = [];
  protected filteredRows: InspectionHistoryRow[] = [];
  protected showAll = false;
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected isDetailModalOpen = false;
  protected selectedRow: InspectionHistoryRow | null = null;
  protected detailRows: InspectionDetailRow[] = [];
  protected isDetailLoading = false;
  protected detailErrorMessage = '';

  // Raw DTOs from the store, kept separate from `rows` so a language change
  // re-derives `inspectedAtDisplay` from source instead of re-formatting an
  // already-localized string (mirrors AppVehicleMaintenancePanelComponent's
  // rawRecords/rows split).
  private rawRecords: VehicleInspectionListItemDto[] = [];
  private readonly subscriptions = new Subscription();
  // Guards the optimistically-open detail modal against the user opening a
  // DIFFERENT row before the in-flight detail fetch resolves — incremented on
  // every open/close so a stale response is discarded rather than clobbering
  // whatever is now displayed.
  private detailRequestToken = 0;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly translate: TranslateService,
    protected readonly store: VehicleInspectionHistoryStore
  ) {
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.applyLocalization())
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['vehicleId']) {
      this.store.setVehicleId(this.vehicleId);
      void this.store.refresh();
    }
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        this.rawRecords = data ?? [];
        this.applyLocalization();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_INSPECTIONS_FAILED')
            : '';
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /** 200 + [] — replaces the whole table section, not a zero-row table. */
  protected get isEmpty(): boolean {
    return !this.isLoading && !this.errorMessage && this.filteredRows.length === 0;
  }

  protected trackById(_index: number, item: InspectionHistoryRow): number {
    return item.id;
  }

  protected toggleShowAll(): void {
    this.showAll = !this.showAll;
    this.applyFilter();
  }

  // Opens optimistically — the row already in hand seeds the header
  // synchronously; the body spinner covers only the items fetch.
  protected openDetail(row: InspectionHistoryRow): void {
    this.isDetailModalOpen = true;
    this.selectedRow = row;
    this.detailRows = [];
    this.detailErrorMessage = '';
    this.isDetailLoading = true;

    const requestToken = ++this.detailRequestToken;
    firstValueFrom(this.adminApiService.getVehicleInspectionById(this.vehicleId, row.id))
      .then((response) => {
        if (requestToken !== this.detailRequestToken) {
          return; // superseded by opening a different row (or closing) meanwhile
        }
        this.detailRows = toInspectionDetailRows(response?.data?.items ?? []);
        this.isDetailLoading = false;
      })
      .catch(() => {
        if (requestToken !== this.detailRequestToken) {
          return;
        }
        this.detailErrorMessage = this.translate.instant(
          'ADMIN.VEHICLES.INSPECTION.DETAIL_LOAD_FAILED'
        );
        this.isDetailLoading = false;
      });
  }

  protected closeDetailModal(): void {
    this.isDetailModalOpen = false;
    this.selectedRow = null;
    this.detailRows = [];
    this.detailErrorMessage = '';
    this.detailRequestToken++; // invalidate any still-in-flight fetch
  }

  private applyLocalization(): void {
    this.rows = this.rawRecords.map((dto) => toInspectionHistoryRow(dto, this.translate.currentLang));
    this.applyFilter();
  }

  private applyFilter(): void {
    this.filteredRows = filterInspectionRowsByWindow(this.rows, this.showAll);
  }
}
